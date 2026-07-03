"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useEngine } from "../context/EngineContext";
import GlobalLoader from '../../components/GlobalLoader';

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

// 50 Curated Unique English & Filipino Greetings
const GLOBAL_GREETINGS_DICTIONARY = [
  // ==========================================
  // 🇵🇭 FILIPINO (Traditional & Modern Slang)
  // ==========================================
  "Mabuhay",             // Long live / Welcome
  "Kamusta",             // How are you?
  "Magandang Araw",      // Good day
  "Magandang Umaga",     // Good morning
  "Magandang Hapon",     // Good afternoon
  "Magandang Gabi",      // Good evening
  "Tuloy po kayo",       // Please come in (Formal/Respectful)
  "Pasok!",              // Come in! 
  "Musta?",              // Short for Kamusta
  "Ano'ng ganap?",       // What's happening? / What's up? (Modern slang)
  "Balita?",             // What's the news? / How's it going?
  "Uy, kamusta?",        // Hey, how are you?
  "Tara!",               // Let's go! (Energetic)
  "G!",                  // Game! / Let's do this! (Modern Gen Z/Millennial slang)
  "Rak na!",             // Let's rock! / Let's do this!
  "Kumusta buhay?",      // How's life?
  "Ano na?",             // What's up now?
  "Larga!",              // Let's roll!
  "O, nandito ka na",    // Oh, you're here (Warm recognition)
  "Kamusta ang lahat?",  // How is everything?
  
  // ==========================================
  // 🇬🇧/🇺🇸 ENGLISH (Classic, Warm, & Workspace)
  // ==========================================
  "Hello", 
  "Hi there", 
  "Welcome back", 
  "Good to see you", 
  "Greetings", 
  "What's up?", 
  "How's it going?", 
  "What's good?", 
  "Look who it is!", 
  "Hey there", 
  "Top of the morning", 
  "Greetings and salutations", 
  "What's the good word?", 
  "Ahoy!", 
  "What's happening?", 
  "How's life treating you?", 
  "Ready to rock?", 
  "Let's get to work", 
  "Welcome aboard", 
  "Great to have you here", 
  "How's everything?", 
  "What's new?", 
  "Nice to see you", 
  "Rise and shine!", 
  "Let's do this", 
  "Hello, world!",       // The classic developer greeting
  "Howdy", 
  "Hope you're doing well", 
  "Let's make it happen", 
  "Glad you're here"
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
      const { data: authData } = await supabase.auth.getUser();

      if (authData?.user) {
        // Fetch their real database profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, team_id")
          .eq("id", authData.user.id)
          .maybeSingle();

        // If they don't have a profile, or haven't finished setting up their name, bounce them!
        if (!profile || !profile.full_name) {
          console.log("🚨 Incomplete profile detected. Rerouting to onboarding...");
          router.push("/onboarding");
          return; // Strictly stop the dashboard from loading any further!
        }
      }

      // 1. Calculate Greeting Locally
      const dayOfYearHash = Math.floor(Date.now() / 86400000);
      const greetingIndex = dayOfYearHash % GLOBAL_GREETINGS_DICTIONARY.length;
      setCurrentGreeting(GLOBAL_GREETINGS_DICTIONARY[greetingIndex]);

      // 2. Fetch Daily Verse
      const now = new Date();
      const localYear = now.getFullYear();
      const localMonth = String(now.getMonth() + 1).padStart(2, '0');
      const localDay = String(now.getDate()).padStart(2, '0');
      const todayString = `${localYear}-${localMonth}-${localDay}`;

      

      const { data: inspirationData, error: inspirationErr } = await supabase
        .from("daily_inspiration")
        .select("verse_text, verse_reference")
        .eq("target_date", todayString)
        .maybeSingle();

      if (inspirationErr) {
        console.error("Daily verse fetch error:", inspirationErr);
      }

      if (inspirationData) {
        // A verse already exists for today! Just use it.
        setDailyVerse({
          text: inspirationData.verse_text,
          reference: inspirationData.verse_reference
        });
      } else {
        // NO VERSE FOUND FOR TODAY! 
        // 1. Pick a consistent verse from the fallback array
        const verseIndex = dayOfYearHash % FALLBACK_VERSES.length;
        const selectedFallback = FALLBACK_VERSES[verseIndex];

        // 2. Instantly show it in the UI so the user isn't waiting
        setDailyVerse(selectedFallback);

        // 3. Silently auto-seed this into Supabase so it's there for the next user today
        const { error: insertErr } = await supabase
          .from("daily_inspiration")
          .insert([{
            target_date: todayString,
            verse_text: selectedFallback.text,
            verse_reference: selectedFallback.reference
          }]);

        if (insertErr) {
          // Note: If 5 users log in at exactly midnight, you might get a "duplicate key" error here.
          // That is totally fine, it just means someone else beat them to the insert!
          console.error("Auto-seed daily verse error:", insertErr);
        }
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
        .from("event_rosters") // ✅ SURGICAL FIX: Pointing to the correct event table!
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

  // ✅ SURGICAL FIX: Appended .slice(0, 3) to cap the rendered active plans
  const userAssignedActivePlans = futureActiveEvents.filter(evt =>
    allocationsList.some(member => member.event_id === evt.id && member.user_id === simulatedUserId)
  ).slice(0, 3);


  const filteredBookmarkedSongs = allSongs.filter(song => 
    bookmarkedSongIds.includes(song.id) &&
    (song.title?.toLowerCase().includes(bookmarkSearchQuery.toLowerCase()) ||
     song.artist?.toLowerCase().includes(bookmarkSearchQuery.toLowerCase()))
  );

  if (loading) {
  return <GlobalLoader message="LOADING DASHBOARD..." />;
}

  return (
    <div className="h-full max-h-screen overflow-y-auto custom-scrollbar p-4 md:p-4 max-w-7xl w-full mx-auto space-y-4 md:space-y-8 animate-in fade-in duration-150 pb-24 md:pb-4">
      
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
                  // ✅ SURGICAL FIX: Entire card is now clickable and routes to the event overview
                  onClick={() => router.push(`/events/${evt.id}`)}
                  className="bg-white border border-zinc-200 p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-5 hover:border-blue-500 transition-all group cursor-pointer"
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

                  {/* ✅ SURGICAL FIX: Async routing to bridge Event ID to Setlist ID */}
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation(); 
                      
                      // 1. Ask Supabase for the first setlist attached to this specific event
                      const { data } = await supabase
                        .from("setlists")
                        .select("id")
                        .eq("event_id", evt.id)
                        .limit(1)
                        .maybeSingle();

                      // 2. Route dynamically based on the result
                      if (data?.id) {
                        // Success! We found a setlist, jump straight into the Live Engine
                        router.push(`/setlists/${data.id}/live`);
                      } else {
                        // No setlist exists yet! Redirect to the cockpit so they can build one.
                        alert("No setlist built for this event yet! Redirecting to event cockpit...");
                        router.push(`/events/${evt.id}`);
                      }
                    }}
                    className="px-5 py-2.5 bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm shrink-0 cursor-pointer text-center w-full sm:w-auto"
                  >
                    Start Rehearsal
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