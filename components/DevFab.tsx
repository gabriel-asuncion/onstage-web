"use client";

import { useState, useEffect } from "react";
import { useEngine } from "../app/context/EngineContext";
import { createClient } from "../utils/supabase/client";

interface DBProfileRow {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  ministries: string[];
  unavailable_dates: string[];
}

const AVAILABLE_MINISTRY_POSITIONS = ["VAST", "Pastor", "Dancer", "Musician", "Backup", "Music Leader"];

export default function DevFab() {
  const supabase = createClient();
  const { simulatedRole, setSimulatedRole } = useEngine();
  
  // Viewport Draggable Drag and Drop States
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  // Master Global User Directory Management Modals
  const [isGlobalModalOpen, setIsGlobalModalOpen] = useState(false);
  const [globalProfiles, setGlobalProfiles] = useState<DBProfileRow[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  
  // Active editing profile focus nodes
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formMinistries, setFormMinistries] = useState<string[]>([]);
  const [formDates, setFormDates] = useState<string[]>([]);
  const [stagedNewBlockoutDate, setStagedNewBlockoutDate] = useState("2026-06-14");
  const [isSavingData, setIsSavingData] = useState(false);

  // Sync structural boundaries upon view mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      setPosition({ x: window.innerWidth - 80, y: window.innerHeight - 80 });
    }
  }, []);

  async function syncGlobalDatabaseProfiles() {
    setLoadingProfiles(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, ministries, unavailable_dates")
      .order("full_name", { ascending: true });
    
    if (!error && data) {
      setGlobalProfiles(data as DBProfileRow[]);
    }
    setLoadingProfiles(false);
  }

  useEffect(() => {
    if (isGlobalModalOpen) {
      syncGlobalDatabaseProfiles();
      setEditingProfileId(null);
    }
  }, [isGlobalModalOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      setPosition(prev => ({
        x: Math.min(Math.max(16, prev.x), window.innerWidth - 70),
        y: Math.min(Math.max(16, prev.y), window.innerHeight - 70)
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Universal pointer-events tracker (Prevents click/drag conflicts)
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = position.x;
    const initialY = position.y;
    let dragTriggered = false;

    const targetButton = e.currentTarget;
    targetButton.setPointerCapture(e.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        dragTriggered = true;
        setIsDragging(true);
      }

      setPosition({
        x: Math.min(Math.max(16, initialX + deltaX), dimensions.width - 64),
        y: Math.min(Math.max(16, initialY + deltaY), dimensions.height - 64)
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      targetButton.releasePointerCapture(upEvent.pointerId);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);

      if (!dragTriggered) {
        setIsOpen(prev => !prev);
      }
      setTimeout(() => setIsDragging(false), 40);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  // Profile Form Context Switcher Actions
  function handleTriggerTargetedEditMode(profile: DBProfileRow) {
    setEditingProfileId(profile.id);
    setFormName(profile.full_name || "");
    setFormMinistries(profile.ministries || []);
    setFormDates(profile.unavailable_dates || []);
  }

  function handleToggleFormMinistrySelection(tag: string) {
    setFormMinistries(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }

  function handleAppendFormBlockoutDate() {
    if (!stagedNewBlockoutDate || formDates.includes(stagedNewBlockoutDate)) return;
    setFormDates([...formDates, stagedNewBlockoutDate].sort());
  }

  function handleRemoveFormBlockoutDate(dateStr: string) {
    setFormDates(formDates.filter(d => d !== dateStr));
  }

  async function handleCommitProfileEditsToDB(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProfileId || !formName.trim() || isSavingData) return;

    setIsSavingData(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: formName.trim(),
        ministries: formMinistries,
        unavailable_dates: formDates
      })
      .eq("id", editingProfileId);

    if (!error) {
      setGlobalProfiles(prev => 
        prev.map(p => p.id === editingProfileId 
          ? { ...p, full_name: formName.trim(), ministries: formMinistries, unavailable_dates: formDates } 
          : p
        )
      );
      setEditingProfileId(null);
    } else {
      alert(`Database Mutation Blocked: ${error.message}`);
    }
    setIsSavingData(false);
  }

  if (position.x === 0 && position.y === 0) return null;

  // Anti-clipping floating window boundaries calculator
  const popupWidth = 250;
  const popupHeight = 155;
  const computedLeft = Math.min(dimensions.width - popupWidth - 24, Math.max(16, position.x - 95));
  const isTopHalf = position.y < dimensions.height / 2;
  const computedTop = isTopHalf ? position.y + 68 : Math.max(16, position.y - popupHeight - 16);

  return (
    <>
      {/* ======================================================== */}
      {/* --- SMALL FLOATING QUICK PERMISSIONS CONTROLS CONSOLE --- */}
      {/* ======================================================== */}
      {isOpen && !isGlobalModalOpen && (
        <div 
          style={{ left: `${computedLeft}px`, top: `${computedTop}px`, width: `${popupWidth}px` }}
          className="fixed bg-[#0c1527] text-white p-4 rounded-2xl shadow-2xl border border-zinc-800 z-[999998] flex flex-col gap-3 select-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <h5 className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Dev Simulation Context</h5>
            </div>
          </div>
          
          <div className="flex items-center justify-between gap-2 text-xs font-bold">
            <span className="text-zinc-400 font-medium">Access Role</span>
            <select 
              value={simulatedRole} 
              onChange={(e) => setSimulatedRole(e.target.value as any)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] font-black text-white outline-none cursor-pointer focus:border-blue-500"
            >
              <option value="admin">ADMIN</option>
              <option value="member">MUSICIAN</option>
              <option value="none">NONE (AUTH)</option>
            </select>
          </div>

          {/* Core Redirect Action Trigger to open the wide manager view */}
          <button
            type="button"
            onClick={() => { setIsGlobalModalOpen(true); setIsOpen(false); }}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-colors text-center"
          >
            👥 Open Global User Manager
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* --- COMPLETE MASTER PROFILES DIRECTORY OVERLAY MODAL --- */}
      {/* ======================================================== */}
      {isGlobalModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[250000] flex items-center justify-center p-4 md:p-6 select-none animate-in fade-in duration-150">
          <div className="bg-[#f8f9fa] rounded-[2.5rem] shadow-2xl border w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-150">
            
            {/* Modal Top Bar Layout Cap */}
            <div className="bg-white border-b border-zinc-200 px-8 py-5 flex items-center justify-between flex-shrink-0">
              <div className="space-y-0.5">
                <h3 className="font-black text-xl text-zinc-900 tracking-tight flex items-center gap-2">
                  <span>👥</span> Global User Accounts Registry
                </h3>
                <p className="text-xs font-bold text-zinc-400">Database administrative controller overrides engine panel context nodes.</p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsGlobalModalOpen(false)}
                className="w-9 h-9 rounded-full bg-zinc-50 hover:bg-zinc-100 text-zinc-400 font-bold text-xs border flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Core Scrollable Users Display Layout Canvas */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-4">
              {loadingProfiles ? (
                <div className="text-center py-20 text-xs font-black uppercase text-zinc-400 tracking-widest animate-pulse">Querying Database User Registries Matrix...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {globalProfiles.map((profile) => {
                    const isRowEditingActive = editingProfileId === profile.id;

                    return (
                      <div 
                        key={profile.id} 
                        className={`bg-white border rounded-[2rem] p-6 shadow-sm transition-all duration-150 ${
                          isRowEditingActive ? "border-blue-500 ring-2 ring-blue-500/10" : "border-zinc-200"
                        }`}
                      >
                        {isRowEditingActive ? (
                          // ==========================================
                          // --- COMPILER SUB-FORM MODIFICATION MODULE -
                          // ==========================================
                          <form onSubmit={handleCommitProfileEditsToDB} className="space-y-4 animate-in fade-in duration-100">
                            
                            {/* Input Node 1: Full Name signature tracking */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Modify Full Name Signature</label>
                              <input 
                                type="text" 
                                required 
                                value={formName} 
                                onChange={e => setFormName(e.target.value)} 
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2 text-xs font-bold text-zinc-800 outline-none focus:border-blue-500 focus:bg-white" 
                              />
                            </div>

                            {/* Input Node 2: Checkboxes matrices for Skill Position Deployments */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Assigned Workspace Positions</label>
                              <div className="flex flex-wrap gap-1.5">
                                {AVAILABLE_MINISTRY_POSITIONS.map(tag => {
                                  const isChecked = formMinistries.includes(tag);
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() => handleToggleFormMinistrySelection(tag)}
                                      className={`px-3 py-1 rounded-xl text-[10px] font-black border transition-all ${
                                        isChecked 
                                          ? "bg-blue-600 text-white border-blue-500 shadow-sm" 
                                          : "bg-zinc-50 text-zinc-400 border-zinc-200 hover:bg-zinc-100 hover:text-zinc-600"
                                      }`}
                                    >
                                      {isChecked ? `✓ ${tag}` : tag}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Input Node 3: Calendar Blockout Schedule Arrays Pipeline */}
                            <div className="space-y-2 pt-1">
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Date Blocked Roster Schedule Manager</label>
                              
                              <div className="flex flex-wrap gap-1.5 bg-zinc-50 p-2.5 rounded-xl border max-h-24 overflow-y-auto custom-scrollbar">
                                {formDates.map(dStr => (
                                  <span key={dStr} className="inline-flex items-center gap-1 bg-white border border-zinc-200 px-2 py-0.5 rounded-lg text-[10px] font-bold text-zinc-700 shadow-sm">
                                    🚫 {dStr}
                                    <button type="button" onClick={() => handleRemoveFormBlockoutDate(dStr)} className="ml-1 text-[10px] font-bold text-zinc-400 hover:text-red-500">✕</button>
                                  </span>
                                ))}
                                {formDates.length === 0 && <span className="text-[10px] italic text-zinc-400 p-1 font-medium">Calendar is completely open.</span>}
                              </div>

                              <div className="flex gap-2">
                                <input 
                                  type="date" 
                                  value={stagedNewBlockoutDate} 
                                  onChange={e => setStagedNewBlockoutDate(e.target.value)} 
                                  className="bg-zinc-50 border rounded-xl px-2.5 py-1.5 text-[11px] font-bold outline-none cursor-pointer focus:border-blue-500" 
                                />
                                <button type="button" onClick={handleAppendFormBlockoutDate} className="px-3 bg-zinc-950 text-white font-black text-[10px] uppercase tracking-wider rounded-xl hover:bg-zinc-800 transition-colors">Block Date</button>
                              </div>
                            </div>

                            {/* Actions layout rows */}
                            <div className="flex gap-2 pt-3 border-t border-zinc-100">
                              <button type="button" onClick={() => setEditingProfileId(null)} className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-500 text-xs font-bold rounded-xl">Cancel</button>
                              <button type="submit" disabled={isSavingData} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-sm">{isSavingData ? "Syncing..." : "Save Edits"}</button>
                            </div>

                          </form>
                        ) : (
                          // ==========================================
                          // --- STATIC DIRECTORY LOOKUP DISCOVERY ROW -
                          // ==========================================
                          <div className="space-y-4 flex flex-col justify-between h-full min-h-[160px]">
                            <div className="space-y-3.5">
                              <div className="flex items-center gap-3">
                                {profile.avatar_url ? (
                                  <img src={profile.avatar_url} className="w-12 h-12 rounded-xl object-cover border" alt="" />
                                ) : (
                                  <div className="w-12 h-12 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-sm">{profile.full_name?.charAt(0)}</div>
                                )}
                                <div className="min-w-0 leading-tight">
                                  <h4 className="font-extrabold text-[15px] text-zinc-900 truncate">{profile.full_name}</h4>
                                  <p className="text-xs text-zinc-400 font-bold truncate mt-0.5">{profile.email}</p>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {profile.ministries?.map(m => (
                                    <span key={m} className="text-[9px] bg-zinc-50 border border-zinc-200/60 text-zinc-500 font-black px-2 py-0.5 rounded-md uppercase tracking-tight">{m}</span>
                                  ))}
                                  {(!profile.ministries || profile.ministries.length === 0) && <span className="text-[10px] text-zinc-400 italic font-medium">No position groups assigned.</span>}
                                </div>

                                <div className="text-[11px] font-bold text-zinc-400 flex items-center gap-1.5 truncate max-w-full">
                                  <span>🚫 Blocked:</span>
                                  <span className="text-zinc-600 truncate font-semibold">
                                    {profile.unavailable_dates?.length > 0 ? profile.unavailable_dates.join(", ") : "None"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="pt-3 border-t border-zinc-100">
                              <button
                                type="button"
                                onClick={() => handleTriggerTargetedEditMode(profile)}
                                className="w-full py-2 bg-zinc-50 border border-zinc-200 text-zinc-800 hover:bg-zinc-950 hover:text-white hover:border-zinc-950 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-inner text-center cursor-pointer"
                              >
                                Modify Profile
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* --- BULLETPROOF MOVABLE DRAGGABLE CIRCULAR FAB --------- */}
      {/* ======================================================== */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className={`fixed w-14 h-14 rounded-full bg-[#0c1527] border border-zinc-800 text-white flex items-center justify-center shadow-2xl z-[999998] select-none transition-transform hover:scale-105 active:scale-95 duration-75 touch-none ${
          isDragging ? "cursor-grabbing opacity-75" : "cursor-grab"
        } ${isOpen || isGlobalModalOpen ? "ring-4 ring-blue-500/30 border-blue-500 bg-zinc-950" : ""}`}
        title="Drag anywhere to reposition workspace tools. Click once to pull up global configuration panel overrides."
      >
        <span className="text-lg pointer-events-none select-none">
          {simulatedRole === "admin" ? "🛠️" : simulatedRole === "member" ? "🎵" : "👤"}
        </span>
      </button>
    </>
  );
}