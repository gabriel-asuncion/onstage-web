"use client";

import { useState, useEffect } from "react";
import { useEngine } from "./EngineContext";
import { getAllProfiles, updateUserProfile, updateUserAvailability } from "../../utils/supabase/actions";

interface DBProfile { 
  id: string; 
  full_name: string; 
  email: string; 
  avatar_url?: string; 
  ministries: string[]; 
  unavailable_dates?: string[];
}

const GRID_CARDS = ["VAST", "Pastor", "Dancer", "Musician", "Backup", "Music Leader"];
const POPULAR_WORSHIP_ROLES = [
  { id: "admin", label: "👑 Leader (Admin Viewport)" },
  { id: "member", label: "🎸 Musician (Member Viewport)" }
];

export default function EngineConsole() {
  const { simulatedRole, setSimulatedRole } = useEngine();
  
  const [isDevMenuOpen, setIsDevMenuOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isEditUsersOpen, setIsEditUsersOpen] = useState(false);
  
  const [profiles, setProfiles] = useState<DBProfile[]>([]);
  const [editableProfiles, setEditableProfiles] = useState<DBProfile[]>([]);
  const [isSavingUsers, setIsSavingUsers] = useState(false);
  const [hasAdminChanges, setHasAdminChanges] = useState(false);

  const fetchConsoleUserProfiles = async () => {
    try {
      const dbProfiles = await getAllProfiles();
      setProfiles(dbProfiles as DBProfile[]);
      setEditableProfiles(JSON.parse(JSON.stringify(dbProfiles)));
    } catch (err) {
      console.error("Failed to sync console access profiles registry:", err);
    }
  };

  useEffect(() => {
    if (isEditUsersOpen) fetchConsoleUserProfiles();
  }, [isEditUsersOpen]);

  const handleProfileNameChange = (id: string, newName: string) => { 
    setEditableProfiles(prev => prev.map(p => p.id === id ? { ...p, full_name: newName } : p)); 
    setHasAdminChanges(true); 
  };
  
  const handleMinistryToggle = (id: string, ministry: string) => { 
    setEditableProfiles(prev => prev.map(p => { 
      if (p.id !== id) return p; 
      const hasMin = p.ministries?.includes(ministry); 
      const newMins = hasMin ? p.ministries.filter(m => m !== ministry) : [...(p.ministries || []), ministry]; 
      return { ...p, ministries: newMins }; 
    })); 
    setHasAdminChanges(true); 
  };

  // RESTORED: Admin date blockout toggle handler for multiple profiles
  const handleAdminAvailabilityToggle = (id: string, date: string) => {
    setEditableProfiles(prev => prev.map(p => {
      if (p.id !== id) return p;
      const dates = p.unavailable_dates || [];
      const newDates = dates.includes(date) ? dates.filter(d => d !== date) : [...dates, date];
      return { ...p, unavailable_dates: newDates };
    }));
    setHasAdminChanges(true);
  };

  const saveAdminEdits = async () => { 
    setIsSavingUsers(true); 
    for (const ep of editableProfiles) { 
      const original = profiles.find(p => p.id === ep.id); 
      if (original) {
        const profileChanged = original.full_name !== ep.full_name || 
                               JSON.stringify(original.ministries) !== JSON.stringify(ep.ministries) ||
                               JSON.stringify(original.unavailable_dates) !== JSON.stringify(ep.unavailable_dates); 
        if (profileChanged) { 
          await updateUserProfile(ep.id, ep.full_name, ep.email, ep.avatar_url || "", ep.ministries || []); 
          await updateUserAvailability(ep.id, ep.unavailable_dates || []); // Persists blocked out selections
        } 
      } 
    } 
    await fetchConsoleUserProfiles(); 
    setIsSavingUsers(false); 
    setHasAdminChanges(false); 
    setIsEditUsersOpen(false); 
  };

  return (
    <>
      {/* FLOATING ACTION ENGINE FAB TRIGGER */}
      <div className="fixed bottom-6 right-6 z-[99999] flex flex-col items-end gap-3 pointer-events-auto">
        {isDevMenuOpen && (
          <div className="bg-zinc-950 p-4 rounded-3xl w-64 space-y-2 text-zinc-400 text-xs border border-zinc-800 shadow-2xl animate-in fade-in slide-in-from-bottom-4 relative">
            <div className="mb-2 border-b border-zinc-800 pb-2">
              <button onClick={() => { setIsEditUsersOpen(true); setIsDevMenuOpen(false); }} className="w-full text-left p-3 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white font-bold transition-colors flex items-center gap-2">👥 Database Users Admin</button>
            </div>
            <div>
              <button 
                type="button"
                onClick={() => { setIsRoleModalOpen(true); setIsDevMenuOpen(false); }} 
                className="w-full text-left p-3 rounded-xl bg-zinc-900 text-zinc-200 hover:bg-zinc-800 font-bold transition-colors flex items-center justify-between gap-2 border border-zinc-800 shadow-sm"
              >
                <span>🎭 Simulate Access Role</span>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-black bg-zinc-800 border border-zinc-700/60 text-zinc-400">
                  {simulatedRole === "admin" ? "Admin" : simulatedRole === "member" ? "Member" : "Real Off"}
                </span>
              </button>
            </div>
          </div>
        )}
        <button onClick={() => setIsDevMenuOpen(!isDevMenuOpen)} className="h-14 px-6 rounded-full bg-zinc-900 text-white font-bold border border-zinc-700 shadow-xl text-[13px] uppercase tracking-wider hover:bg-black hover:scale-105 transition-all active:scale-95 relative">🛠️ Engine</button>
      </div>

      {/* ACCESS LEVEL SELECTION PORTAL OVERLAY */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-md z-[110000] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm border border-zinc-200 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div>
              <h4 className="text-lg font-black text-zinc-900 tracking-tight">Simulate Environment Scope</h4>
              <p className="text-xs text-zinc-400 font-medium mt-0.5">Toggle parameters or drop back down into your real authenticated context cleanly.</p>
            </div>
            <div className="space-y-2">
              {POPULAR_WORSHIP_ROLES.map(roleItem => (
                <button 
                  key={roleItem.id}
                  type="button" 
                  onClick={() => { setSimulatedRole(roleItem.id as any); setIsRoleModalOpen(false); }} 
                  className={`w-full text-left p-4 rounded-2xl border font-bold text-xs flex items-center justify-between transition-all ${
                    simulatedRole === roleItem.id ? "border-blue-500 bg-blue-50/50 text-blue-700 font-black shadow-inner" : "border-zinc-200 hover:bg-zinc-50 text-zinc-700"
                  }`}
                >
                  <span>{roleItem.label}</span>
                  {simulatedRole === roleItem.id && <span className="text-blue-600 font-extrabold">✓</span>}
                </button>
              ))}
              <hr className="border-zinc-100 my-1.5" />
              <button 
                type="button" 
                onClick={() => { setSimulatedRole("none"); setIsRoleModalOpen(false); }} 
                className={`w-full text-left p-4 rounded-2xl border font-bold text-xs flex items-center justify-between transition-all ${
                  simulatedRole === "none" ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-black" : "border-zinc-200 hover:bg-emerald-50/40 text-zinc-500 hover:text-emerald-600"
                }`}
              >
                <span>🔒 Simulation OFF (Use My Real Account)</span>
                {simulatedRole === "none" && <span className="text-emerald-600 font-black uppercase text-[10px] tracking-wide px-2 py-0.5 bg-emerald-100 rounded-md">Active</span>}
              </button>
            </div>
            <button type="button" onClick={() => setIsRoleModalOpen(false)} className="w-full py-3 bg-zinc-900 hover:bg-black text-white text-xs font-black tracking-wider uppercase rounded-xl block mt-1">Close</button>
          </div>
        </div>
      )}

      {/* RE-ESTABLISHED USER MANAGER DIALOG WITH VISUAL BLOCKOUT TOGGLE SWATCHES */}
      {isEditUsersOpen && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center z-[110000] p-4 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[85vh] relative animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50 z-20 relative">
              <div>
                <h3 className="text-xl font-extrabold text-zinc-900 tracking-tight">Database Users Admin</h3>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">Manage user profiles and assigned ministry permissions securely.</p>
              </div>
              <button onClick={() => { setIsEditUsersOpen(false); setHasAdminChanges(false); setEditableProfiles(JSON.parse(JSON.stringify(profiles))); }} className="w-8 h-8 rounded-full bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center text-sm font-bold text-zinc-600 transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-zinc-50/50 pb-28 max-h-[60vh] custom-scrollbar">
              {editableProfiles.map(p => (
                <div key={p.id} className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4 border-b border-zinc-100 pb-4">
                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover border border-zinc-100" /> : <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg border border-blue-200">{p.full_name?.charAt(0) || "U"}</div>}
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1 block">Display Name</label>
                      <input type="text" value={p.full_name} onChange={(e) => handleProfileNameChange(p.id, e.target.value)} className="w-full font-bold text-[15px] text-zinc-900 border-b border-zinc-200 focus:border-blue-500 outline-none pb-1 bg-transparent transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 block">Assigned Ministry Skills</label>
                    <div className="flex flex-wrap gap-2">
                      {GRID_CARDS.map(skill => {
                        const hasSkill = p.ministries?.includes(skill);
                        return (
                          <button key={skill} onClick={() => handleMinistryToggle(p.id, skill)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${hasSkill ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'}`}>{hasSkill && "✓ "}{skill}</button>
                        );
                      })}
                    </div>
                  </div>

                  {/* RESTORED ADMINISTRATIVE BLOCKOUT GRID SWATCHES */}
                  <div className="pt-3 border-t border-zinc-100">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-2">Availability Matrix (June 2026)</label>
                    <div className="flex flex-wrap gap-1 bg-zinc-50 p-2.5 rounded-xl border max-h-36 overflow-y-auto custom-scrollbar">
                      {Array.from({ length: 30 }, (_, i) => {
                        const dayNum = i + 1;
                        const dateStr = `2026-06-${String(dayNum).padStart(2, "0")}`;
                        const isUnavailable = p.unavailable_dates?.includes(dateStr);
                        return (
                          <button
                            key={dayNum}
                            type="button"
                            onClick={() => handleAdminAvailabilityToggle(p.id, dateStr)}
                            className={`px-2.5 py-1 text-xs rounded-lg border font-bold text-center transition-all ${
                              isUnavailable ? 'bg-red-50 border-red-200 text-red-600 font-extrabold' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                            }`}
                          >
                            {dayNum}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className={`absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-zinc-200 p-4 sm:px-8 flex items-center justify-between transition-transform duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] z-50 ${hasAdminChanges ? 'translate-y-0' : 'translate-y-full'}`}>
              <div>
                <p className="text-sm font-extrabold text-zinc-900">Unsaved User Edits</p>
                <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Commit edits safely to the central user cache</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { setEditableProfiles(JSON.parse(JSON.stringify(profiles))); setHasAdminChanges(false); }} className="px-4 py-2.5 text-xs font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl transition-colors">Discard</button>
                <button onClick={saveAdminEdits} disabled={isSavingUsers} className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 shadow-md transition-all active:scale-95">{isSavingUsers ? "Saving..." : "Save Changes"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}