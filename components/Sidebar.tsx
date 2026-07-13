"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
// import { usePathname } from "next/navigation";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../utils/supabase/client";
import { useEngine } from "../app/context/EngineContext";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  ministries: string[];
  unavailable_dates: string[];
}

export default function Sidebar() {
  const supabase = createClient();
  const pathname = usePathname();
  const router = useRouter(); // ✅ SURGICAL FIX: Initialize the router
  
  // ✅ SURGICAL ADDITION: Pulling workspace variables from Engine Context
  const { simulatedRole, simulatedUserId, userTeamId, primaryTeamId, secondaryTeamIds, switchWorkspace } = useEngine();

  // Modal Layout States
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [newBlockoutDate, setNewBlockoutDate] = useState("2026-06-21");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  
  // ✅ SURGICAL FIX: Secure Supabase sign-out logic
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push("/login"); // (Adjust to "/" if your login page is at the root)
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };
  
  // ✅ Local state to populate team names in the dropdown
  const [teamNamesMap, setTeamNamesMap] = useState<Record<string, string>>({});

  // ✅ PHASE 3 FIX: Join Code Modal States
  const [modalJoinCode, setModalJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [copyText, setCopyText] = useState("Copy Code");

  // ✅ SURGICAL ADDITION: Mobile Nav Visibility States
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [isPlaymodeActive, setIsPlaymodeActive] = useState(false);

  useEffect(() => {
    let lastScrollY = 0;
    let ticking = false;

    const handleScroll = (e: Event) => {
      // Capture scroll from window or specific scrolling containers (like the live page flex-1 div)
      const target = (e.target as Document).scrollingElement || (e.target as HTMLElement);
      const currentScrollY = target.scrollTop || window.scrollY || 0;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (currentScrollY > lastScrollY && currentScrollY > 50) {
            setIsNavVisible(false); // Scrolling down -> Hide
          } else if (currentScrollY < lastScrollY) {
            setIsNavVisible(true);  // Scrolling up -> Show
          }
          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    // Use capture: true to catch scrolls from inner divs (like our live page)
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    
    // Listen for the custom Playmode event from the Live page
    const handlePlaymodeSignal = (e: any) => setIsPlaymodeActive(e.detail);
    window.addEventListener("onpraise-playmode", handlePlaymodeSignal);

    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
      window.removeEventListener("onpraise-playmode", handlePlaymodeSignal);
    };
  }, []);

  // ✅ PHASE 3 FIX: For Lone Wolves to join a team directly from the sidebar
  async function handleJoinFromProfile() {
    if (!modalJoinCode.trim() || !simulatedUserId) return;
    setIsJoining(true);

    try {
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("id")
        .eq("join_code", modalJoinCode.toLowerCase().trim())
        .maybeSingle();

      if (teamError || !teamData) {
        alert("Invalid join code. Please try again.");
        setIsJoining(false);
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ team_id: teamData.id })
        .eq("id", simulatedUserId);

      if (profileError) throw profileError;

      // Force a hard reload so the Engine Context recalculates their workspace completely
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Something went wrong.");
      setIsJoining(false);
    }
  }

  // ✅ PHASE 3 FIX: Copy current team's join code
  async function handleCopyJoinCode() {
    if (!userTeamId) return;
    
    const { data } = await supabase
      .from("teams")
      .select("join_code")
      .eq("id", userTeamId)
      .single();

    if (data?.join_code) {
      navigator.clipboard.writeText(data.join_code.toUpperCase());
      setCopyText("Copied! ✅");
      setTimeout(() => setCopyText("Copy Code"), 2000);
    }
  }

  // Sync profile metrics instantly when switching developer identities
  async function fetchActiveProfileContext() {
    if (!simulatedUserId) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", simulatedUserId)
      .maybeSingle();

    if (!error && data) {
      setActiveProfile({
        ...data,
        ministries: data.ministries || [],
        unavailable_dates: data.unavailable_dates || []
      });
      
      // ✅ Fetch the names of all teams the user belongs to
      if (data.team_id || (data.secondary_team_ids && data.secondary_team_ids.length > 0)) {
        const teamIdsToFetch = [data.team_id, ...(data.secondary_team_ids || [])].filter(Boolean);
        if (teamIdsToFetch.length > 0) {
          const { data: teamsData } = await supabase
            .from("teams")
            .select("id, name")
            .in("id", teamIdsToFetch);
            
          if (teamsData) {
            const map: Record<string, string> = {};
            teamsData.forEach(t => { map[t.id] = t.name; });
            setTeamNamesMap(map);
          }
        }
      }
    }
  }

  useEffect(() => {
    fetchActiveProfileContext();
  }, [simulatedUserId, isAccountModalOpen]);

  // Schedule management logic nodes
  async function handleAddBlockoutDateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProfile || !newBlockoutDate || isSavingSchedule) return;
    if (activeProfile.unavailable_dates.includes(newBlockoutDate)) return;

    setIsSavingSchedule(true);
    const updatedDates = [...activeProfile.unavailable_dates, newBlockoutDate].sort();

    const { error } = await supabase
      .from("profiles")
      .update({ unavailable_dates: updatedDates })
      .eq("id", activeProfile.id);

    if (!error) {
      setActiveProfile({ ...activeProfile, unavailable_dates: updatedDates });
    } else {
      alert(`Schedule Save Failed: ${error.message}`);
    }
    setIsSavingSchedule(false);
  }

  async function handleRemoveBlockoutDate(dateToRemove: string) {
    if (!activeProfile || isSavingSchedule) return;

    setIsSavingSchedule(true);
    const updatedDates = activeProfile.unavailable_dates.filter(d => d !== dateToRemove);

    const { error } = await supabase
      .from("profiles")
      .update({ unavailable_dates: updatedDates })
      .eq("id", activeProfile.id);

    if (!error) {
      setActiveProfile({ ...activeProfile, unavailable_dates: updatedDates });
    }
    setIsSavingSchedule(false);
  }

  const navItems = [
    { icon: "/assets/home.svg", href: "/dashboard", activePattern: "/dashboard" },
    { icon: "/assets/music.svg", href: "/songs", activePattern: "/songs" },
    { icon: "/assets/events.svg", href: "/events", activePattern: "/events" },
  ];

  return (
    <>
      {/* ======================================================= */}
      {/* 1. DESKTOP VIEWPORT SIDEBAR (Hidden on mobile panels)   */}
      {/* ======================================================= */}
      <aside className={`w-20 min-h-screen bg-white border-r border-zinc-200 shrink-0 select-none z-40 sticky top-0 transition-all duration-300 flex-col items-center justify-between hidden md:flex ${
        isPlaymodeActive ? "-ml-20 opacity-0 pointer-events-none" : "ml-0 opacity-100"
      }`}>
        {/* We added py-6 specifically to the top logo container so it breathes, but doesn't affect the bottom profile */}
        <div className="flex flex-col items-center gap-8 w-full pt-6">
          <Link href="/dashboard" className="w-10 h-10 flex items-center justify-center transition-transform active:scale-95">
            <img src="/assets/logo.svg" className="w-9 h-9 object-contain" alt="Logo" />
          </Link>

          <div className="flex flex-col items-center gap-4 w-full px-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.activePattern);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-150 ${
                    isActive 
                      ? "bg-zinc-100 text-zinc-950 shadow-inner scale-100" 
                      : "bg-transparent text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 hover:scale-105"
                  }`}
                >
                  <img src={item.icon} className="w-5 h-5 object-contain transition-transform" alt="" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* And we added pb-6 specifically to the profile bubble container */}
        <div className="w-full flex justify-center pb-6">
          <button 
            type="button"
            onClick={() => setIsAccountModalOpen(true)}
            className={`w-11 h-11 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-md border-2 transition-all hover:scale-110 active:scale-95 cursor-pointer ${
              simulatedRole !== "none" ? "border-amber-400 ring-4 ring-amber-400/20" : "border-zinc-100 hover:border-blue-300"
            }`}
          >
            {activeProfile?.avatar_url ? (
              <img src={activeProfile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
            ) : (
              <span>
                {simulatedRole === "admin" ? "A" 
                  : simulatedRole === "moderator" ? "Mo" 
                  : simulatedRole === "musician" ? "Mu" 
                  : simulatedRole === "member" ? "M" 
                  : "U"}
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* ======================================================= */}
      {/* 2. MOBILE VIEWPORT BOTTOM TRAY NAV BAR (Hidden on Desktop) */}
      {/* ======================================================= */}
      <nav className={`fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-t border-zinc-200/80 flex items-center justify-around px-2 pb-safe shadow-lg md:hidden z-[100000] select-none transition-transform duration-300 ease-in-out ${
        (!isNavVisible || isPlaymodeActive) ? "translate-y-full" : "translate-y-0"
      }`}>
        {navItems.map((item, idx) => {
          const isActive = pathname.startsWith(item.activePattern);
          
          const navNode = (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-150 relative ${
                isActive ? "scale-110 text-zinc-950" : "text-zinc-400 active:text-zinc-800"
              }`}
            >
              {isActive && (
                <span className="absolute top-1 w-10 h-[3px] bg-blue-600 rounded-b-full" />
              )}
              <img src={item.icon} className="w-5 h-5 object-contain" alt="" />
            </Link>
          );

          // ✅ SURGICAL ADDITION: Inject the logo perfectly in the 3rd position (index 2)
          if (idx === 2) {
            return [
              <Link 
                key="mobile-center-logo" 
                href="/dashboard" 
                className="flex flex-col items-center justify-center flex-1 h-full transition-transform active:scale-95"
              >
                <img src="/assets/logo.svg" className="w-8 h-8 object-contain drop-shadow-sm" alt="Logo" />
              </Link>,
              navNode
            ];
          }

          return navNode;
        })}

        {/* PROFILE BUBBLE MERGED AS THE 5TH TRIGGER OPTION INSIDE PORTRAIT VIEWPORTS */}
        <div className="flex-1 flex items-center justify-center h-full">
          <button 
            type="button"
            onClick={() => setIsAccountModalOpen(true)}
            className={`w-8 h-8 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shadow-sm border transition-all active:scale-95 cursor-pointer ${
              simulatedRole !== "none" ? "border-amber-400 ring-2 ring-amber-400/10" : "border-zinc-100"
            }`}
          >
            {activeProfile?.avatar_url ? (
              <img src={activeProfile.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
            ) : (
              <span>
                {simulatedRole === "admin" ? "A" 
                  : simulatedRole === "moderator" ? "Mo" 
                  : simulatedRole === "musician" ? "Mu" 
                  : simulatedRole === "member" ? "M" 
                  : "U"}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* ======================================================== */}
      {/* --- UNIFIED MODAL OVERLAY: ACCOUNT & SCHEDULE PORTAL --- */}
      {/* ======================================================== */}
      {isAccountModalOpen && activeProfile && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-white rounded-[1rem] shadow-2xl border w-full max-w-2xl p-4 relative grid grid-cols-1 md:grid-cols-2 gap-4 animate-in zoom-in-95 duration-350">
            <button 
              type="button" 
              onClick={() => setIsAccountModalOpen(false)}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-zinc-50 text-zinc-400 text-xs font-bold border flex items-center justify-center hover:bg-zinc-100"
            >
              ✕
            </button>

            {/* Panel Column 1: Account Info Profile Core Details */}
            <div className="space-y-5 border-b md:border-b-0 md:border-r pb-6 md:pb-0 md:pr-6 border-zinc-100 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-4">
                  {activeProfile.avatar_url ? (
                    <img src={activeProfile.avatar_url} className="w-16 h-16 rounded-2xl object-cover border" alt="" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white text-xl font-black flex items-center justify-center shadow-md">
                      {activeProfile.full_name?.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="text-xl font-black text-zinc-900 tracking-tight flex items-center gap-1.5">
                      {activeProfile.full_name}
                      {simulatedRole !== "none" && <span className="bg-amber-100 border border-amber-200 text-amber-800 text-[8px] font-black px-1.5 py-0.5 rounded">SIM</span>}
                    </h3>
                    <p className="text-xs text-zinc-400 font-bold mt-0.5">{activeProfile.email}</p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-6">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Qualified Skill Teams</label>
                  <div className="flex flex-wrap gap-1.5">
                    {activeProfile.ministries.map(m => (
                      <span key={m} className="px-3 py-1 bg-zinc-50 border font-extrabold text-[11px] text-zinc-600 rounded-full">{m}</span>
                    ))}
                    {activeProfile.ministries.length === 0 && <span className="text-xs italic text-zinc-400">No special teams mapped.</span>}
                  </div>
                </div>
              </div>

              {/* ✅ SURGICAL ADDITION: Workspace Indicator (Always visible, dropdown only if multi-campus) */}
              {/* ✅ PHASE 3 FIX: Dynamic Workspace Indicator & Join Code Manager */}
              <div className="space-y-2 pt-4 border-t border-zinc-100 mt-auto">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                    Current Branch
                  </label>
                  {userTeamId && (
                    <button
                      onClick={handleCopyJoinCode}
                      className="text-[9px] font-black text-zinc-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
                    >
                      {copyText}
                    </button>
                  )}
                </div>
                
                {!userTeamId ? (
                  // LONE WOLF UI: Show input to join a team
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-1.5 flex gap-2 shadow-inner">
                    <input
                      type="text"
                      value={modalJoinCode}
                      onChange={(e) => setModalJoinCode(e.target.value)}
                      placeholder="Enter Church ID..."
                      className="flex-1 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      maxLength={10}
                    />
                    <button
                      onClick={handleJoinFromProfile}
                      disabled={isJoining || modalJoinCode.trim().length < 10}
                      className="px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                    >
                      {isJoining ? "..." : "Join"}
                    </button>
                  </div>
                ) : secondaryTeamIds && secondaryTeamIds.length > 0 ? (
                  // MULTI-CAMPUS UI
                  <select 
                    value={userTeamId || ""}
                    onChange={(e) => switchWorkspace(e.target.value)}
                    className="w-full bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2 text-xs font-black text-blue-800 outline-none focus:border-blue-500 cursor-pointer shadow-sm transition-all hover:bg-blue-50"
                  >
                    <option value={primaryTeamId || ""}>👑 Primary ({teamNamesMap[primaryTeamId || ""] || "Mother Church"})</option>
                    {secondaryTeamIds.map(id => (
                      <option key={id} value={id}>🌐 {teamNamesMap[id] || `Campus: ${id.substring(0, 8)}...`}</option>
                    ))}
                  </select>
                ) : (
                  // SINGLE CAMPUS UI
                  <div className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-black text-zinc-500 shadow-sm cursor-not-allowed flex items-center gap-2">
                    <span className="opacity-75">👑</span> 
                    <span className="truncate">Primary: ({teamNamesMap[primaryTeamId || ""] || "Mother Church"})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Panel Column 2: The Schedule Modal Blockout Manager */}
            <div className="space-y-4 flex flex-col justify-between">
              <div>
                <h4 className="text-base font-black text-zinc-900 tracking-tight flex items-center gap-1.5">
                  📅 Blockout Schedule Manager
                </h4>
                <p className="text-[11px] font-bold text-zinc-400 mt-0.5">Flag dates you are unavailable to serve to automatically filter yourself out of roster line-ups.</p>
              </div>

              {/* Staged dates listing table corridor */}
              <div className="bg-zinc-50 rounded-2xl border p-3.5 max-h-40 overflow-y-auto custom-scrollbar space-y-1.5 shadow-inner">
                {activeProfile.unavailable_dates.map(dateStr => (
                  <div key={dateStr} className="flex items-center justify-between p-2 bg-white rounded-xl border border-zinc-200/60 text-xs font-bold text-zinc-700">
                    <span>🚫 {dateStr}</span>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveBlockoutDate(dateStr)}
                      className="text-[10px] text-zinc-400 hover:text-red-500 font-bold p-1 px-2 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {activeProfile.unavailable_dates.length === 0 && (
                  <div className="p-4 text-center text-xs italic text-zinc-400 font-medium">Your calendar is completely open. No blockout markers flagged.</div>
                )}
              </div>

              {/* Inline input form node to append future schedule restrictions */}
              <form onSubmit={handleAddBlockoutDateSubmit} className="flex gap-2 pt-2">
                <input 
                  type="date" 
                  required
                  value={newBlockoutDate}
                  onChange={e => setNewBlockoutDate(e.target.value)}
                  className="bg-zinc-50 border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-500 flex-1 cursor-pointer"
                />
                <button 
                  type="submit"
                  disabled={isSavingSchedule}
                  className="px-4 bg-black hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md uppercase tracking-wider transition-all disabled:opacity-40"
                >
                  {isSavingSchedule ? "Syncing..." : "Block Date"}
                </button>
                
              </form>
              {/* ✅ SURGICAL FIX: Restored Logout Button at the bottom of the column */}
              <div className="mt-6 pt-5 border-t border-zinc-100">
                <button 
                  type="button" 
                  onClick={handleLogout}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 font-black text-[11px] uppercase tracking-widest rounded-xl transition-colors shadow-sm"
                >
                  Sign Out
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}