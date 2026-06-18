"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useEngine } from "../context/EngineContext";

interface EventItem {
  id: string;
  title: string;
  event_date: string;
  description: string;
  service_type?: string;
}

interface TeamMemberAllocation {
  id: string;
  event_id: string;
  user_id: string;
  role: string;
}

// 180+ Curated global greetings from formal to informal/slang
const GLOBAL_GREETINGS_DICTIONARY = [
  "Shalom", "Mabuhay", "Kamusta", "Aloha", "Kia Ora", "Namaste", "Hola", "Bonjour", "Ciao", "Konnichiwa",
  "Annyeong", "Merhaba", "Ahlan", "Sawasdee", "Jambo", "Zdravo", "Privet", "Guten Tag", "G'day", "Salut",
  "Nǐ Hǎo", "Shada", "Wazza", "Yo", "Howdy", "What's up", "Ahoj", "Ahalan", "Sveiki", "Hej",
  "Goddag", "Yasas", "Hujambo", "Selam", "Bula", "Talofa", "Moni", "Grüss Gott", "Servus", "Chao",
  "Vanakkam", "Asalaam Alaykum", "Sat Sri Akal", "Kuzu Zangpo", "Mingalaba", "Suosdei", "Sabaidee", "Xin Chào", "Niltze", "Allianllachu",
  "Moïen", "Dia Duit", "Halo", "Bongu", "Tere", "Tere", "Szia", "Sveiki", "Labas", "Zdraveite",
  "Czesc", "Witamy", "Dobry Dan", "Dzien Dobry", "Ahoj", "Zdravo", "Zivijo", "Bunã", "Privet", "Salam",
  "Barev", "Gamarjoba", "Salamat", "Kaixo", "Ongi Etorri", "Ola", "Boas", "Ey", "Sup", "Watchya",
  "Alright", "Ahoy", "Cheerio", "Hiya", "Cheers", "Greetings", "Welcome", "Good Day", "Top of the morning", "What's crackin",
  "How's tricks", "What's the word", "How's it going", "What's new", "How's life", "Good to see you", "Long time no see", "Look what the cat dragged in", "How fare you", "Hail",
  "Well met", "Peace be with you", "Blessings", "Grace", "Marhaban", "Marhaba", "Yallah", "Ahlan Wa Sahlan", "Marhaban Bik", "Kehal",
  "Ete", "Nda", "Moyo", "Mambo", "Vipi", "Sasa", "Niaje", "Oya", "Ariba", "Que pasa",
  "Que tal", "Buenas", "Buenas Tardes", "Ostia", "Apa Kabar", "G’day Mate", "How ya goin", "Rad", "Epic", "Stoked",
  "Aluu", "Inuujunga", "Qanuipit", "Khow", "Shwmae", "Helo", "Halò", "Failte", "Hwyl", "Ayo",
  "Hoy", "Heisan", "Moin", "Moin Moin", "Tach", "Maje", "Wassup", "Whadup", "Guwop", "Guten Morgen",
  "Morgen", "Nabend", "Nite", "Hi", "Hello", "How goes it", "What's standard", "Safe", "Bless", "Whagwan",
  "Wah gwaan", "Zion", "Hosanna", "Hallelujah", "Amen", "Maranatha", "Selah", "Ebenezer", "Emmanuel", "Kyrie"
];

const FALLBACK_VERSES = [
  { text: "I can do all things through Christ who strengthens me.", reference: "Philippians 4:13" },
  { text: "For God has not given us a spirit of fear, but of power and of love and of a sound mind.", reference: "2 Timothy 1:7" },
  { text: "Trust in the Lord with all your heart, and lean not on your own understanding.", reference: "Proverbs 3:5" },
  { text: "The Lord is my light and my salvation; whom shall I fear?", reference: "Psalm 27:1" },
  { text: "But seek first the kingdom of God and His righteousness, and all these things shall be added to you.", reference: "Matthew 6:33" }
];

export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();
  
  // ✅ SURGICAL FIX: Extract userTeamId and activeRole from the Engine
  const { simulatedRole, simulatedUserId, userTeamId, activeRole } = useEngine();

  const [loading, setLoading] = useState(true);
  const [eventsList, setEventsList] = useState<EventItem[]>([]);
  const [allocationsList, setAllocationsList] = useState<TeamMemberAllocation[]>([]);
  const [userName, setUserName] = useState("Worshipper");
  
  // Daily Synchronized Shared Inspiration States
  const [currentGreeting, setCurrentGreeting] = useState("Shalom");
  const [dailyVerse, setDailyVerse] = useState({ text: "Loading daily word...", reference: "" });
  
  // Bookmarks Matrix States
  const [allSongs, setAllSongs] = useState<any[]>([]);
  const [bookmarkedSongIds, setBookmarkedSongIds] = useState<string[]>([]);
  const [isBookmarksModalOpen, setIsBookmarksModalOpen] = useState(false);
  const [bookmarkSearchQuery, setBookmarkSearchQuery] = useState("");

  async function loadDashboardMetrics() {
    try {
      // 1. Calculate Greeting Locally
      const dayOfYearHash = Math.floor(Date.now() / 86400000);
      const greetingIndex = dayOfYearHash % GLOBAL_GREETINGS_DICTIONARY.length;
      setCurrentGreeting(GLOBAL_GREETINGS_DICTIONARY[greetingIndex]);

      // 2. Fetch Daily Verse
      const todayString = new Date().toISOString().split("T")[0];
      const { data: inspirationData } = await supabase
        .from("daily_inspiration")
        .select("verse_text, verse_reference")
        .eq("target_date", todayString)
        .maybeSingle();

      if (inspirationData) {
        setDailyVerse({
          text: inspirationData.verse_text,
          reference: inspirationData.verse_reference
        });
      } else {
        const verseIndex = dayOfYearHash % FALLBACK_VERSES.length;
        setDailyVerse(FALLBACK_VERSES[verseIndex]);
      }

      // ✅ 3. PHASE 3 FILTER: Fetch events strictly bound to the active user's Team ID
      if (userTeamId) {
        const { data: eventsData, error: eventsErr } = await supabase
          .from("events")
          .select("*")
          .eq("team_id", userTeamId); // 🎯 THE MULTI-TENANCY LOCK
          
        if (!eventsErr && eventsData) setEventsList(eventsData);
      } else {
        setEventsList([]); // Clear if no team exists to prevent data leaks
      }

      // 4. Fetch roster assignments
      const { data: rosterData, error: rosterErr } = await supabase
        .from("team_members")
        .select("*");
      if (!rosterErr && rosterData) setAllocationsList(rosterData);

      // 5. Fetch name details and bookmark profiles
      if (simulatedUserId && simulatedUserId !== "00000000-0000-0000-0000-000000000000") {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, bookmarked_songs")
          .eq("id", simulatedUserId)
          .maybeSingle();
        
        setUserName(profileData?.full_name ? profileData.full_name.split(" ")[0] : "Worshipper");
        setBookmarkedSongIds(profileData?.bookmarked_songs || []);
      }

      // 6. Fetch master song index
      const { data: songsData } = await supabase.from("songs").select("*");
      setAllSongs(songsData || []);

    } catch (err) {
      console.error("Dashboard metrics pipeline fault:", err);
    } finally {
      setLoading(false);
    }
  }

  // ✅ Trigger refresh if team context changes
  useEffect(() => {
    loadDashboardMetrics();
  }, [simulatedUserId, simulatedRole, userTeamId]); 

  // ==========================================
  // --- CHRONOLOGICAL DATA MATRICES SELECTION -
  // ==========================================
  const todayStr = new Date().toISOString().split("T")[0];

  const futureActiveEvents = eventsList
    .filter(e => (e.event_date ? e.event_date.split("T")[0] : "2026-06-12") >= todayStr)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  const upcomingEventsSectionData = futureActiveEvents.slice(0, 5);

  const userAssignedActivePlans = futureActiveEvents.filter(evt =>
    allocationsList.some(member => member.event_id === evt.id && member.user_id === simulatedUserId)
  );

  const filteredBookmarkedSongs = allSongs.filter(song => 
    bookmarkedSongIds.includes(song.id) &&
    (song.title?.toLowerCase().includes(bookmarkSearchQuery.toLowerCase()) ||
     song.artist?.toLowerCase().includes(bookmarkSearchQuery.toLowerCase()))
  );

  if (loading) return <div className="p-4 md:p-8 text-center text-xs font-black uppercase tracking-widest text-zinc-400 animate-pulse">Synchronizing Dashboard Matrix...</div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-4 md:space-y-8 animate-in fade-in duration-150">
      
      {/* MASTER HERO HEADER CONTAINER BLOCK */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="space-y-1.5">
          <h2 className="text-xl md:text-3xl font-black tracking-tight text-zinc-900">
            {currentGreeting}, {userName}! 👋
          </h2>
          <p className="text-zinc-400 text-[11px] md:text-xs font-bold leading-relaxed max-w-xl italic">
            "{dailyVerse.text}" {dailyVerse.reference && <span className="text-blue-600 font-black not-italic ml-0.5">— {dailyVerse.reference}</span>}
          </p>
        </div>

        <div className="py-0.5">
          <button
            type="button"
            onClick={() => { setBookmarkSearchQuery(""); setIsBookmarksModalOpen(true); }}
            className="px-5 py-2.5 bg-zinc-50 border border-zinc-200 text-zinc-800 hover:bg-blue-600 hover:text-white hover:border-blue-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm shrink-0 cursor-pointer text-center"
          >
            {bookmarkedSongIds.length} SONGS BOOKMARKED
          </button>
        </div>

        {/* Statistics Metadata Rows */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-black uppercase tracking-wider text-zinc-400 select-none pt-3 md:pt-4 border-t border-zinc-100">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Active: <span className="text-zinc-800">{userAssignedActivePlans.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
            Total Events: <span className="text-zinc-800">{futureActiveEvents.length}</span>
          </div>
        </div>
      </div>

      {/* MULTI-COLUMN WORKSPACE CANVAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8 items-start">
        
        {/* COLUMN LAYOUT 1 & 2: MY ACTIVE PLANS */}
        <div className="lg:col-span-2 space-y-2 md:space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-1.5 select-none">
            <h3 className="text-[11px] md:text-sm font-black text-zinc-900 uppercase tracking-wider">
              My Active Plans ({userAssignedActivePlans.length})
            </h3>
            <span className="text-[9px] bg-blue-50 text-blue-600 font-black tracking-widest uppercase px-2 py-0.5 rounded border border-blue-100">
              Assigned Only
            </span>
          </div>

          <div className="space-y-2 md:space-y-4">
            {userAssignedActivePlans.map((evt) => {
              const myRoleAssignment = allocationsList.find(
                m => m.event_id === evt.id && m.user_id === simulatedUserId
              );

              return (
                <div 
                  key={evt.id}
                  className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-5 hover:border-blue-500 transition-all group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="bg-zinc-950 text-white font-mono font-black text-[8px] md:text-[9px] uppercase tracking-widest px-2 py-0.5 rounded">
                        📅 {evt.event_date ? evt.event_date.split("T")[0] : "2026-06-12"}
                      </span>
                      {myRoleAssignment && (
                        <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 font-black text-[8px] md:text-[9px] uppercase tracking-widest px-2 py-0.5 rounded">
                          🛡️ {myRoleAssignment.role}
                        </span>
                      )}
                    </div>
                    <h4 className="font-extrabold text-sm md:text-base text-zinc-950 tracking-tight leading-tight group-hover:text-blue-600 transition-colors">
                      {evt.title}
                    </h4>
                    {evt.description && (
                      <p className="text-zinc-400 text-[11px] md:text-xs font-semibold line-clamp-1 leading-normal max-w-md">
                        {evt.description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push(`/events/${evt.id}`)}
                    className="px-5 py-2.5 bg-zinc-50 border border-zinc-200 text-zinc-800 hover:bg-blue-600 hover:text-white hover:border-blue-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm shrink-0 cursor-pointer text-center w-full sm:w-auto"
                  >
                    View Event
                  </button>
                </div>
              );
            })}

            {userAssignedActivePlans.length === 0 && (
              <div className="bg-white border border-dashed border-zinc-200 rounded-2xl p-10 text-center text-zinc-400 space-y-2 select-none shadow-sm">
                <div className="text-xl">💤</div>
                <h4 className="font-black text-zinc-800 text-xs md:text-sm">No Active Lineup Allocations</h4>
                <p className="text-[11px] text-zinc-400 font-medium max-w-xs mx-auto">
                  You aren't scheduled to serve in any upcoming active workflows under this simulated account role.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* COLUMN LAYOUT 3: UPCOMING EVENTS QUEUE */}
        <div className="space-y-2 md:space-y-4">
          <div className="border-b border-zinc-100 pb-1.5 select-none">
            <h3 className="text-[11px] md:text-sm font-black text-zinc-900 uppercase tracking-wider">
              Upcoming Events Queue
            </h3>
          </div>

          <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm divide-y divide-zinc-100/70">
            {upcomingEventsSectionData.map((evt, idx) => (
              <div 
                key={evt.id} 
                onClick={() => router.push(`/events/${evt.id}`)}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 cursor-pointer group select-none transition-all"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1 py-0.5 rounded font-mono">
                      #{idx + 1}
                    </span>
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-tight">
                      {evt.event_date ? evt.event_date.split("T")[0] : "2026-06-12"}
                    </span>
                  </div>
                  <h5 className="font-extrabold text-[13px] md:text-[14px] text-zinc-900 tracking-tight truncate group-hover:text-blue-600 transition-colors">
                    {evt.title}
                  </h5>
                </div>
                <span className="text-xs font-bold text-zinc-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0">
                  ›
                </span>
              </div>
            ))}

            {upcomingEventsSectionData.length === 0 && (
              <div className="p-6 text-center text-xs italic text-zinc-400 font-semibold py-8">
                No future active plans built in the database directory table.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* BOOKMARKS INTERACTIVE OVERLAY MODAL PANEL */}
      {isBookmarksModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[250000] flex items-center justify-center p-4 animate-in fade-in duration-105">
          <div className="bg-white rounded-xl md:rounded-[2.5rem] shadow-2xl border w-full max-w-lg p-4 md:p-6 flex flex-col space-y-3 md:space-y-4 max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2 select-none">
              <div className="flex items-center gap-2">
                <span className="text-sm">⭐</span>
                <h4 className="font-black text-zinc-900 text-sm md:text-base tracking-tight">Bookmarked Studio Songs</h4>
              </div>
              <button 
                type="button" 
                onClick={() => setIsBookmarksModalOpen(false)}
                className="w-7 h-7 rounded-full bg-zinc-50 text-zinc-400 text-xs font-bold border flex items-center justify-center hover:bg-zinc-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="relative flex items-center bg-zinc-50 rounded-xl px-3 py-2 border border-zinc-200">
              <input 
                type="text" 
                placeholder="Search matching bookmarks..." 
                value={bookmarkSearchQuery}
                onChange={e => setBookmarkSearchQuery(e.target.value)}
                className="w-full text-xs font-semibold text-zinc-800 bg-transparent outline-none placeholder-zinc-400"
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-[200px]">
              {filteredBookmarkedSongs.map(song => (
                <div 
                  key={song.id}
                  onClick={() => { setIsBookmarksModalOpen(false); router.push(`/songs/${song.id}`); }}
                  className="p-3 bg-white border border-zinc-200 hover:border-blue-500 rounded-xl flex items-center justify-between gap-4 transition-all group cursor-pointer"
                >
                  <div className="min-w-0">
                    <h5 className="font-extrabold text-[13px] text-zinc-900 tracking-tight group-hover:text-blue-600 transition-colors truncate">
                      {song.title}
                    </h5>
                    <p className="text-[10px] font-bold text-zinc-400 truncate mt-0.5">
                      👤 {song.artist || "Unknown Artist"}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-zinc-50 border text-[8px] font-black uppercase text-zinc-400 shadow-inner">
                    {song.original_key || "G"}
                  </span>
                </div>
              ))}

              {filteredBookmarkedSongs.length === 0 && (
                <div className="p-8 text-center text-xs italic text-zinc-400 font-medium py-12">
                  No bookmarked track arrays match your search parameters.
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}