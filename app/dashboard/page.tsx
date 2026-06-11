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

const TODAY_TIMELINE_ANCHOR = "2026-06-08";

export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();
  
  // Link directly to our global simulation state parameters
  const { simulatedRole, simulatedUserId } = useEngine();

  const [loading, setLoading] = useState(true);
  const [eventsList, setEventsList] = useState<EventItem[]>([]);
  const [allocationsList, setAllocationsList] = useState<TeamMemberAllocation[]>([]);
  const [userName, setUserName] = useState("Worshipper");
  
  // Bookmarks Matrix States
  const [allSongs, setAllSongs] = useState<any[]>([]);
  const [bookmarkedSongIds, setBookmarkedSongIds] = useState<string[]>([]);
  const [isBookmarksModalOpen, setIsBookmarksModalOpen] = useState(false);
  const [bookmarkSearchQuery, setBookmarkSearchQuery] = useState("");

  async function loadDashboardMetrics() {
    try {
      // 1. Fetch all events across the workspace
      const { data: eventsData, error: eventsErr } = await supabase
        .from("events")
        .select("*");
      if (!eventsErr && eventsData) setEventsList(eventsData);

      // 2. Fetch roster assignments to compute user permissions scopes
      const { data: rosterData, error: rosterErr } = await supabase
        .from("team_members")
        .select("*");
      if (!rosterErr && rosterData) setAllocationsList(rosterData);

      // 3. Fetch name label details and bookmark array parameters for the active profile
      if (simulatedUserId && simulatedUserId !== "00000000-0000-0000-0000-000000000000") {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, bookmarked_songs")
          .eq("id", simulatedUserId)
          .maybeSingle();
        
        setUserName(profileData?.full_name ? profileData.full_name.split(" ")[0] : "Worshipper");
        setBookmarkedSongIds(profileData?.bookmarked_songs || []);
      }

      // 4. Fetch the master song index for the search lookups
      const { data: songsData } = await supabase.from("songs").select("*");
      setAllSongs(songsData || []);

    } catch (err) {
      console.error("Dashboard metrics pipeline fault:", err);
    } finally {
      setLoading(false);
    }
  }

  // Hot-swap data vectors instantly when changing user simulations via the DevFAB
  useEffect(() => {
    loadDashboardMetrics();
  }, [simulatedUserId, simulatedRole]);

  // ==========================================
  // --- CHRONOLOGICAL DATA MATRICES SELECTION -
  // ==========================================
  const futureActiveEvents = eventsList
    .filter(e => (e.event_date ? e.event_date.split("T")[0] : "2026-06-12") >= TODAY_TIMELINE_ANCHOR)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));

  // Upcoming Events Queue: Max 5 items, sorted closest-date first
  const upcomingEventsSectionData = futureActiveEvents.slice(0, 5);

  // My Active Plans: Only events assigned to the active user, sorted closest-date first
  const userAssignedActivePlans = futureActiveEvents.filter(evt =>
    allocationsList.some(member => member.event_id === evt.id && member.user_id === simulatedUserId)
  );

  // Filter user's bookmarked songs based on current search input
  const filteredBookmarkedSongs = allSongs.filter(song => 
    bookmarkedSongIds.includes(song.id) &&
    (song.title?.toLowerCase().includes(bookmarkSearchQuery.toLowerCase()) ||
     song.artist?.toLowerCase().includes(bookmarkSearchQuery.toLowerCase()))
  );

  if (loading) return <div className="p-8 text-center text-xs font-black uppercase tracking-widest text-zinc-400 animate-pulse">Synchronizing Dashboard Matrix...</div>;

  return (
    <div className="p-6 md:p-8 max-w-7xl w-full mx-auto space-y-8 animate-in fade-in duration-150">
      
      {/* ======================================================================= */}
      {/* --- MASTER HERO HEADER CONTAINER BLOCK (As per edited-image_27.png) ------ */}
      {/* ======================================================================= */}
      <div className="bg-white border border-zinc-200 rounded-[2rem] p-8 shadow-sm space-y-5">
        <div className="space-y-2">
          <h2 className="text-3xl font-black tracking-tight text-zinc-900">
            Shalom, {userName}! 👋
          </h2>
          <p className="text-zinc-400 text-xs font-bold leading-relaxed max-w-xl">
            Welcome to your main orchestration command bridge. Below are your scheduled lineups and upcoming worship plan frames.
          </p>
        </div>

        {/* Yellow Box Area Button Trigger */}
        <div className="py-0.5">
          <button
            type="button"
            onClick={() => { setBookmarkSearchQuery(""); setIsBookmarksModalOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#facc15] hover:bg-yellow-500 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer border border-yellow-400"
          >
            ⭐ Bookmarks
          </button>
        </div>

        {/* Statistics Metric Row */}
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-wider text-zinc-400 select-none pt-4 border-t border-zinc-100">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Active Assignments: <span className="text-zinc-800">{userAssignedActivePlans.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-300" />
            Total Church Pipeline: <span className="text-zinc-800">{futureActiveEvents.length} Events</span>
          </div>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* --- MULTI-COLUMN WORKSPACE CANVAS: SIDE-BY-SIDE SECTIONS -------------- */}
      {/* ======================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* COLUMN LAYOUT 1 & 2: MY ACTIVE PLANS (ASSIGNMENT GUARDED) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b pb-2 select-none">
            <h3 className="text-sm font-black tracking-tight text-zinc-900 uppercase tracking-wide">
              My Active Plans ({userAssignedActivePlans.length})
            </h3>
            <span className="text-[10px] bg-blue-50 text-blue-600 font-black tracking-widest uppercase px-2.5 py-1 rounded-md border border-blue-100">
              Assigned Only
            </span>
          </div>

          <div className="space-y-4">
            {userAssignedActivePlans.map((evt) => {
              const myRoleAssignment = allocationsList.find(
                m => m.event_id === evt.id && m.user_id === simulatedUserId
              );

              return (
                <div 
                  key={evt.id}
                  className="bg-white border border-zinc-200 p-6 rounded-[2rem] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:border-blue-500 transition-all group"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="bg-zinc-950 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-md">
                        📅 {evt.event_date ? evt.event_date.split("T")[0] : "2026-06-12"}
                      </span>
                      {myRoleAssignment && (
                        <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-md">
                          🛡️ Assigned: {myRoleAssignment.role}
                        </span>
                      )}
                    </div>
                    <h4 className="font-extrabold text-base text-zinc-950 tracking-tight leading-tight group-hover:text-blue-600 transition-colors">
                      {evt.title}
                    </h4>
                    {evt.description && (
                      <p className="text-zinc-400 text-xs font-semibold line-clamp-1 leading-normal max-w-md">
                        {evt.description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push(`/events/${evt.id}`)}
                    className="px-5 py-2.5 bg-zinc-50 border border-zinc-200 text-zinc-800 hover:bg-blue-600 hover:text-white hover:border-blue-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm shrink-0 cursor-pointer text-center"
                  >
                    View Event
                  </button>
                </div>
              );
            })}

            {userAssignedActivePlans.length === 0 && (
              <div className="bg-white border border-dashed border-zinc-200 rounded-[2rem] p-12 text-center text-zinc-400 space-y-2 select-none shadow-sm">
                <div className="text-2xl">💤</div>
                <h4 className="font-black text-zinc-800 text-sm">No Active Lineup Allocations</h4>
                <p className="text-xs text-zinc-400 font-medium max-w-xs mx-auto">
                  You aren't scheduled to serve in any upcoming active workflows under this simulated account role.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* COLUMN LAYOUT 3: UPCOMING EVENTS QUEUE CONTAINER (STANDALONE CARD) */}
        <div className="space-y-4">
          <div className="border-b pb-2 select-none">
            <h3 className="text-sm font-black tracking-tight text-zinc-900 uppercase tracking-wide">
              Upcoming Events Queue
            </h3>
          </div>

          <div className="bg-white border border-zinc-200 rounded-[2rem] p-5 shadow-sm divide-y divide-zinc-100/70">
            {upcomingEventsSectionData.map((evt, idx) => (
              <div 
                key={evt.id} 
                onClick={() => router.push(`/events/${evt.id}`)}
                className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4 cursor-pointer group select-none transition-all"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-mono">
                      #{idx + 1}
                    </span>
                    <span className="text-[11px] font-black text-zinc-400 uppercase tracking-tight">
                      {evt.event_date ? evt.event_date.split("T")[0] : "2026-06-12"}
                    </span>
                  </div>
                  <h5 className="font-extrabold text-[14px] text-zinc-900 tracking-tight truncate group-hover:text-blue-600 transition-colors">
                    {evt.title}
                  </h5>
                </div>
                <span className="text-xs font-bold text-zinc-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0">
                  ›
                </span>
              </div>
            ))}

            {upcomingEventsSectionData.length === 0 && (
              <div className="p-8 text-center text-xs italic text-zinc-400 font-semibold py-12">
                No future active plans built in the database directory table.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ======================================================== */}
      {/* --- BOOKMARKS INTERACTIVE OVERLAY MODAL PANEL ---------- */}
      {/* ======================================================== */}
      {isBookmarksModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[250000] flex items-center justify-center p-4 animate-in fade-in duration-105">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border w-full max-w-lg p-6 flex flex-col space-y-4 max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Modal Navigation Header Cap */}
            <div className="flex items-center justify-between border-b pb-2 select-none">
              <div className="flex items-center gap-2">
                <span className="text-base">⭐</span>
                <h4 className="font-black text-zinc-900 text-base tracking-tight">Bookmarked Studio Songs</h4>
              </div>
              <button 
                type="button" 
                onClick={() => setIsBookmarksModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-50 text-zinc-400 text-xs font-bold border flex items-center justify-center hover:bg-zinc-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Live Search Lookup Bar */}
            <div className="relative flex items-center bg-zinc-50 rounded-xl px-3.5 py-2.5 border border-zinc-200">
              <input 
                type="text" 
                placeholder="Search matching bookmarks..." 
                value={bookmarkSearchQuery}
                onChange={e => setBookmarkSearchQuery(e.target.value)}
                className="w-full text-xs font-semibold text-zinc-800 bg-transparent outline-none placeholder-zinc-400"
              />
            </div>

            {/* Bookmarked Songs Matrix List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-[200px]">
              {filteredBookmarkedSongs.map(song => (
                <div 
                  key={song.id}
                  // DIRECT SURGICAL RE-ROUTE FIX: Traverses strictly into individual song node profile matrix layout
                  onClick={() => { setIsBookmarksModalOpen(false); router.push(`/songs/${song.id}`); }}
                  className="p-4 bg-white border border-zinc-200 hover:border-blue-500 rounded-2xl flex items-center justify-between gap-4 transition-all group cursor-pointer"
                >
                  <div className="min-w-0">
                    <h5 className="font-extrabold text-[14px] text-zinc-900 tracking-tight group-hover:text-blue-600 transition-colors truncate">
                      {song.title}
                    </h5>
                    <p className="text-[11px] font-bold text-zinc-400 truncate mt-0.5">
                      👤 {song.artist || "Unknown Artist"}
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-zinc-50 border text-[9px] font-black uppercase text-zinc-500 shadow-inner">
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