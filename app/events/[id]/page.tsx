"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEngine } from "../../context/EngineContext";
import { 
  getUserTeam, getAllProfiles, addTeamMember, removeTeamMember, 
  getAuthUserProfile, getAllSongs, getSongChordChart
} from "../../../utils/supabase/actions";

interface DBProfile { id: string; full_name: string; email: string; avatar_url?: string; ministries: string[]; unavailable_dates?: string[]; }
interface MemberRow { id: string; role: string; user_id: string; profiles: DBProfile | null; isNew?: boolean; }
interface SetlistSongItem { 
  id: string; 
  sequence_order: number; 
  start_time: string; 
  parent_group?: string | null;
  group_name?: string | null; 
  parent_color?: string | null;
  group_color?: string | null;
  assigned_user_ids?: string[] | null; 
  songs: any | null; 
}
interface EventItem { id: string; title: string; event_date: string; description: string; service_type?: string; team_id?: string; }
interface SetlistMetaItem { id: string; name: string; event_id: string; }

const GRID_CARDS = ["VAST", "Pastor", "Dancer", "Musician", "Backup", "Music Leader"];
const MAX_AVATARS = 6;
const ACTIVE_SERVICE_DATE = "2026-06-12";
const SERVICE_TYPE_PRESETS = ["Midweek Service", "Divine Service", "Camp", "Concert", "Fellowship"];

const COLOR_PALETTES = [
  { id: "zinc", border: "border-zinc-200", bg: "bg-zinc-50/40", text: "text-zinc-700", dot: "bg-zinc-400" },
  { id: "blue", border: "border-blue-200", bg: "bg-blue-50/60", text: "text-blue-700", dot: "bg-blue-500" },
  { id: "emerald", border: "border-emerald-200", bg: "bg-emerald-50/60", text: "text-emerald-700", dot: "bg-emerald-500" },
  { id: "purple", border: "border-purple-200", bg: "bg-purple-50/60", text: "text-purple-700", dot: "bg-purple-500" },
  { id: "amber", border: "border-amber-200", bg: "bg-amber-50/60", text: "text-amber-700", dot: "bg-amber-500" },
  { id: "rose", border: "border-rose-200", bg: "bg-rose-50/60", text: "text-rose-700", dot: "bg-rose-500" },
  { id: "indigo", border: "border-indigo-200", bg: "bg-indigo-50/60", text: "text-indigo-700", dot: "bg-indigo-500" },
  { id: "cyan", border: "border-cyan-200", bg: "bg-cyan-50/60", text: "text-cyan-700", dot: "bg-cyan-500" }
];

function formatTo12Hour(timeStr: string = "00:00") {
  if (!timeStr) return "12:00 AM";
  const [hourStr, minStr] = timeStr.split(":");
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12; hour = hour ? hour : 12;
  return `${hour}:${minStr} ${ampm}`;
}

export default function EventCockpitPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const eventId = params?.id as string; 
  const { simulatedRole } = useEngine();

  const [hasMounted, setHasMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [profiles, setProfiles] = useState<DBProfile[]>([]);
  const [team, setTeam] = useState<any>(null);
  
  // Roster Management States
  const [roster, setRoster] = useState<MemberRow[]>([]);
  const [stagedRoster, setStagedRoster] = useState<MemberRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Event & Setlist Framework States
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [eventSetlists, setEventSetlists] = useState<SetlistMetaItem[]>([]);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>("");

  // Track Stack States
  const [setlistSongs, setSetlistSongs] = useState<SetlistSongItem[]>([]); 
  const [stagedSetlistSongs, setStagedSetlistSongs] = useState<SetlistSongItem[]>([]); 
  const [hasSetlistChanges, setHasSetlistChanges] = useState(false);
  const [allDatabaseSongs, setAllDatabaseSongs] = useState<any[]>([]);

  // Subview Layout Toggles
  const [viewSubScreen, setViewSubScreen] = useState<"matrix" | "setlists_list" | "songs_view">("matrix");
  const [isEditingSetlist, setIsEditingSetlist] = useState(false); 
  const [selectedNewSongId, setSelectedNewSongId] = useState("");
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [isSongDropdownOpen, setIsSongDropdownOpen] = useState(false);
  const [songSearchQuery, setSongSearchQuery] = useState("");

  // Reordering & Grouping States
  const [draggedSongIndex, setDraggedSongIndex] = useState<number | null>(null);
  const [customGroupName, setCustomGroupName] = useState("");
  const [selectedGroupColor, setSelectedGroupColor] = useState("blue");

  const [focusedRole, setFocusedRole] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);

  const [isCreateSetlistOpen, setIsCreateSetlistOpen] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState("");

  const [isEditEventOpen, setIsEditEventOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editServiceType, setEditServiceType] = useState("Divine Service");
  const [editDesc, setEditDesc] = useState("");
  const [isUpdatingEvent, setIsUpdatingEvent] = useState(false);

  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [timePickerTargetItemId, setTimePickerTargetItemId] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState("08");
  const [selectedMinute, setSelectedMinute] = useState("00");
  const [selectedPeriod, setSelectedPeriod] = useState("AM");
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // ==========================================
  // --- DATA PIPELINE INTEGRATION ------------
  // ==========================================

  async function syncRosterUI(currentTeamId: string, allProfilesData: DBProfile[]) {
    const { data: rawRoster, error } = await supabase
      .from("team_members")
      .select("id, role, user_id")
      .eq("event_id", eventId);

    if (error) return;
    const mappedRoster = (rawRoster || []).map(row => {
      const p = allProfilesData.find(profile => profile.id === row.user_id);
      return { ...row, profiles: p || null };
    });
    setRoster(mappedRoster as MemberRow[]);
    setStagedRoster(mappedRoster as MemberRow[]); 
    setHasChanges(false);
  }

  async function fetchEventSetlists(targetEventId: string) {
    const { data, error } = await supabase
      .from("setlists")
      .select("id, name, event_id")
      .eq("event_id", targetEventId);

    if (!error && data && data.length > 0) {
      setEventSetlists(data);
      setSelectedSetlistId(data[0].id);
      await fetchLiveSetlistTracks(data[0].id);
    } else {
      setEventSetlists([]);
      setSelectedSetlistId("");
      setStagedSetlistSongs([]);
    }
  }

  async function fetchLiveSetlistTracks(setlistId: string) {
    if (!setlistId) return;
    const { data } = await supabase
      .from("setlist_songs")
      .select(`id, sequence_order, start_time, group_name, assigned_user_ids, group_color, parent_color, songs (*)`)
      .eq("setlist_id", setlistId)
      .order("sequence_order", { ascending: true });
    
    const formattedData = (data || []).map(row => {
      let rawGroup = row.group_name || null;
      let pName = null;
      let cName = rawGroup;
      if (rawGroup && rawGroup.includes(" >> ")) {
        const parts = row.group_name.split(" >> ");
        pName = parts[0]; cName = parts[1];
      }
      return {
        ...row, parent_group: pName, group_name: cName,
        parent_color: (row as any).parent_color || "zinc",
        group_color: (row as any).group_color || "zinc",
        assigned_user_ids: row.assigned_user_ids || []
      };
    }) as unknown as SetlistSongItem[];
    setSetlistSongs(formattedData); 
    setStagedSetlistSongs(formattedData);
    setHasSetlistChanges(false);
  }

  async function loadData() {
    try {
      const dbProfiles = await getAllProfiles();
      const uniqueProfilesMap = new Map<string, DBProfile>();
      (dbProfiles as DBProfile[]).forEach(p => { if (!uniqueProfilesMap.has(p.id)) uniqueProfilesMap.set(p.id, p); });
      const combinedProfiles = Array.from(uniqueProfilesMap.values());
      setProfiles(combinedProfiles);

      const userTeam = await getUserTeam();
      const targetTeam = userTeam || { id: "00000000-0000-0000-0000-000000000000", name: "OnPraise Ministry Team" };
      setTeam(targetTeam);

      const { data: eventData } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      if (eventData) {
        setActiveEvent({ 
          id: eventData.id, 
          title: eventData.title, 
          event_date: eventData.event_date || eventData.date, 
          service_type: eventData.service_type, 
          description: eventData.description,
          team_id: eventData.team_id
        });
      } else {
        setActiveEvent({ id: eventId, title: "June Week#3 2026", event_date: "2026-06-12", service_type: "Divine Service", description: "Operational block frame details." });
      }

      await fetchEventSetlists(eventId);
      await syncRosterUI(targetTeam.id, combinedProfiles);
      setAllDatabaseSongs(await getAllSongs());
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // ==========================================
  // --- INTERACTION HANDLERS -----------------
  // ==========================================

  function handleStartRehearsal() {
    if (!selectedSetlistId) return;
    router.push(`/setlists/${selectedSetlistId}/live`);
  }

  function handleOpenEditEventModal() {
    if (!activeEvent) return;
    setEditTitle(activeEvent.title);
    setEditDate(activeEvent.event_date ? activeEvent.event_date.split("T")[0] : "2026-06-12");
    setEditServiceType(activeEvent.service_type || "Divine Service"); 
    setEditDesc(activeEvent.description || "");
    setIsEditEventOpen(true);
  }

  async function handleUpdateEventSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitle.trim()) return;
    setIsUpdatingEvent(true);

    try {
      const { error } = await supabase
        .from("events")
        .update({
          title: editTitle.trim(),
          event_date: editDate,
          service_type: editServiceType, 
          description: editDesc.trim()
        })
        .eq("id", eventId);

      if (!error) {
        setActiveEvent(prev => prev ? { ...prev, title: editTitle, event_date: editDate, service_type: editServiceType, description: editDesc } : null);
        setIsEditEventOpen(false);
      } else {
        alert(`Update Failed: ${error.message}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdatingEvent(false);
    }
  }

  function handleLocalAddOrMove(userId: string, targetRole: string, sourceRole: string | null = null) {
    if (simulatedRole !== "admin") return;
    if (stagedRoster.some(r => r.user_id === userId && r.role === targetRole)) return; 
    let newRoster = [...stagedRoster];
    if (sourceRole && sourceRole !== targetRole) newRoster = newRoster.filter(r => !(r.user_id === userId && r.role === sourceRole));
    const p = profiles.find(x => x.id === userId);
    setStagedRoster([...newRoster, { id: `temp-${Date.now()}`, role: targetRole, user_id: userId, profiles: p || null, isNew: true }]);
    setHasChanges(true);
  }
  
  function handleDropdownSubmit(e: React.FormEvent) { e.preventDefault(); if (selectedUserId && focusedRole) { handleLocalAddOrMove(selectedUserId, focusedRole); setSelectedUserId(""); setFocusedRole(null); } }
  function handleOriginalLocalRemove(rowId: string) { if (simulatedRole !== "admin") return; setStagedRoster(prev => prev.filter(r => r.id !== rowId)); setHasChanges(true); }
  
  async function saveLineupChanges() { 
    if (simulatedRole !== "admin") return;
    setIsDeploying(true); 
    
    try {
      const removedIds = roster.filter(r => !stagedRoster.some(sr => sr.id === r.id)).map(r => r.id); 
      for (const id of removedIds) {
        const { error: delError } = await supabase.from("team_members").delete().eq("id", id);
        if (delError) {
          alert(`Deletion Error: ${delError.message}`);
          setIsDeploying(false);
          return;
        }
      }

      const addedRows = stagedRoster.filter(sr => sr.isNew); 
      for (const row of addedRows) {
        const targetTeamId = activeEvent?.team_id || team?.id;
        const payload: any = {
          event_id: eventId,
          user_id: row.user_id,
          role: row.role
        };

        if (targetTeamId && targetTeamId !== "00000000-0000-0000-0000-000000000000") {
          payload.team_id = targetTeamId;
        }

        const { error: insError } = await supabase.from("team_members").insert(payload);
        if (insError) {
          alert(`Database Write Rejected: ${insError.message}`);
          setIsDeploying(false);
          return;
        }
      }

      await syncRosterUI(eventId, profiles); 
      setHasChanges(false);
      alert("🎉 Lineup successfully synchronized and saved to the database!");
    } catch (err: any) {
      alert(`Runtime Exception: ${err.message || err}`);
    } finally {
      setIsDeploying(false); 
    }
  }

  async function handleCreateSetlistBlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newSetlistName.trim()) return;

    try {
      const payload: any = {
        event_id: eventId,
        name: newSetlistName.trim(),
        service_date: activeEvent?.event_date ? activeEvent.event_date.split("T")[0] : ACTIVE_SERVICE_DATE
      };

      if (team?.id && team.id !== "00000000-0000-0000-0000-000000000000") {
        payload.team_id = team.id;
      }

      const { data, error } = await supabase
        .from("setlists")
        .insert(payload)
        .select()
        .maybeSingle();

      if (error) {
        alert(`Failed to build block: ${error.message}`);
        return;
      }

      if (data) {
        setEventSetlists(prev => [...prev, data]);
        setSelectedSetlistId(data.id);
        await fetchLiveSetlistTracks(data.id);
        setIsCreateSetlistOpen(false); 
        setNewSetlistName("");
        setViewSubScreen("songs_view");
      }
    } catch (err) { 
      console.error(err); 
    }
  }

  async function handleAddSongSubmit() {
    if (simulatedRole !== "admin") return;
    if (!selectedNewSongId) return;
    const songToAdd = allDatabaseSongs.find(s => s.id === selectedNewSongId);
    if (!songToAdd) return;
    const optimisticItem: SetlistSongItem = { id: `temp-${Date.now()}`, sequence_order: stagedSetlistSongs.length + 1, start_time: "08:30", assigned_user_ids: [], parent_group: null, group_name: null, songs: songToAdd };
    setStagedSetlistSongs(prev => [...prev, optimisticItem]);
    setHasSetlistChanges(true); setSelectedNewSongId(""); setSongSearchQuery(""); setIsSongDropdownOpen(false);
  }

  async function saveSetlistChanges() {
    if (simulatedRole !== "admin") return;
    setIsDeploying(true);
    let hasErrors = false;
    const removedIds = setlistSongs.filter(s => !stagedSetlistSongs.some(st => st.id === s.id)).map(r => r.id);
    if (removedIds.length > 0) {
      const { error } = await supabase.from('setlist_songs').delete().in('id', removedIds);
      if (error) hasErrors = true;
    }
    for (const item of stagedSetlistSongs) {
      const dbGroupName = item.parent_group ? `${item.parent_group} >> ${item.group_name}` : item.group_name || null;
      const payload = { sequence_order: item.sequence_order, group_name: dbGroupName, assigned_user_ids: item.assigned_user_ids || [], start_time: item.start_time || "08:30", group_color: item.group_color || "zinc", parent_color: item.parent_color || "zinc" };
      if (item.id.startsWith('temp-')) {
        await supabase.from('setlist_songs').insert({ setlist_id: selectedSetlistId, song_id: item.songs.id, ...payload });
      } else {
        await supabase.from('setlist_songs').update(payload).eq('id', item.id);
      }
    }
    if (!hasErrors) await fetchLiveSetlistTracks(selectedSetlistId);
    setIsDeploying(false);
  }

  function handleSaveTimeSelection() {
    if (!timePickerTargetItemId) return;
    let finalHour = parseInt(selectedHour, 10);
    if (selectedPeriod === "PM" && finalHour !== 12) finalHour += 12;
    if (selectedPeriod === "AM" && finalHour === 12) finalHour = 0;
    const formatted24hTime = `${String(finalHour).padStart(2, "0")}:${selectedMinute}`;
    setStagedSetlistSongs(prev => prev.map(s => s.id === timePickerTargetItemId ? { ...s, start_time: formatted24hTime } : s));
    setHasSetlistChanges(true); setIsTimePickerOpen(false); setTimePickerTargetItemId(null);
  }

  // Drag and drop sequencing
  function handleDragStart(index: number) {
    if (simulatedRole !== "admin") return;
    setDraggedSongIndex(index);
  }

  function handleDragOver(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (draggedSongIndex === null || draggedSongIndex === targetIndex || simulatedRole !== "admin") return;
    
    const reorderedSongs = [...stagedSetlistSongs];
    const [removed] = reorderedSongs.splice(draggedSongIndex, 1);
    reorderedSongs.splice(targetIndex, 0, removed);
    
    const freshlyOrdered = reorderedSongs.map((song, i) => ({ ...song, sequence_order: i + 1 }));
    setStagedSetlistSongs(freshlyOrdered);
    setDraggedSongIndex(targetIndex);
    setHasSetlistChanges(true);
  }

  function handleToggleCheckboxSelect(id: string) {
    setSelectedForGroup(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function applyGroupTransformation() {
    if (selectedForGroup.length === 0 || simulatedRole !== "admin") return;
    const finalGroupName = customGroupName.trim() || null;
    
    const updatedSongs = stagedSetlistSongs.map(song => {
      if (selectedForGroup.includes(song.id)) {
        return { ...song, group_name: finalGroupName, group_color: selectedGroupColor };
      }
      return song;
    });

    setStagedSetlistSongs(updatedSongs);
    setHasSetlistChanges(true);
    setSelectedForGroup([]);
    setCustomGroupName("");
  }

  const songFilteredDatabaseSongs = allDatabaseSongs.filter(s => s.title.toLowerCase().includes(songSearchQuery.toLowerCase()));
  const targetFilterDate = activeEvent?.event_date ? activeEvent.event_date.split("T")[0] : ACTIVE_SERVICE_DATE;
  
  const availablePool = profiles.filter(p => !stagedRoster.some(r => r.user_id === p.id) && !p.unavailable_dates?.includes(targetFilterDate));
  const unavailablePool = profiles.filter(p => !stagedRoster.some(r => r.user_id === p.id) && p.unavailable_dates?.includes(targetFilterDate));

  interface SetlistTreeBlock { parentGroup: string | null; parentColor: string; groups: { groupName: string | null; groupColor: string; items: { item: SetlistSongItem, globalIndex: number }[]; }[]; }
  const treeBlocks: SetlistTreeBlock[] = [];
  stagedSetlistSongs.forEach((item, index) => {
    const pName = item.parent_group || null; const cName = item.group_name || null;
    const pCol = item.parent_color || "zinc"; const cCol = item.group_color || "zinc";
    const lastParent = treeBlocks[treeBlocks.length - 1];
    if (lastParent && lastParent.parentGroup === pName) {
      const lastChild = lastParent.groups[lastParent.groups.length - 1];
      if (lastChild && lastChild.groupName === cName) lastChild.items.push({ item, globalIndex: index });
      else lastParent.groups.push({ groupName: cName, groupColor: cCol, items: [{ item, globalIndex: index }] });
    } else {
      treeBlocks.push({ parentGroup: pName, parentColor: pCol, groups: [{ groupName: cName, groupColor: cCol, items: [{ item, globalIndex: index }] }] });
    }
  });

  function parentBlockRowsRenderer(treeBlocks: any[], isEditingSetlist: boolean) {
    return treeBlocks.map((parentBlock: any, pIdx: number) => {
      const renderGroupBlock = (group: any, gIdx: number) => {
        const groupPalette = COLOR_PALETTES.find((c: any) => c.id === group.groupColor) || COLOR_PALETTES[0];
        if (!group.groupName && !parentBlock.parentGroup) {
          return <div key={`flat-g-${gIdx}`} className="space-y-2.5">{group.items.map(({item, globalIndex}: any) => renderTrackRow(item, globalIndex))}</div>;
        }
        return (
          <div key={`g-${gIdx}`} className={`border-2 ${groupPalette.border} ${groupPalette.bg} rounded-[1.5rem] p-4 space-y-3 shadow-sm`}>
            <div className="flex justify-between items-center pb-2 border-b border-zinc-200/40">
              <h5 className={`font-black text-[12px] uppercase tracking-widest ${groupPalette.text}`}>{group.groupName || "SECTION BLOCK"}</h5>
            </div>
            <div className="space-y-2.5">{group.items.map(({item, globalIndex}: any) => renderTrackRow(item, globalIndex))}</div>
          </div>
        );
      };

      const renderTrackRow = (item: SetlistSongItem, globalIndex: number) => (
        <div 
          key={item.id} 
          draggable={simulatedRole === "admin"}
          onDragStart={() => handleDragStart(globalIndex)}
          onDragOver={(e) => handleDragOver(e, globalIndex)}
          onDragEnd={() => setDraggedSongIndex(null)}
          onClick={() => { if (item.songs?.id) router.push(`/songs/${item.songs.id}`); }}
          className={`flex items-center justify-between rounded-2xl p-4 bg-white border shadow-sm min-h-[72px] transition-all duration-150 ${
            draggedSongIndex === globalIndex ? "opacity-40 scale-95 border-blue-400 border-dashed" : "hover:bg-zinc-50/50 cursor-grab active:cursor-grabbing"
          }`}
        >
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {simulatedRole === "admin" && (
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-zinc-300 checked:bg-blue-600 cursor-pointer" 
                  checked={selectedForGroup.includes(item.id)} 
                  onChange={() => handleToggleCheckboxSelect(item.id)}
                />
              )}
              {simulatedRole === "admin" && <div className="text-zinc-300 text-lg font-bold select-none">☰</div>}
            </div>
            <span className="text-[14px] font-bold text-zinc-400 w-6">{item.sequence_order}</span>
            <div className="w-20 text-[14px] font-extrabold text-zinc-500" onClick={e => e.stopPropagation()}>
              {simulatedRole === "admin" ? (
                <button onClick={() => setTimePickerTargetItemId(item.id)} className="text-[12px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md border text-center shadow-inner">{formatTo12Hour(item.start_time)}</button>
              ) : ( <span className="text-zinc-500 font-bold">{formatTo12Hour(item.start_time)}</span> )}
            </div>
            <div className="flex flex-col flex-1 pl-2 select-none">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center text-[10px] font-black uppercase tracking-tight">{item.songs?.key_signature || "G"}</span>
                <span className="bg-zinc-100/80 text-zinc-500 px-2 py-0.5 rounded-full text-[10px] font-black tracking-tight">{item.songs?.tempo || "70"} BPM</span>
              </div>
              <h4 className="font-bold text-[16px] text-zinc-900 leading-none">{item.songs?.title}</h4>
            </div>
          </div>
          <div className="ml-4 flex items-center" onClick={e => e.stopPropagation()}>
            {simulatedRole === "admin" && (
              <button onClick={() => setStagedSetlistSongs(prev => prev.filter(s => s.id !== item.id)) } className="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center">✕</button>
            )}
          </div>
        </div>
      );

      if (parentBlock.parentGroup) {
        // 🔴 SURGICAL ADDITION: Add this exact palette lookup line right here
        const parentPalette = COLOR_PALETTES.find((c: any) => c.id === parentBlock.parentColor) || COLOR_PALETTES[0];

        return (
          <div key={`parent-${pIdx}`} className={`border-2 ${parentPalette.border} ${parentPalette.bg} rounded-3xl p-5 space-y-4 mb-4 shadow-sm`}>
            <h4 className="text-[17px] font-extrabold text-zinc-900 px-1">{parentBlock.parentGroup}</h4>
            <div className="space-y-4">{parentBlock.groups.map((group: any, gIdx: number) => renderGroupBlock(group, gIdx))}</div>
          </div>
        );
      }
      return <div key={`flat-parent-${pIdx}`} className="space-y-4 mb-4">{parentBlock.groups.map((group: any, gIdx: number) => renderGroupBlock(group, gIdx))}</div>;
    });
  }

  useEffect(() => { setHasMounted(true); loadData(); }, [eventId]);

  if (!hasMounted) return null;
  if (loading) return <div className="p-12 text-center text-xs font-bold animate-pulse">Loading Cockpit Content...</div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-4 md:space-y-6 animate-in fade-in duration-200">
      
      {/* HERO BANNER FRAME */}
      <div className="bg-[#2b6eff] text-white p-6 md:p-8 rounded-xl md:rounded-3xl shadow-sm relative overflow-hidden shrink-0">
        <button onClick={() => router.push("/events")} className="text-xs font-bold text-blue-100 mb-2 hover:underline block">‹ Back to Events List</button>
        <div className="flex flex-wrap items-center gap-2 select-none">
          {/* DYNAMIC DATE CHECK: Verifies if the workspace date is current or historical */}
    {(() => {
      const todayStr = new Date().toISOString().split("T")[0]; // e.g., "2026-06-16"
      const eventDateStr = activeEvent?.event_date ? activeEvent.event_date.split("T")[0] : "";
      const isCurrentOrFuture = eventDateStr >= todayStr;

      return isCurrentOrFuture ? (
        <span className="bg-white/20 text-white font-black text-[9px] uppercase tracking-widest px-3 py-1 rounded-full backdrop-blur-md animate-in fade-in">
          Active Plan Workspace
        </span>
      ) : (
        <span className="bg-zinc-950/40 text-zinc-300 border border-zinc-700/30 font-black text-[9px] uppercase tracking-widest px-3 py-1 rounded-full backdrop-blur-md opacity-75">
          Archived Plan Workspace
        </span>
      );
    })()}

    {activeEvent?.service_type && (
      <span className="bg-zinc-950/40 text-blue-100 border border-blue-400/20 font-black text-[9px] uppercase tracking-widest px-3 py-1 rounded-full backdrop-blur-md">⚡ {activeEvent.service_type}</span>
    )}
        </div>
        <h1 className="text-2xl md:text-4xl font-black tracking-tight mt-4 pr-32">{activeEvent?.title || "June Week#3 2026"}</h1>
        
        {simulatedRole === "admin" && (
          <button 
            onClick={handleOpenEditEventModal}
            className="absolute top-6 md:top-8 right-6 md:right-8 px-3 md:px-4 py-2 bg-white/10 border border-white/20 hover:bg-white/20 text-white font-black text-xs rounded-xl shadow-md backdrop-blur-md transition-all active:scale-95 uppercase tracking-wider"
          >
            ✏️ Edit Event
          </button>
        )}
      </div>

      {/* VIEW PANEL SELECTION TABS */}
      <div className="bg-white p-2 rounded-xl md:rounded-2xl border grid grid-cols-3 gap-2 md:gap-3 text-center text-[10px] md:text-xs font-black uppercase tracking-wider shadow-sm">
        <button onClick={() => setViewSubScreen("matrix")} className={`py-3 md:py-3.5 rounded-xl border flex items-center justify-center gap-1.5 md:gap-2 transition-all ${viewSubScreen === "matrix" ? "bg-zinc-100 text-zinc-950 border-zinc-300 font-black shadow-inner" : "bg-white text-zinc-400 border-transparent"}`}>
          <img src="/assets/participants.svg" className="w-3.5 h-3.5 md:w-4 md:h-4 object-contain" alt="" />
          Positions Lineup
        </button>
        <button onClick={() => setViewSubScreen("setlists_list")} className={`py-3 md:py-3.5 rounded-xl border flex items-center justify-center gap-1.5 md:gap-2 transition-all ${viewSubScreen === "setlists_list" ? "bg-zinc-100 text-zinc-950 border-zinc-300 font-black shadow-inner" : "bg-white text-zinc-400 border-transparent"}`}>
          <img src="/assets/setlist.svg" className="w-3.5 h-3.5 md:w-4 md:h-4 object-contain" alt="" />
          Choose Setlist
        </button>
        <button onClick={() => setViewSubScreen("songs_view")} className={`py-3 md:py-3.5 rounded-xl border flex items-center justify-center gap-1.5 md:gap-2 transition-all ${viewSubScreen === "songs_view" ? "bg-zinc-100 text-zinc-950 border-zinc-300 font-black shadow-inner" : "bg-white text-zinc-400 border-transparent"}`} disabled={!selectedSetlistId}>
          <img src="/assets/music.svg" className="w-3.5 h-3.5 md:w-4 md:h-4 object-contain" alt="" />
          See Tracks ({stagedSetlistSongs.length})
        </button>
      </div>

      {/* FIXED POSITION BAR: Persistent Inserter Engine */}
      {viewSubScreen === "songs_view" && simulatedRole === "admin" && (
        <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-3xl border shadow-sm space-y-3 animate-in slide-in-from-top duration-200">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Choose Database Song Node</label>
          <div className="flex gap-3 relative overflow-visible">
            <div className="relative flex-1 overflow-visible">
              <input 
                type="text" 
                placeholder="Type track name to look up..." 
                value={songSearchQuery}
                onChange={(e) => { setSongSearchQuery(e.target.value); setIsSongDropdownOpen(true); }}
                onClick={() => setIsSongDropdownOpen(true)}
                className="w-full bg-zinc-50 border rounded-2xl px-5 py-3.5 text-sm font-bold text-zinc-800 focus:border-blue-500 focus:bg-white outline-none transition-all shadow-inner"
              />
              {isSongDropdownOpen && songSearchQuery.trim() !== "" && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-2xl shadow-2xl z-[999999] max-h-48 overflow-y-auto custom-scrollbar divide-y">
                  {songFilteredDatabaseSongs.map(s => (
                    <div key={s.id} onClick={() => { setSelectedNewSongId(s.id); setSongSearchQuery(s.title); setIsSongDropdownOpen(false); }} className="px-5 py-3.5 hover:bg-blue-50 text-xs font-bold text-zinc-700 cursor-pointer transition-colors">🎵 {s.title}</div>
                  ))}
                </div>
              )}
            </div>
            <button type="button" onClick={handleAddSongSubmit} disabled={!selectedNewSongId} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black text-xs px-5 md:px-8 rounded-2xl uppercase tracking-widest transition-all shadow-md">Add to Setlist</button>
          </div>
        </div>
      )}

      {/* VIEW SCENARIOS RENDERING NODES */}
      {viewSubScreen === "matrix" && (
        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 content-start">
            {GRID_CARDS.map((cardRole) => {
              const list = stagedRoster.filter(m => m.role === cardRole);
              const active = focusedRole === cardRole;
              
              const eligible = profiles.filter(p => 
                p.ministries?.includes(cardRole) && 
                !p.unavailable_dates?.includes(targetFilterDate)
              );

              return (
                <div key={cardRole} className="bg-white p-3.5 md:p-6 rounded-2xl md:rounded-[2rem] border shadow-sm flex flex-col justify-between min-h-[140px] md:min-h-[170px] hover:border-zinc-300 transition-all">
                  <div className="flex items-start justify-between relative">
                    <div className="min-w-0 flex-1">
                      <h5 className="font-extrabold text-sm md:text-base text-zinc-900 tracking-tight truncate">{cardRole}</h5>
                      <p className="text-[10px] md:text-[11px] font-bold text-zinc-400 mt-0.5">{list.length} Assigned</p>
                    </div>
                    {simulatedRole === "admin" && ( 
                      <button type="button" onClick={() => setFocusedRole(active ? null : cardRole)} className="w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-xs md:text-sm font-bold border hover:bg-zinc-50 shrink-0 ml-1">＋</button> 
                    )}
                  </div>
                  <div className="flex-1 mt-3 md:mt-4">
                    {active && simulatedRole === "admin" ? (
                      <form onSubmit={handleDropdownSubmit} className="space-y-2">
                        <select required value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-2 py-1.5 text-[11px] font-bold outline-none cursor-pointer">
                          <option value="">-- Assign --</option>
                          {eligible.map(p => <option key={p.id} value={p.id}>{p.full_name || "Unknown Volunteer"}</option>)}
                        </select>
                        <button type="submit" className="w-full bg-zinc-950 text-white font-black text-[9px] md:text-[10px] py-2 rounded-xl uppercase tracking-wider">Commit</button>
                      </form>
                    ) : (
                      <div className="space-y-1.5 md:space-y-2">
                        {list.map(m => (
                          <div key={m.id} className="flex items-center justify-between group p-1 md:p-1.5 rounded-xl hover:bg-zinc-50/50">
                            <div className="flex items-center gap-2 min-w-0">
                              {m.profiles?.avatar_url ? <img src={m.profiles.avatar_url} alt="" className="w-6 h-6 md:w-7 md:h-7 rounded-full object-cover border shrink-0" /> : <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-blue-600 text-white text-[10px] md:text-xs font-black flex items-center justify-center shrink-0">{m.profiles?.full_name?.charAt(0) || "U"}</div>}
                              <span className="text-xs md:text-[14px] font-bold text-zinc-800 tracking-tight truncate">{m.profiles?.full_name || "Active Hand"}</span>
                            </div>
                            {simulatedRole === "admin" && ( <button type="button" onClick={() => handleOriginalLocalRemove(m.id)} className="text-[10px] text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1 shrink-0">✕</button> )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* POOLS GRIDS PANEL LAYOUTS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pt-2">
            <div className="bg-white border p-4 md:p-6 rounded-2xl md:rounded-[2rem] shadow-sm flex flex-col justify-between min-h-[140px] md:min-h-[160px]">
              <div>
                <h5 className="font-black text-emerald-700 text-xs md:text-sm flex items-center gap-1.5 uppercase tracking-wider">Available Matrix <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span></h5>
                <p className="text-[10px] md:text-[11px] font-bold text-zinc-400 mt-0.5">{availablePool.length}/{profiles.length} Volunteers Ready to Serve</p>
              </div>
              <div className="mt-3 md:mt-4 flex -space-x-2 overflow-hidden pt-3 md:pt-4 border-t border-zinc-100">
                {availablePool.map((p) => (
                  <div key={p.id} className="inline-flex w-8 h-8 md:w-10 md:h-10 rounded-full ring-4 ring-white relative items-center justify-center bg-blue-600 text-white font-bold text-xs shadow-sm" title={p.full_name || "Active Hand"}>
                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span>{p.full_name?.charAt(0) || "U"}</span>}
                  </div>
                ))}
                {availablePool.length === 0 && <span className="text-xs font-semibold text-zinc-400 italic pl-1">All qualified team members currently assigned.</span>}
              </div>
            </div>

            <div className="bg-white border p-4 md:p-6 rounded-2xl md:rounded-[2rem] shadow-sm flex flex-col justify-between min-h-[140px] md:min-h-[160px]">
              <div>
                <h5 className="font-black text-red-600 text-xs md:text-sm flex items-center gap-1.5 uppercase tracking-wider">Unavailable Blockouts <span className="w-2 h-2 rounded-full bg-red-500"></span></h5>
                <p className="text-[10px] md:text-[11px] font-bold text-zinc-400 mt-0.5">{unavailablePool.length} Row Node Flags Accounted For</p>
              </div>
              <div className="mt-3 md:mt-4 flex -space-x-2 overflow-hidden pt-3 md:pt-4 border-t border-zinc-100">
                {unavailablePool.map((p) => (
                  <div key={p.id} className="inline-flex w-8 h-8 md:w-10 md:h-10 rounded-full ring-4 ring-white relative items-center justify-center bg-zinc-200 border text-zinc-600 font-bold text-xs shadow-sm" title={`${p.full_name || "User"} (Blocked Out)`}>
                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full rounded-full object-cover grayscale opacity-60" /> : <span>{p.full_name?.charAt(0) || "🚫"}</span>}
                  </div>
                ))}
                {unavailablePool.length === 0 && <span className="text-xs font-semibold text-zinc-400 italic pl-1">All catalog hands available.</span>}
              </div>
            </div>
          </div>

          <div className={`fixed bottom-6 left-6 md:left-32 right-6 bg-zinc-950 text-white border p-4 md:p-5 px-6 flex items-center justify-between rounded-2xl shadow-2xl transition-all duration-300 z-50 ${hasChanges && simulatedRole === "admin" ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0 pointer-events-none'}`}>
            <p className="text-xs md:text-sm font-extrabold">Unsaved Lineup changes staged locally</p>
            <div className="flex items-center gap-2 md:gap-3">
              <button type="button" onClick={() => { setStagedRoster(roster); setHasChanges(false); }} className="px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white">Discard</button>
              <button type="button" onClick={saveLineupChanges} disabled={isDeploying} className="px-4 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md">{isDeploying ? 'Deploying...' : 'Save Lineup'}</button>
            </div>
          </div>
        </div>
      )}

      {viewSubScreen === "setlists_list" && (
        <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-3xl border shadow-sm space-y-4 md:space-y-6">
          <div className="flex justify-between items-center border-b pb-3">
            <h4 className="text-[10px] md:text-xs font-black text-zinc-400 uppercase tracking-wider">Setlists Registered under this operational frame</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {eventSetlists.map((sl) => {
              const isTarget = selectedSetlistId === sl.id;
              return (
                <div key={sl.id} onClick={async () => { setSelectedSetlistId(sl.id); await fetchLiveSetlistTracks(sl.id); setViewSubScreen("songs_view"); }} className={`p-4 md:p-6 rounded-2xl md:rounded-[1.75rem] border-2 transition-all cursor-pointer flex flex-col justify-between min-h-[110px] md:min-h-[120px] group ${isTarget ? "border-blue-600 bg-blue-50/20 shadow-md" : "border-zinc-100 bg-zinc-50/40 hover:border-zinc-300 shadow-sm"}`}>
                  <h5 className="font-extrabold text-base md:text-lg text-zinc-900 tracking-tight leading-tight group-hover:text-blue-600 transition-colors">{sl.name}</h5>
                  <span className="text-xs font-black text-blue-600 self-end">View Tracks Array ›</span>
                </div>
              );
            })}
            {simulatedRole === "admin" && (
              <div 
                onClick={() => setIsCreateSetlistOpen(true)}
                className="p-4 md:p-6 rounded-2xl md:rounded-[1.75rem] border-2 border-dashed border-zinc-200 hover:border-blue-500 hover:bg-blue-50/10 text-blue-600 font-extrabold text-xs uppercase tracking-widest flex items-center justify-center min-h-[110px] md:min-h-[120px] transition-all cursor-pointer shadow-sm select-none"
              >
                ＋ Add Setlist Block
              </div>
            )}
          </div>
        </div>
      )}

      {viewSubScreen === "songs_view" && (
        <div className="space-y-4">
          
          {selectedForGroup.length > 0 && simulatedRole === "admin" && (
            <div className="bg-zinc-900 text-white p-4 md:p-5 rounded-xl md:rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border shadow-2xl animate-in zoom-in-95 duration-150">
              <div className="space-y-1">
                <h5 className="text-xs font-black uppercase tracking-widest text-zinc-400">Section Grouping Controller</h5>
                <p className="text-xs md:text-sm font-bold text-white">{selectedForGroup.length} song segments checked across staging view matrix.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input 
                  type="text" 
                  placeholder="e.g., Fast Praise Set, Worship Block..." 
                  value={customGroupName}
                  onChange={e => setCustomGroupName(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 font-bold outline-none focus:border-blue-500"
                />
                <select 
                  value={selectedGroupColor} 
                  onChange={e => setSelectedGroupColor(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none"
                >
                  {COLOR_PALETTES.map(p => <option key={p.id} value={p.id}>{p.id.toUpperCase()}</option>)}
                </select>
                <button type="button" onClick={applyGroupTransformation} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md uppercase tracking-wider">Bundle Group</button>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-xl md:rounded-3xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 md:px-6 py-3.5 md:py-4 flex items-center justify-between border-b bg-white z-20 relative">
              <div className="space-y-0.5">
                <h3 className="font-extrabold text-zinc-950 text-base md:text-lg tracking-tight">{eventSetlists.find(s => s.id === selectedSetlistId)?.name}</h3>
                <p className="text-[11px] md:text-xs font-semibold text-zinc-400">Drag handle corridors or skills lists to modify execution structures.</p>
              </div>
              <button type="button" onClick={handleStartRehearsal} disabled={stagedSetlistSongs.length === 0} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 font-black text-white text-xs uppercase tracking-widest shadow-md rounded-xl disabled:opacity-40">🚀 Start Rehearsal</button>
            </div>
            
            <div className="p-4 md:p-6 bg-zinc-50/50 space-y-3 md:space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar">
              {parentBlockRowsRenderer(treeBlocks, isEditingSetlist)}
            </div>

            <div className={`bg-white border-t p-4 px-6 flex items-center justify-between transition-all duration-300 ${hasSetlistChanges && simulatedRole === "admin" ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
              <p className="text-xs font-bold text-zinc-500">Setlist track variations changes staged</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { fetchLiveSetlistTracks(selectedSetlistId); setHasSetlistChanges(false); setSelectedForGroup([]); }} className="px-3 py-1.5 text-xs font-bold text-zinc-400">Discard</button>
                <button type="button" onClick={saveSetlistChanges} disabled={isDeploying} className="px-4 py-2 text-xs font-black text-white bg-blue-600 rounded-xl shadow-md">Save Layout</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT ACTIVE EVENT OVERLAY MODAL --- */}
      {isEditEventOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[140000] flex items-center justify-center p-4">
          <form onSubmit={handleUpdateEventSubmit} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-6 relative flex flex-col space-y-4 animate-in zoom-in-95">
            <button type="button" onClick={() => setIsEditEventOpen(false)} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 font-bold text-xs flex items-center justify-center">✕</button>
            <h3 className="text-xl font-black text-zinc-900 tracking-tight">Edit Event Block</h3>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block">Event Title</label>
              <input type="text" required value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block">Type of Service Preset</label>
              <select value={editServiceType} onChange={(e) => setEditServiceType(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 cursor-pointer">
                {SERVICE_TYPE_PRESETS.map(preset => <option key={preset} value={preset}>{preset}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block">Event Date</label>
              <input type="date" required value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase block">Summary Description</label>
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-sm font-semibold outline-none h-24 resize-none focus:border-blue-500" />
            </div>
            <button type="submit" disabled={isUpdatingEvent} className="w-full bg-blue-600 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-widest shadow-md">{isUpdatingEvent ? "Saving..." : "Commit Event Changes"}</button>
          </form>
        </div>
      )}

      {/* CREATE SUB-SETLIST MODAL BLOCK OVERLAY */}
      {isCreateSetlistOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[130000] flex items-center justify-center p-4">
          <form onSubmit={handleCreateSetlistBlockSubmit} className="bg-white rounded-[2rem] p-6 w-full max-w-sm border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <h4 className="font-black text-lg tracking-tight text-zinc-900">Create Setlist Block</h4>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-zinc-400 block">Setlist Block Name</label>
              <input type="text" required placeholder="e.g., Sunday Morning Service Setlist" value={newSetlistName} onChange={e => setNewSetlistName(e.target.value)} className="w-full bg-zinc-50 border p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setIsCreateSetlistOpen(false)} className="flex-1 py-2.5 bg-zinc-100 rounded-xl text-xs font-bold text-zinc-500">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 bg-blue-600 rounded-xl text-xs font-black text-white shadow-md uppercase tracking-wider">Build Block</button>
            </div>
          </form>
        </div>
      )}

      {/* TIME PICKER POPUP */}
      {isTimePickerOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[120000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-6 w-full max-w-xs shadow-2xl border space-y-4">
            <h4 className="font-black text-sm text-zinc-900">Set Execution Time</h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <select value={selectedHour} onChange={e => setSelectedHour(e.target.value)} className="w-full bg-zinc-50 border p-2 rounded-xl font-bold text-sm">{Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(h => <option key={h} value={h}>{h}</option>)}</select>
              </div>
              <div>
                <select value={selectedMinute} onChange={e => setSelectedMinute(e.target.value)} className="w-full bg-zinc-50 border p-2 rounded-xl font-bold text-sm">{Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(m => <option key={m} value={m}>{m}</option>)}</select>
              </div>
              <div>
                <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} className="w-full bg-zinc-50 border p-2 rounded-xl font-bold text-sm"><option value="AM">AM</option><option value="PM">PM</option></select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setIsTimePickerOpen(false)} className="flex-1 py-2 bg-zinc-100 rounded-xl text-xs font-bold text-zinc-500">Cancel</button>
              <button type="button" onClick={handleSaveTimeSelection} className="flex-1 py-2 bg-blue-600 rounded-xl text-xs font-black text-white">Apply</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}