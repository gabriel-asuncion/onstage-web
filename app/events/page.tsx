"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useEngine } from "../context/EngineContext";
import { getUserTeam, getAllProfiles } from "../../utils/supabase/actions";

interface EventItem { 
  id: string; 
  title: string; 
  event_date: string; 
  description: string; 
  service_type?: string; 
}

interface TeamMemberRow {
  id: string;
  event_id: string;
  user_id: string;
  role: string;
}

interface DBProfile {
  id: string;
  full_name: string;
}

const SERVICE_TYPE_PRESETS = ["Midweek Service", "Divine Service", "Camp", "Concert", "Fellowship"];
const TODAY_TIMELINE_ANCHOR = "2026-06-08"; // Anchored timeline context vector

export default function EventsManagerPage() {
  const supabase = createClient();
  const router = useRouter();
  const { simulatedRole } = useEngine();

  const [team, setTeam] = useState<any>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [rosterAllocations, setRosterAllocations] = useState<TeamMemberRow[]>([]);
  const [allProfiles, setAllProfiles] = useState<DBProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Advanced Matrix Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterServiceType, setFilterServiceType] = useState("All");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterParticipantUserId, setFilterParticipantUserId] = useState("All");
  const [filterPlanStatus, setFilterPlanStatus] = useState("All"); // "All" | "Active" | "Inactive"
  const [isFilterExpanded, setIsFilterExpanded] = useState(false); // SURGICAL ADDITION: Filter bar expansion flag state

  // Create Event Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("2026-06-12");
  const [eventServiceType, setEventServiceType] = useState("Divine Service");
  const [eventDesc, setEventDesc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadEventsData() {
    try {
      const userTeam = await getUserTeam();
      setTeam(userTeam || { id: "00000000-0000-0000-0000-000000000000", name: "OnPraise Ministry Team" });

      // Fetch Events
      const { data: records, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: true });
      if (!error && records) setEvents(records);

      // Fetch dynamic participant allocation vectors for cross-filtering mapping lookups
      const { data: globalRoster } = await supabase
        .from("team_members")
        .select("id, event_id, user_id, role");
      if (globalRoster) setRosterAllocations(globalRoster as TeamMemberRow[]);

      // Fetch profile catalog names for selection metrics lookups
      const profilesData = await getAllProfiles();
      if (profilesData) setAllProfiles(profilesData as DBProfile[]);

    } catch (err) {
      console.error("Failed to aggregate layout nodes:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateEventSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!eventTitle.trim()) return;
    setIsSubmitting(true);

    try {
      const payload: any = {
        title: eventTitle.trim(),
        event_date: eventDate,
        service_type: eventServiceType, 
        description: eventDesc.trim() || "Worship gathering event plan block."
      };

      if (team?.id && team.id !== "00000000-0000-0000-0000-000000000000") {
        payload.team_id = team.id;
      }

      const { data, error } = await supabase
        .from("events")
        .insert(payload)
        .select()
        .maybeSingle();

      if (error) {
        alert(`Supabase DB Error: ${error.message}`);
        return;
      }

      if (data) {
        setIsCreateModalOpen(false);
        setEventTitle("");
        setEventDesc("");
        setEventServiceType("Divine Service");
        await loadEventsData();
        router.push(`/events/${data.id}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    loadEventsData();
  }, []);

  function handleClearSpecificTokenChip(tokenPrefix: string, tokenValue: string) {
    const targetMatchPattern = new RegExp(`${tokenPrefix}\\s*${tokenValue.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'i');
    setSearchQuery(prev => prev.replace(targetMatchPattern, "").trim()); // ✅ Changed to setSearchQuery
  }

  // ==========================================
  // --- REAL-TIME RUNTIME FILTER PROCESSING --
  // ==========================================
  const parsedFilteredEventsGrid = events
    .filter(evt => {
      const cleanEvtDate = evt.event_date ? evt.event_date.split("T")[0] : "2026-06-12";
      
      // Compute chronological state automatically against the current system date anchor
      const isPlanExpired = cleanEvtDate < TODAY_TIMELINE_ANCHOR;
      const computedStatus = isPlanExpired ? "Inactive" : "Active";

      // 1. Text Title search filter context tracking
      if (searchQuery && !evt.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      // 2. Service type string preset categorization tracking
      if (filterServiceType !== "All" && evt.service_type !== filterServiceType) return false;

      // 3. Dynamic plan context validation ranges (In-Between dates calculation rules)
      if (filterStartDate && cleanEvtDate < filterStartDate) return false;
      if (filterEndDate && cleanEvtDate > filterEndDate) return false;

      // 4. Participant enrollment lookups vector cross validation
      if (filterParticipantUserId !== "All") {
        const isUserAssignedToThisEvent = rosterAllocations.some(
          member => member.event_id === evt.id && member.user_id === filterParticipantUserId
        );
        if (!isUserAssignedToThisEvent) return false;
      }

      // SURGICAL REFACTOR: Smart Inactive Exclusions Rule Engine
      const isSpecificFilterApplied = searchQuery.trim() !== "" || filterServiceType !== "All" || filterStartDate !== "" || filterEndDate !== "" || filterParticipantUserId !== "All" || filterPlanStatus !== "All";
      
      if (filterPlanStatus === "All") {
        // By default, exclude inactive past plans unless a query keyword or explicit search filter parameter is applied
        if (!isSpecificFilterApplied && computedStatus === "Inactive") return false;
      } else if (filterPlanStatus !== computedStatus) {
        return false;
      }

      return true;
    })
    // SURGICAL REFACTOR: Sort by upcoming dates sequentially (Nearest upcoming timeline indexes render first)
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    // SURGICAL REFACTOR: Capped strict maximum visualization constraint layout grid rows count limits
    .slice(0, 10);

  if (loading) return <div className="p-8 text-center text-xs font-bold uppercase tracking-widest animate-pulse">Loading Events Matrix Router Hub...</div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-4 md:space-y-6 animate-in fade-in duration-150">
      
      {/* HUB MAIN HEADER CAPTION CONTROL BAR */}
      <div className="bg-white border border-zinc-200 rounded-xl md:rounded-3xl p-4 md:p-6 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-zinc-950 tracking-tight">Events Block Manager</h1>
          <p className="text-zinc-400 text-xs font-semibold mt-0.5">Instantiate, calibrate, and filter active calendar structural container block coordinates.</p>
        </div>
        
        {simulatedRole === "admin" && (
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-95 uppercase tracking-wider shrink-0"
          >
            ＋ Create Event
          </button>
        )}
      </div>

      {/* ======================================================== */}
      {/* --- RE-ARCHITECTED COMPACT COMPACTABLE MATRIX FILTER --- */}
      {/* ======================================================== */}
      <div className="bg-white border border-zinc-200 rounded-xl md:rounded-3xl p-4 md:p-5 shadow-sm space-y-4 select-none text-xs font-bold">
        
        {/* Main Base Filter Entry Control Bar line */}
        <div className="flex flex-col sm:flex-row items-end gap-3 w-full">
          <div className="flex-1 space-y-1.5 w-full">
            <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Search Title</label>
            <input 
              type="text" 
              placeholder="Type index query keyword..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-50 border rounded-xl px-3.5 py-2.5 font-bold text-zinc-800 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
            />
          </div>
          
          <button
            type="button"
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0 h-10 w-full sm:w-auto justify-center cursor-pointer"
          >
            <span>{isFilterExpanded ? "🎛️ Hide Advanced Filters" : "🎛️ Show Advanced Filters"}</span>
          </button>
        </div>

        {/* Collapsible expandable content matrix grid rows container */}
        {isFilterExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-zinc-100 animate-in slide-in-from-top-2 duration-200">
            {/* Input B: Type of Service presets dropdown matrix */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Service Preset</label>
              <select 
                value={filterServiceType} 
                onChange={e => setFilterServiceType(e.target.value)}
                className="w-full bg-zinc-50 border rounded-xl px-3 py-2.5 font-bold text-zinc-700 outline-none cursor-pointer focus:border-blue-500 transition-all"
              >
                <option value="All">All Service Presets</option>
                {SERVICE_TYPE_PRESETS.map(preset => <option key={preset} value={preset}>{preset}</option>)}
              </select>
            </div>

            {/* Input C: Symmetrical execution ranges date bounds pickers */}
            <div className="space-y-1.5 grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block mb-1.5">Start Date</label>
                <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-2 py-2 text-[11px] font-bold text-zinc-700 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block mb-1.5">End Date</label>
                <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-2 py-2 text-[11px] font-bold text-zinc-700 outline-none" />
              </div>
            </div>

            {/* Input D: Lineup catalog participant roster allocation lookups field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Assigned Participant</label>
              <select 
                value={filterParticipantUserId} 
                onChange={e => setFilterParticipantUserId(e.target.value)}
                className="w-full bg-zinc-50 border rounded-xl px-3 py-2.5 font-bold text-zinc-700 outline-none cursor-pointer focus:border-blue-500 transition-all"
              >
                <option value="All">All Team Volunteers</option>
                {allProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name || "Worshipper Handle Node"}</option>)}
              </select>
            </div>

            {/* Input E: Chronological Status layout switch context selector code block */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Plan Allocation Status</label>
              <div className="grid grid-cols-3 gap-1 bg-zinc-100 p-1 rounded-xl border">
                {(["All", "Active", "Inactive"] as const).map((statusOption) => (
                  <button
                    key={statusOption}
                    type="button"
                    onClick={() => setFilterPlanStatus(statusOption)}
                    className={`py-1.5 text-center text-[10px] font-black rounded-lg uppercase tracking-tight transition-all cursor-pointer ${
                      filterPlanStatus === statusOption ? "bg-white text-zinc-950 border shadow-sm font-black" : "text-zinc-400 hover:text-zinc-600"
                    }`}
                  >
                    {statusOption}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* EVENTS DASHBOARD VISUAL CARDS GRID MATRIX */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {parsedFilteredEventsGrid.map((evt) => {
          const cleanEvtDate = evt.event_date ? evt.event_date.split("T")[0] : "2026-06-12";
          const isPlanExpired = cleanEvtDate < TODAY_TIMELINE_ANCHOR;

          return (
            <div 
              key={evt.id}
              onClick={() => router.push(`/events/${evt.id}`)}
              className={`bg-white border p-5 md:p-6 rounded-xl md:rounded-3xl hover:border-blue-500 hover:scale-[1.01] transition-all cursor-pointer shadow-sm flex flex-col justify-between min-h-[185px] group border-zinc-200/80 relative overflow-hidden ${
                isPlanExpired ? "opacity-75 bg-zinc-50/20" : ""
              }`}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {isPlanExpired ? (
                    <span className="bg-zinc-100 border border-zinc-200 text-zinc-500 font-black text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full block w-fit">
                      🚫 Inactive Plan
                    </span>
                  ) : (
                    <span className="bg-blue-50 border border-blue-100 text-blue-600 font-black text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full block w-fit shadow-sm">
                      ⚡ Active Plan Workspace
                    </span>
                  )}

                  {evt.service_type && (
                    <span className="bg-zinc-50 border text-zinc-600 font-extrabold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wide block w-fit">
                      {evt.service_type}
                    </span>
                  )}
                </div>
                
                <h4 className="font-extrabold text-base md:text-lg text-zinc-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors">{evt.title}</h4>
                {evt.description && <p className="text-xs font-medium text-zinc-400 mt-2 line-clamp-2 leading-relaxed">{evt.description}</p>}
              </div>
              
              <div className="pt-4 border-t border-zinc-100 flex justify-between items-center text-xs font-semibold text-zinc-400 mt-4 select-none">
                <span className={`${isPlanExpired ? "text-zinc-400 line-through" : "text-zinc-500 font-bold"}`}>📅 {cleanEvtDate}</span>
                <span className="text-blue-600 font-black tracking-tight group-hover:translate-x-1 transition-transform">Edit Event</span>
              </div>
            </div>
          );
        })}

        {parsedFilteredEventsGrid.length === 0 && (
          <div className="col-span-full bg-white rounded-xl md:rounded-3xl p-12 md:p-16 text-center border border-dashed border-zinc-200 text-zinc-400 w-full shadow-sm space-y-2 select-none">
            <div className="text-3xl">🔍</div>
            <h4 className="font-extrabold text-zinc-800 text-base">No Event Coordinates Match Filters</h4>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto font-medium">Try resetting your date ranges, volunteer search scopes, or category presets selectors.</p>
          </div>
        )}
      </div>

      {/* --- CREATE NEW EVENT DIALOG MODAL PANEL --- */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[130000] flex items-center justify-center p-4">
          <form onSubmit={handleCreateEventSubmit} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-6 relative flex flex-col space-y-4 animate-in zoom-in-95">
            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 font-bold text-xs flex items-center justify-center">✕</button>
            <h3 className="text-xl font-black text-zinc-900 tracking-tight">Create Event Block</h3>
            
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block">Event Title</label>
              <input type="text" required placeholder="e.g., June - week#1" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block">Type of Service Preset</label>
              <select 
                value={eventServiceType} 
                onChange={(e) => setEventServiceType(e.target.value)} 
                className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 cursor-pointer"
              >
                {SERVICE_TYPE_PRESETS.map(preset => <option key={preset} value={preset}>{preset}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block">Target Service Date</label>
              <input type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block">Summary Description</label>
              <textarea placeholder="Details text notes parameters..." value={eventDesc} onChange={(e) => setEventDesc(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-sm font-semibold outline-none h-20 resize-none focus:border-blue-500" />
            </div>
            <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-widest shadow-md cursor-pointer">{isSubmitting ? "Creating..." : "Instantiate Event Block"}</button>
          </form>
        </div>
      )}
    </div>
  );
}