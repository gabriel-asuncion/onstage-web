"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEngine } from "../../context/EngineContext";
import { 
  getUserTeam, getTeamSetlists, getAllProfiles, 
  addTeamMember, removeTeamMember, 
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
interface EventItem { id: string; title: string; date: string; description: string; }
interface SetlistMetaItem { id: string; name: string; event_id: string; }

const GRID_CARDS = ["VAST", "Pastor", "Dancer", "Musician", "Backup", "Music Leader"];
const MAX_AVATARS = 6;
const ACTIVE_SERVICE_DATE = "2026-06-12";

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

export default function DynamicCockpitPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const sessionId = params?.id as string; 
  const { simulatedRole } = useEngine();

  const [hasMounted, setHasMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [profiles, setProfiles] = useState<DBProfile[]>([]);
  
  const [roster, setRoster] = useState<MemberRow[]>([]);
  const [stagedRoster, setStagedRoster] = useState<MemberRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [eventSetlists, setEventSetlists] = useState<SetlistMetaItem[]>([]);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>("");

  const [setlistSongs, setSetlistSongs] = useState<SetlistSongItem[]>([]); 
  const [stagedSetlistSongs, setStagedSetlistSongs] = useState<SetlistSongItem[]>([]); 
  const [hasSetlistChanges, setHasSetlistChanges] = useState(false);
  const [allDatabaseSongs, setAllDatabaseSongs] = useState<any[]>([]);

  const [viewSubScreen, setViewSubScreen] = useState<"matrix" | "setlists_list" | "songs_view">("matrix");
  const [isEditingSetlist, setIsEditingSetlist] = useState(false); 
  const [isAddingSong, setIsAddingSong] = useState(false);
  const [selectedNewSongId, setSelectedNewSongId] = useState("");
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [isSongDropdownOpen, setIsSongDropdownOpen] = useState(false);
  const [songSearchQuery, setSongSearchQuery] = useState("");

  const [focusedRole, setFocusedRole] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);

  const [isCreateSetlistOpen, setIsCreateSetlistOpen] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState("");

  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [timePickerTargetItemId, setTimePickerTargetItemId] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState("08");
  const [selectedMinute, setSelectedMinute] = useState("00");
  const [selectedPeriod, setSelectedPeriod] = useState("AM");
  const [previewModal, setPreviewModal] = useState<{isOpen: boolean, song: any, lyrics: any[]}>({isOpen: false, song: null, lyrics: [] });

  async function syncRosterUI(currentTeamId: string, allProfilesData: DBProfile[]) {
    const { data: rawRoster, error } = await supabase.from("team_members").select("id, role, user_id");
    if (error) return;
    const mappedRoster = (rawRoster || []).map(row => {
      const p = allProfilesData.find(profile => profile.id === row.user_id);
      return { ...row, profiles: p || null };
    });
    setRoster(mappedRoster as MemberRow[]);
    setStagedRoster(mappedRoster as MemberRow[]); 
    setHasChanges(false);
  }

  async function fetchEventSetlists(eventId: string) {
    const { data, error } = await supabase
      .from("setlists")
      .select("id, name, event_id")
      .eq("event_id", eventId);

    if (!error && data && data.length > 0) {
      setEventSetlists(data);
      setSelectedSetlistId(data[0].id);
      await fetchLiveSetlistTracks(data[0].id);
    } else {
      const mocks = [
        { id: "set-morning", name: "Sunday Morning Service Setlist", event_id: eventId },
        { id: "set-youth", name: "Youth Convergence Setlist", event_id: eventId }
      ];
      setEventSetlists(mocks);
      setSelectedSetlistId(mocks[0].id);
      await fetchLiveSetlistTracks(mocks[0].id);
    }
  }

  async function fetchLiveSetlistTracks(setlistId: string) {
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
        const parts = rawGroup.split(" >> ");
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

      const { data: eventData } = await supabase.from("events").select("*").eq("id", sessionId).maybeSingle();
      if (eventData) {
        setActiveEvent({ id: eventData.id, title: eventData.title, date: eventData.date, description: eventData.description });
      } else {
        setActiveEvent({ id: sessionId, title: "June - week#1", date: "2026-06-12", description: "Worship session planning container stack." });
      }

      await fetchEventSetlists(sessionId);
      await syncRosterUI(targetTeam.id, combinedProfiles);
      setAllDatabaseSongs(await getAllSongs());
    } catch (e) { console.error(e); }
    setLoading(false);
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
    const removedIds = roster.filter(r => !stagedRoster.some(sr => sr.id === r.id)).map(r => r.id); 
    for (const id of removedIds) await removeTeamMember(id); 
    const addedRows = stagedRoster.filter(sr => sr.isNew); 
    for (const row of addedRows) await addTeamMember(sessionId, row.user_id, row.role); 
    await syncRosterUI(sessionId, profiles); 
    setHasChanges(false);
    setIsDeploying(false); 
  }

  function handleToggleSelect(id: string) {
    if (simulatedRole !== "admin") return;
    setSelectedForGroup(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleCreateSetlistBlockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newSetlistName.trim()) return;
    try {
      const { data, error } = await supabase
        .from("setlists")
        .insert({ event_id: sessionId, name: newSetlistName.trim() })
        .select().single();

      if (!error && data) {
        setEventSetlists(prev => [...prev, data]);
        setSelectedSetlistId(data.id);
        await fetchLiveSetlistTracks(data.id);
        setIsCreateSetlistOpen(false); setNewSetlistName("");
        setViewSubScreen("songs_view");
      }
    } catch (err) { console.error(err); }
  }

  async function handleAddSongSubmit() {
    if (simulatedRole !== "admin") return;
    if (!selectedNewSongId) return;
    const songToAdd = allDatabaseSongs.find(s => s.id === selectedNewSongId);
    if (!songToAdd) return;
    const optimisticItem: SetlistSongItem = { id: `temp-${Date.now()}`, sequence_order: stagedSetlistSongs.length + 1, start_time: "08:30", assigned_user_ids: [], parent_group: null, group_name: null, songs: songToAdd };
    setStagedSetlistSongs(prev => [...prev, optimisticItem]);
    setHasSetlistChanges(true); setSelectedNewSongId(""); setIsSongDropdownOpen(false);
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

  function handleOpenAssignModal(item: SetlistSongItem) {
    if (simulatedRole !== "admin") return;
    setAssignTargetItemId(item.id);
    setStagedAssignedUserIds(item.assigned_user_ids || []);
    setIsAssignModalOpen(true);
  }

  function handleStartRehearsal() {
    if (stagedSetlistSongs.length === 0 || !stagedSetlistSongs[0].songs) return;
    router.push(`/songs/${stagedSetlistSongs[0].songs.id}`);
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

  useEffect(() => { setHasMounted(true); loadData(); }, [sessionId]);

  const songFilteredDatabaseSongs = allDatabaseSongs.filter(s => s.title.toLowerCase().includes(songSearchQuery.toLowerCase()));
  const availablePool = profiles.filter(p => !stagedRoster.some(r => r.user_id === p.id) && !p.unavailable_dates?.includes(ACTIVE_SERVICE_DATE));

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
      const parentPalette = COLOR_PALETTES.find((c: any) => c.id === parentBlock.parentColor) || COLOR_PALETTES[0];
      const parentGroupIdString = `parent:${parentBlock.parentGroup}`;

      const renderTrackRow = (item: SetlistSongItem, globalIndex: number) => (
        <div key={item.id} className="flex items-center justify-between rounded-2xl p-4 bg-white hover:bg-zinc-50/50 cursor-pointer border shadow-sm min-h-[72px]" onClick={() => { if (item.songs) handlePreviewLyrics(item.songs); }}>
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {isEditingSetlist && simulatedRole === "admin" && (
                <input type="checkbox" className="w-4 h-4 rounded border-zinc-300 checked:bg-blue-600" checked={selectedForGroup.includes(item.id)} onChange={() => handleToggleSelect(item.id)} />
              )}
              {simulatedRole === "admin" && <div className="text-zinc-300 cursor-grab text-lg font-bold select-none">☰</div>}
            </div>
            <span className="text-[14px] font-bold text-zinc-400 w-6">{item.sequence_order}</span>
            <div className="w-20 text-[14px] font-extrabold text-zinc-500" onClick={e => e.stopPropagation()}>
              {isEditingSetlist && simulatedRole === "admin" ? (
                <button onClick={() => handleOpenTimePicker(item)} className="text-[12px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md border text-center shadow-inner">{formatTo12Hour(item.start_time)}</button>
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
              isEditingSetlist ? ( <button onClick={() => handleDeleteSetlistSong(item.id)} className="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center">✕</button> ) 
              : ( <button onClick={() => handleOpenAssignModal(item)} className="w-8 h-8 rounded-xl bg-zinc-100 text-zinc-500 font-bold text-sm">👤+</button> )
            )}
          </div>
        </div>
      );

      const renderGroupBlock = (group: any, gIdx: number) => {
        const groupPalette = COLOR_PALETTES.find((c: any) => c.id === group.groupColor) || COLOR_PALETTES[0];
        const subgroupStringToken = `subgroup:${parentBlock.parentGroup || 'root'}||${group.groupName}`;
        if (!group.groupName && !parentBlock.parentGroup) {
          return <div key={`flat-g-${gIdx}`} className="space-y-2.5">{group.items.map(({item, globalIndex}: any) => renderTrackRow(item, globalIndex))}</div>;
        }
        return (
          <div key={`g-${gIdx}`} className={`border-2 ${groupPalette.border} ${groupPalette.bg} rounded-[1.5rem] p-4 space-y-3 shadow-sm`}>
            <div className="flex justify-between items-center pb-2 border-b border-zinc-200/40">
              <div className="flex items-center gap-2">
                {isEditingSetlist && simulatedRole === "admin" && (
                  <input type="checkbox" className="w-4 h-4 rounded border-zinc-300" checked={selectedForGroup.includes(subgroupStringToken)} onChange={() => handleToggleSelect(subgroupStringToken)} />
                )}
                <h5 className={`font-black text-[12px] uppercase tracking-widest ${groupPalette.text}`}>{group.groupName || "UNGROUPED SECTION"}</h5>
              </div>
            </div>
            <div className="space-y-2.5">{group.items.map(({item, globalIndex}: any) => renderTrackRow(item, globalIndex))}</div>
          </div>
        );
      };

      if (parentBlock.parentGroup) {
        return (
          <div key={`parent-${pIdx}`} className={`border-2 ${parentPalette.border} ${parentPalette.bg} rounded-3xl p-5 space-y-4 mb-4 shadow-sm`}>
            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-2">
                {isEditingSetlist && simulatedRole === "admin" && (
                  <input type="checkbox" className="w-4 h-4 rounded border-zinc-300" checked={selectedForGroup.includes(parentGroupIdString)} onChange={() => handleToggleSelect(parentGroupIdString)} />
                )}
                <h4 className="text-[17px] font-extrabold text-zinc-900">{parentBlock.parentGroup}</h4>
              </div>
            </div>
            <div className="space-y-4">{parentBlock.groups.map((group: any, gIdx: number) => renderGroupBlock(group, gIdx))}</div>
          </div>
        );
      }
      return <div key={`flat-parent-${pIdx}`} className="space-y-4 mb-4">{parentBlock.groups.map((group: any, gIdx: number) => renderTrackRow(item, globalIndex))}</div>;
    });
  }

  if (!hasMounted) return null;
  if (loading) return <div className="p-12 text-center text-xs font-bold animate-pulse">Loading Cockpit...</div>;

  return (
    <div className="p-6 md:p-8 w-full max-w-5xl mx-auto flex flex-col h-[92vh] relative bg-white border rounded-[2rem] shadow-xl">
      <div className="bg-[#2b6eff] text-white p-6 relative flex-shrink-0 rounded-t-3xl">
        <button onClick={() => router.push("/dashboard")} className="text-xs font-bold text-blue-100 mb-2 hover:underline block">‹ Back to Hub</button>
        <span className="bg-white/20 text-white font-medium text-[10px] px-3 py-1 rounded-full backdrop-blur-md">Active Plan Workspace</span>
        <h3 className="text-3xl font-extrabold tracking-tight mt-3">{activeEvent?.title}</h3>
      </div>

      <div className="bg-white px-2 py-4 border-b grid grid-cols-3 gap-3 flex-shrink-0 z-20 text-center text-xs font-black uppercase tracking-wider">
        <button onClick={() => setViewSubScreen("matrix")} className={`py-3.5 rounded-xl border flex items-center justify-center gap-1.5 transition-colors ${viewSubScreen === "matrix" ? "bg-zinc-100 text-zinc-950 font-black border-zinc-300" : "bg-white text-zinc-400 border-zinc-100"}`}>👥 Positions Lineup</button>
        <button onClick={() => setViewSubScreen("setlists_list")} className={`py-3.5 rounded-xl border flex items-center justify-center gap-1.5 transition-colors ${viewSubScreen === "setlists_list" ? "bg-zinc-100 text-zinc-950 font-black border-zinc-300" : "bg-white text-zinc-400 border-zinc-100"}`}>📄 Choose Setlist</button>
        <button onClick={() => setViewSubScreen("songs_view")} className={`py-3.5 rounded-xl border flex items-center justify-center gap-1.5 transition-colors ${viewSubScreen === "songs_view" ? "bg-zinc-100 text-zinc-950 font-black border-zinc-300" : "bg-white text-zinc-400 border-zinc-100"}`} disabled={!selectedSetlistId}>🎵 See Tracks ({stagedSetlistSongs.length})</button>
      </div>

      {viewSubScreen === "matrix" && (
        <div className="flex flex-col h-full bg-[#f3f4f6] relative flex-1 overflow-hidden rounded-b-3xl">
          <div className="p-5 overflow-y-auto flex-1 pb-32 max-h-[46vh] custom-scrollbar grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2">
            {GRID_CARDS.map((cardRole) => {
              const list = stagedRoster.filter(m => m.role === cardRole);
              const active = focusedRole === cardRole;
              const eligible = profiles.filter(p => p.ministries?.includes(cardRole));

              return (
                <div key={cardRole} className="bg-white p-5 rounded-3xl flex flex-col justify-between shadow-sm border min-h-[160px]">
                  <div className="flex items-start justify-between relative">
                    <div>
                      <h5 className="font-bold text-[14px] text-zinc-900">{cardRole}</h5>
                      <p className="text-[11px] font-medium text-zinc-400">{list.length} Assigned</p>
                    </div>
                    {simulatedRole === "admin" && ( <button onClick={() => setFocusedRole(active ? null : cardRole)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border">+</button> )}
                  </div>
                  <div className="flex-1 mt-3">
                    {active && simulatedRole === "admin" ? (
                      <form onSubmit={handleDropdownSubmit} className="space-y-1.5">
                        <select required value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-2.5 py-2 text-xs outline-none font-bold">
                          <option value="">-- Assign Member --</option>
                          {eligible.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                        </select>
                        <button type="submit" className="w-full bg-zinc-900 text-white font-black text-[10px] py-2 rounded-xl uppercase tracking-wider">Commit</button>
                      </form>
                    ) : (
                      <div className="space-y-1.5">
                        {list.map(m => (
                          <div key={m.id} className="flex items-center justify-between group p-1 rounded-lg">
                            <div className="flex items-center gap-2">
                              {m.profiles?.avatar_url ? <img src={m.profiles.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{m.profiles?.full_name?.charAt(0)}</div>}
                              <span className="text-[13px] font-bold text-zinc-800">{m.profiles?.full_name}</span>
                            </div>
                            {simulatedRole === "admin" && ( <button onClick={() => handleOriginalLocalRemove(m.id)} className="text-[10px] text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1">✕</button> )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="bg-white border p-5 rounded-3xl flex flex-col justify-between shadow-sm min-h-[160px]">
              <div>
                <h5 className="font-bold text-emerald-700 text-[14px] flex items-center gap-1.5">Available Matrix <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span></h5>
                <p className="text-[11px] font-medium text-zinc-400 mt-0.5">{availablePool.length}/{profiles.length} Ready to Serve</p>
              </div>
              <div className="mt-4 flex -space-x-3 overflow-hidden pt-2 border-t border-zinc-100">
                {availablePool.slice(0, MAX_AVATARS).map((p) => (
                  <div key={p.id} className="inline-flex w-9 h-9 rounded-full ring-4 ring-white relative items-center justify-center bg-blue-600 text-white font-bold text-xs" title={p.full_name}>
                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : <span>{p.full_name.charAt(0)}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`absolute bottom-0 left-0 right-0 bg-white/95 border-t border-zinc-200 p-4 px-6 flex items-center justify-between transition-all duration-300 z-50 ${hasChanges && simulatedRole === "admin" ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
            <p className="text-xs font-extrabold text-zinc-700">Unsaved Lineup Changes Staged</p>
            <div className="flex items-center gap-2">
              <button onClick={() => { setStagedRoster(roster); setHasChanges(false); }} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl">Discard</button>
              <button onClick={saveLineupChanges} disabled={isDeploying} className="px-5 py-2 text-xs font-black text-white bg-blue-600 rounded-xl shadow-md">{isDeploying ? 'Saving Layout...' : 'Save Lineup'}</button>
            </div>
          </div>
        </div>
      )}

      {viewSubScreen === "setlists_list" && (
        <div className="flex-1 bg-white p-5 overflow-y-auto rounded-b-3xl space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Setlists under this event container block</h4>
            {simulatedRole === "admin" && (
              <button onClick={() => setIsCreateSetlistOpen(true)} className="px-3 py-1.5 bg-zinc-900 text-white font-bold text-[11px] rounded-xl shadow-sm uppercase tracking-wider">＋ New Setlist Block</button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {eventSetlists.map((sl) => {
              const isTarget = selectedSetlistId === sl.id;
              return (
                <div 
                  key={sl.id}
                  onClick={async () => { setSelectedSetlistId(sl.id); await fetchLiveSetlistTracks(sl.id); setViewSubScreen("songs_view"); }}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between min-h-[100px] ${isTarget ? "border-blue-600 bg-blue-50/20 shadow-md" : "border-zinc-100 bg-zinc-50/40 hover:border-zinc-300"}`}
                >
                  <h5 className="font-extrabold text-base text-zinc-900 tracking-tight">{sl.name}</h5>
                  <span className="text-xs font-bold text-blue-600 self-end">View Tracks Array ›</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewSubScreen === "songs_view" && (
        <div className="flex flex-col h-full bg-[#f3f4f6] relative overflow-hidden rounded-b-3xl flex-1">
          <div className="px-6 py-4 flex items-center justify-between border-b bg-white z-20 relative">
            <h3 className="font-bold text-zinc-800 text-[15px]">{eventSetlists.find(s => s.id === selectedSetlistId)?.name}</h3>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleStartRehearsal} 
                disabled={stagedSetlistSongs.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 font-black text-white text-xs uppercase tracking-wider shadow-sm rounded-xl disabled:opacity-40"
              >
                🚀 Start Rehearsal
              </button>
              {simulatedRole === "admin" && (
                <div className="flex items-center gap-1">
                  <button onClick={() => { setIsEditingSetlist(!isEditingSetlist); setIsAddingSong(false); }} className="w-8 h-8 rounded-xl border flex items-center justify-center text-sm bg-white">⚙️</button>
                  <button onClick={() => { setIsAddingSong(!isAddingSong); setIsEditingSetlist(false); }} className="w-8 h-8 rounded-xl border flex items-center justify-center text-sm bg-white">＋</button>
                </div>
              )}
            </div>
          </div>
          
          <div className="p-5 space-y-4 z-10 pb-32 flex-1 overflow-y-auto custom-scrollbar max-h-[42vh]">
            {isAddingSong && simulatedRole === "admin" && (
              <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-sm mb-4">
                <label className="text-[11px] font-bold text-zinc-500 uppercase block mb-2">Choose Database Song</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      placeholder="Type or select a track index..." 
                      value={songSearchQuery}
                      onChange={(e) => { setSongSearchQuery(e.target.value); setIsSongDropdownOpen(true); }}
                      onClick={() => setIsSongDropdownOpen(true)}
                      className="w-full bg-zinc-50 border rounded-xl px-4 py-3 text-sm outline-none font-bold text-zinc-800"
                    />
                    {isSongDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-2xl shadow-xl z-[99999] max-h-48 overflow-y-auto custom-scrollbar divide-y">
                        {songFilteredDatabaseSongs.map(s => (
                          <div key={s.id} onClick={() => { setSelectedNewSongId(s.id); setSongSearchQuery(s.title); setIsSongDropdownOpen(false); }} className="px-4 py-3 hover:bg-blue-50 text-xs font-bold text-zinc-700 cursor-pointer">{s.title}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={handleAddSongSubmit} disabled={!selectedNewSongId} className="bg-[#188cff] text-white font-black text-xs px-6 rounded-xl uppercase tracking-wider">Add</button>
                </div>
              </div>
            )}

            {parentBlockRowsRenderer(treeBlocks, isEditingSetlist)}
          </div>

          <div className={`absolute bottom-0 left-0 right-0 bg-white/90 border-t border-zinc-200 p-4 px-6 flex items-center justify-between transition-all duration-300 z-50 ${hasSetlistChanges && simulatedRole === "admin" ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
            <p className="text-xs font-extrabold text-zinc-700">Setlist track variations changes staged</p>
            <div className="flex items-center gap-2">
              <button onClick={() => { fetchLiveSetlistTracks(selectedSetlistId); setHasSetlistChanges(false); }} className="px-4 py-2 text-xs font-bold text-zinc-500 hover:bg-zinc-100 rounded-xl">Discard</button>
              <button onClick={saveSetlistChanges} disabled={isDeploying} className="px-5 py-2 text-xs font-black text-white bg-blue-600 rounded-xl shadow-md">Save Layout</button>
            </div>
          </div>
        </div>
      )}

      {isCreateSetlistOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[130000] flex items-center justify-center p-4">
          <form onSubmit={handleCreateSetlistBlockSubmit} className="bg-white rounded-[2rem] p-6 w-full max-w-sm border shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <h4 className="font-black text-lg tracking-tight text-zinc-900">Create Setlist Block</h4>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-zinc-400 block">Setlist Block Name</label>
              <input 
                type="text" required placeholder="e.g., Sunday Morning Service Setlist" 
                value={newSetlistName} onChange={e => setNewSetlistName(e.target.value)}
                className="w-full bg-zinc-50 border p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setIsCreateSetlistOpen(false)} className="flex-1 py-2.5 bg-zinc-100 rounded-xl text-xs font-bold text-zinc-500">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 bg-blue-600 rounded-xl text-xs font-black text-white shadow-md uppercase tracking-wider">Build Block</button>
            </div>
          </form>
        </div>
      )}

      {isTimePickerOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[120000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-6 w-full max-w-xs shadow-2xl border space-y-4">
            <h4 className="font-black text-sm text-zinc-900">Set Execution Time</h4>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <select value={selectedHour} onChange={e => setSelectedHour(e.target.value)} className="w-full bg-zinc-50 border p-2 rounded-xl font-bold text-sm">
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <select value={selectedMinute} onChange={e => setSelectedMinute(e.target.value)} className="w-full bg-zinc-50 border p-2 rounded-xl font-bold text-sm">
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} className="w-full bg-zinc-50 border p-2 rounded-xl font-bold text-sm">
                  <option value="AM">AM</option><option value="PM">PM</option>
                </select>
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