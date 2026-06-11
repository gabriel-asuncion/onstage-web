"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../../utils/supabase/client";

interface SongRecord {
  id: string;
  title: string;
  artist: string;
  original_key: string;
  tempo: number;
  section_timings: {
    [sectionName: string]: { measures: number; beats: number };
  };
}

interface SetlistTrackItem {
  id: string;
  sequence_order: number;
  start_time: string;
  custom_key?: string; 
  custom_structure?: ArrangementSection[] | null;
  songs: SongRecord | null;
}

interface ArrangementSection {
  id: string;
  section_name: string;
  content: string;
}

interface ParsedWordToken {
  chords: string[];
  word: string;
}

interface ParsedLineToken {
  words: ParsedWordToken[];
  comment: string;
}

interface CompiledSectionToken {
  id: string;
  section_name: string;
  lines: ParsedLineToken[];
}

const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BASE_LETTER_ROOTS = ["C", "D", "E", "F", "G", "A", "B"];

const STRUCTURE_CATALOG_PRESETS = [
  "Intro", "Verse 1", "Verse 2", "Verse 3", "Pre-Chorus", "Chorus 1", "Chorus 2", "Bridge", "Instrumental", "Outro"
];

const normalizeKeyNote = (note: string): string => {
  const flatMap: { [key: string]: string } = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
  return flatMap[note] || note;
};

const transposeBracketContent = (contentStr: string, semitones: number): string => {
  return contentStr.replace(/([A-G][#b]?\S*)/g, (match) => {
    if (match.includes("/")) {
      return match.split("/").map(part => {
        const m = part.match(/^([A-G][#b]?)(.*)$/);
        return m ? `${transposeSingleNote(m[1], semitones)}${m[2]}` : part;
      }).join("/");
    }
    const matchResult = match.match(/^([A-G][#b]?)(.*)$/);
    if (!matchResult) return match;
    return `${transposeSingleNote(matchResult[1], semitones)}${matchResult[2]}`;
  });
};

const transposeSingleNote = (note: string, semitones: number): string => {
  const normalized = normalizeKeyNote(note);
  const idx = CHROMATIC_SCALE.indexOf(normalized);
  if (idx === -1) return note;
  return CHROMATIC_SCALE[(idx + semitones + 12) % 12];
};

export default function SetlistPerformanceRoomPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const setlistId = params?.id as string;

  // Master Setlist Tracking States
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Initializing performance space...");
  const [setlistName, setNewSetlistName] = useState("Live Performance Setlist");
  const [tracksList, setTracksList] = useState<SetlistTrackItem[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);

  // Active Song Layout Document Nodes
  const [activeSong, setActiveSong] = useState<SongRecord | null>(null);
  const [sections, setSections] = useState<ArrangementSection[]>([]);
  const [activeDisplayKey, setActiveDisplayKey] = useState<string>("G");
  
  // Custom Accessibility Layout State
  const [lyricsFontSize, setLyricsFontSize] = useState<number>(16);

  // Advanced Drag and Drop Interactive Feedback States
  const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSavingStructure, setIsSavingStructure] = useState(false);

  // Transposer Selection View Flags
  const [isTransposerOpen, setIsTransposerOpen] = useState(false);
  const [modalRoot, setModalRoot] = useState("G");
  const [modalAccidental, setModalAccidental] = useState<"" | "#" | "b">("");

  // Interface Synchronization Control States
  const [isPlayingFlow, setIsPlayingFlow] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [currentBeat, setCurrentBeat] = useState<number>(1);

  // Network Lobby Communication Pointer Reference
  const realtimeChannelRef = useRef<any>(null);

  // Ref Buffer Layers - Decouples state changes from animation loops
  const activeSongRef = useRef<SongRecord | null>(null);
  const sectionsRef = useRef<ArrangementSection[]>([]);
  const tracksListRef = useRef<SetlistTrackItem[]>([]);
  const isPlayingRef = useRef(false);
  const currentSectionIndexRef = useRef(0);
  const sectionStartTimeRef = useRef<number>(0);
  const totalBeatsRef = useRef<number>(0);
  const lastBeatRef = useRef<number>(1);
  const animationFrameRef = useRef<number | null>(null);
  const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Layout Container Sizing Style References
  const backdropProgressRef = useRef<HTMLDivElement | null>(null);
  const accentProgressBarRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Synchronize layout state tracking variables seamlessly
  useEffect(() => { activeSongRef.current = activeSong; }, [activeSong]);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => { tracksListRef.current = tracksList; }, [tracksList]);

  // ==========================================================
  // --- REAL-TIME NETWORK BROADCAST SYNC ENGINE -------------
  // ==========================================================
  useEffect(() => {
    if (!setlistId) return;

    const lobbyChannel = supabase.channel(`setlist_lobby_${setlistId}`);

    lobbyChannel
      .on("broadcast", { event: "lobby_sync" }, ({ payload }) => {
        if (payload.action === "START") {
          currentSectionIndexRef.current = payload.sectionIndex;
          setCurrentSectionIndex(payload.sectionIndex);
          isPlayingRef.current = true;
          setIsPlayingFlow(true);
        } 
        else if (payload.action === "STOP") {
          executeLocalResetSequence();
        } 
        else if (payload.action === "JUMP") {
          currentSectionIndexRef.current = payload.sectionIndex;
          setCurrentSectionIndex(payload.sectionIndex);
          lastBeatRef.current = 1;
          setCurrentBeat(1);
          if (isPlayingRef.current) {
            sectionStartTimeRef.current = performance.now();
          } else {
            if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
            if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
          }
        }
        else if (payload.action === "TRACK_CHANGE") {
          mountTargetSetlistTrackIndex(payload.trackIndex, tracksListRef.current);
        }
      })
      .subscribe();

    realtimeChannelRef.current = lobbyChannel;

    return () => {
      if (lobbyChannel) supabase.removeChannel(lobbyChannel);
    };
  }, [setlistId]);

  function executeLocalResetSequence() {
    isPlayingRef.current = false;
    setIsPlayingFlow(false);
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    currentSectionIndexRef.current = 0;
    lastBeatRef.current = 1;
    
    setCurrentSectionIndex(0);
    setCurrentBeat(1);

    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
  }

  // ==========================================================
  // --- RESILIENT PERSISTED LOADING MATRIX WITH FALLBACK GATE -
  // ==========================================================
  async function loadSetlistPerformanceEnvironment() {
    try {
      setLoading(true);
      
      // Early Hydration Gate: Wait until Next.js compiles the URL route tokens
      if (!setlistId) {
        setLoadingStatus("Waiting for Next.js route parameters to hydrate...");
        return;
      }

      setLoadingStatus("Connecting to database and pulling room metadata...");
      const { data: setlistRow, error: setlistError } = await supabase
        .from("setlists")
        .select("name")
        .eq("id", setlistId)
        .maybeSingle();
      
      if (setlistError) console.error("Setlist metadata query warning:", setlistError);
      if (setlistRow?.name) setNewSetlistName(setlistRow.name);

      setLoadingStatus("Extracting track lineup array allocations (Column Probe A)...");
      let rawQueryData: any[] | null = null;

      const primaryResponse = await supabase
        .from("setlist_songs")
        .select("id, sequence_order, start_time, custom_key, custom_structure, songs (*)")
        .eq("setlist_id", setlistId)
        .order("sequence_order", { ascending: true });

      if (primaryResponse.error) {
        console.warn("Primary schema query rejected. Re-routing database traffic to Fallback Lane B...", primaryResponse.error);
        setLoadingStatus("Primary schema parsing failed. Executing fallback alignment path...");
        
        const fallbackResponse = await supabase
          .from("setlist_songs")
          .select("id, sequence_order, start_time, custom_key, songs (*)")
          .eq("setlist_id", setlistId)
          .order("sequence_order", { ascending: true });
        
        rawQueryData = fallbackResponse.data;
        if (fallbackResponse.error) {
          console.error("Fallback lane failed completely:", fallbackResponse.error);
          setLoadingStatus(`Database Error: ${fallbackResponse.error.message}`);
          return;
        }
      } else {
        rawQueryData = primaryResponse.data;
      }

      if (rawQueryData && rawQueryData.length > 0) {
        setLoadingStatus("Compiling abstract lyric chord maps and building sheet layout matrices...");
        const formattedTracks = rawQueryData.map((t: any) => {
          const flattenedSongNode = Array.isArray(t.songs) ? t.songs[0] : t.songs;
          
          return {
            id: t.id,
            sequence_order: t.sequence_order,
            start_time: t.start_time,
            custom_key: t.custom_key || undefined,
            custom_structure: t.custom_structure ? (t.custom_structure as unknown as ArrangementSection[]) : null,
            songs: flattenedSongNode as unknown as SongRecord
          };
        }).filter(t => t.songs !== null && t.songs !== undefined);

        setTracksList(formattedTracks);
        if (formattedTracks.length > 0) {
          await mountTargetSetlistTrackIndex(0, formattedTracks);
        }
      } else {
        setLoadingStatus("Handshake clean, but this setlist has no songs added to it yet.");
      }
    } catch (err: any) {
      console.error("Lobby initialization crash:", err);
      setLoadingStatus(`Critical Crash: ${err?.message || "Check connection parameters"}`);
    } finally {
      setLoading(false);
    }
  }

  async function mountTargetSetlistTrackIndex(trackIndex: number, currentTracksArray = tracksListRef.current) {
    const targetTrackItem = currentTracksArray[trackIndex];
    if (!targetTrackItem || !targetTrackItem.songs) return;

    const targetSong = targetTrackItem.songs;
    setActiveSong(targetSong);
    setCurrentTrackIndex(trackIndex);
    setActiveDisplayKey(targetTrackItem.custom_key || targetSong.original_key || "G");

    if (targetTrackItem.custom_structure && targetTrackItem.custom_structure.length > 0) {
      setSections(targetTrackItem.custom_structure);
    } else {
      const { data: sectionsData } = await supabase
        .from("song_sections")
        .select("id, section_name, content")
        .eq("song_id", targetSong.id)
        .order("sequence_order", { ascending: true });

      setSections(sectionsData || []);
    }
    executeLocalResetSequence();
  }

  useEffect(() => {
    loadSetlistPerformanceEnvironment();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [setlistId]);

  function handleUserSelectTrackBadge(trackIdx: number) {
    mountTargetSetlistTrackIndex(trackIdx, tracksListRef.current);
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.send({
        type: "broadcast",
        event: "lobby_sync",
        payload: { action: "TRACK_CHANGE", trackIndex: trackIdx }
      });
    }
  }

  function handleAdvanceToNextSetlistTrack() {
    const nextTrackIndex = currentTrackIndex + 1;
    if (nextTrackIndex < tracksListRef.current.length) {
      mountTargetSetlistTrackIndex(nextTrackIndex, tracksListRef.current);
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: "broadcast",
          event: "lobby_sync",
          payload: { action: "TRACK_CHANGE", trackIndex: nextTrackIndex }
        });
      }
      setTimeout(() => {
        isPlayingRef.current = true;
        setIsPlayingFlow(true);
      }, 120);
    } else {
      handleResetFlowTrigger();
    }
  }

  // ==========================================================
  // --- INDEPENDENT CONTAINER PANEL SCROLLER -----------------
  // ==========================================================
  useEffect(() => {
    if (sections.length === 0 || !sections[currentSectionIndex] || !scrollContainerRef.current) return;

    const targetElement = sectionRefs.current[sections[currentSectionIndex].id];
    if (targetElement) {
      const containerTop = scrollContainerRef.current.getBoundingClientRect().top;
      const elementTop = targetElement.getBoundingClientRect().top;
      const absoluteTargetScrollTop = scrollContainerRef.current.scrollTop + (elementTop - containerTop) - 24;

      scrollContainerRef.current.scrollTo({
        top: absoluteTargetScrollTop,
        behavior: "smooth"
      });
    }
  }, [currentSectionIndex, sections]);

  // ==========================================================
  // --- COMPOSER ENGINE HARDWARE ANIMATION TIMELINE LOOP -----
  // ==========================================================
  useEffect(() => {
    if (!isPlayingFlow) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    sectionStartTimeRef.current = performance.now();
    lastBeatRef.current = 1;

    const clockExecutionTick = (timestamp: number) => {
      if (!isPlayingRef.current || !activeSongRef.current || sectionsRef.current.length === 0) return;

      const song = activeSongRef.current;
      const secs = sectionsRef.current;
      const idx = currentSectionIndexRef.current;

      const currentSection = secs[idx];
      if (!currentSection) {
        handleAdvanceToNextSetlistTrack();
        return;
      }

      const beatSpeedMs = (60 / (song.tempo || 75)) * 1000;
      const timings = song.section_timings?.[currentSection.section_name] || { measures: 4, beats: 0 };
      const totalBeats = (timings.measures * 4) + timings.beats || 16;
      const totalDurationMs = totalBeats * beatSpeedMs;

      const elapsedMs = timestamp - sectionStartTimeRef.current;
      const progressRatio = Math.min(1, elapsedMs / totalDurationMs);

      if (backdropProgressRef.current) backdropProgressRef.current.style.transform = `scaleX(${progressRatio})`;
      if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;

      const currentBeatPulse = Math.floor(elapsedMs / beatSpeedMs) % 4 + 1;
      if (currentBeatPulse !== lastBeatRef.current) {
        lastBeatRef.current = currentBeatPulse;
        setCurrentBeat(currentBeatPulse);
      }

      if (elapsedMs >= totalDurationMs) {
        const nextIndex = idx + 1;
        if (nextIndex < secs.length) {
          const overrun = elapsedMs - totalDurationMs;
          currentSectionIndexRef.current = nextIndex;
          setCurrentSectionIndex(nextIndex);
          sectionStartTimeRef.current = performance.now() - overrun;
        } else {
          handleAdvanceToNextSetlistTrack();
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
    };

    animationFrameRef.current = requestAnimationFrame(clockExecutionTick);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlayingFlow]);

  function handleToggleFlowPlaybackState() {
    if (isPlayingFlow) {
      handleResetFlowTrigger();
    } else {
      if (sections.length === 0 || !activeSong) return;
      isPlayingRef.current = true;
      setIsPlayingFlow(true);

      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: "broadcast",
          event: "lobby_sync",
          payload: { action: "START", sectionIndex: currentSectionIndex }
        });
      }
    }
  }

  function handleResetFlowTrigger() {
    executeLocalResetSequence();
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.send({
        type: "broadcast",
        event: "lobby_sync",
        payload: { action: "STOP" }
      });
    }
  }

  function handleSelectSectionDirectly(index: number) {
    handleSelectSectionDirectlyLocally(index);
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.send({
        type: "broadcast",
        event: "lobby_sync",
        payload: { action: "JUMP", sectionIndex: index }
      });
    }
  }

  function handleSelectSectionDirectlyLocally(index: number) {
    currentSectionIndexRef.current = index;
    setCurrentSectionIndex(index);
    lastBeatRef.current = 1;
    setCurrentBeat(1);

    if (isPlayingRef.current && activeSong) {
      sectionStartTimeRef.current = performance.now();
      const activeSection = sections[index];
      if (activeSection) {
        const timings = activeSong.section_timings?.[activeSection.section_name] || { measures: 4, beats: 0 };
        totalBeatsRef.current = (timings.measures * 4) + timings.beats || 16;
      }
    } else {
      if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
      if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
    }
  }

  async function commitSectionTimingUpdate(sectionName: string, field: "measures" | "beats", value: number) {
    if (!activeSong) return;
    const currentTimings = activeSong.section_timings || {};
    const updatedTimings = {
      ...currentTimings,
      [sectionName]: {
        ...(currentTimings[sectionName] || { measures: 4, beats: 0 }),
        [field]: value
      }
    };

    setActiveSong({ ...activeSong, section_timings: updatedTimings });

    await supabase
      .from("songs")
      .update({ section_timings: updatedTimings })
      .eq("id", activeSong.id);
  }

  // ==========================================================
  // --- TRANSPOSER MODAL ACTIONS ----------------------------
  // ==========================================================
  function handleOpenTransposerModal() {
    if (!activeSong || isPlayingRef.current) return;
    
    const cleanKeyBase = activeDisplayKey.endsWith("m") ? activeDisplayKey.slice(0, -1) : activeDisplayKey;
    let baseLetter = cleanKeyBase.charAt(0);
    let accidentalSign: "" | "#" | "b" = "";
    
    if (cleanKeyBase.includes("#")) accidentalSign = "#";
    else if (cleanKeyBase.includes("b")) accidentalSign = "b";

    setModalRoot(baseLetter);
    setModalAccidental(accidentalSign);
    setIsTransposerOpen(true);
  }

  async function handleCommitTranspositionSave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSong) return;

    const isMinorSong = activeSong.original_key.endsWith("m");
    const formattedNewKeyName = `${modalRoot}${modalAccidental}${isMinorSong ? "m" : ""}`;

    setActiveDisplayKey(formattedNewKeyName);
    setIsTransposerOpen(false);

    const targetTrackRowId = tracksListRef.current[currentTrackIndex]?.id;
    if (targetTrackRowId) {
      await supabase
        .from("setlist_songs")
        .update({ custom_key: formattedNewKeyName })
        .eq("id", targetTrackRowId);
    }

    setTracksList(prev => prev.map((t, idx) => idx === currentTrackIndex ? { ...t, custom_key: formattedNewKeyName } : t));
    handleResetFlowTrigger();
  }

  // ==========================================================
  // --- MODAL SEQUENCE REORDER OVERRIDES ACTIONS ------------
  // ==========================================================
  async function saveMutatedStructurePayload(updatedBlocks: ArrangementSection[]) {
    if (!activeSong) return;
    setIsSavingStructure(true);

    const targetTrackRowId = tracksListRef.current[currentTrackIndex]?.id;
    if (targetTrackRowId) {
      await supabase
        .from("setlist_songs")
        .update({ custom_structure: updatedBlocks as any })
        .eq("id", targetTrackRowId);
    }

    setTracksList(prev => prev.map((t, idx) => idx === currentTrackIndex ? { ...t, custom_structure: updatedBlocks } : t));
    setIsSavingStructure(false);
  }

  function handleModalSectionDragStart(idx: number) {
    setDraggedSectionIndex(idx);
  }

  function handleModalSectionDrop(targetIdx: number) {
    if (draggedSectionIndex === null || draggedSectionIndex === targetIdx || !activeSong) return;

    const workingBlocks = [...sections];
    const [removed] = workingBlocks.splice(draggedSectionIndex, 1);
    workingBlocks.splice(targetIdx, 0, removed);

    setSections(workingBlocks);
    setDragOverIndex(null);
    setDraggedSectionIndex(null);
    saveMutatedStructurePayload(workingBlocks);
    handleResetFlowTrigger();
  }

  function handleModalRemoveSectionItem(idx: number) {
    if (!activeSong || sections.length <= 1) return;
    
    const workingBlocks = sections.filter((_, index) => index !== idx);
    setSections(workingBlocks);
    saveMutatedStructurePayload(workingBlocks);
    handleResetFlowTrigger();
  }

  function handleModalAppendNewSectionItem(sectionName: string) {
    if (!activeSong) return;

    const newBlock: ArrangementSection = {
      id: `local-override-${Date.now()}-${Math.random()}`,
      section_name: sectionName,
      content: sections.find(s => s.section_name === sectionName)?.content || " "
    };

    const workingBlocks = [...sections, newBlock];
    setSections(workingBlocks);
    saveMutatedStructurePayload(workingBlocks);
    handleResetFlowTrigger();
  }

  // ==========================================================
  // --- MEMOIZED PARSED AST TOKENS COMPILER TREES ------------
  // ==========================================================
  const runtimeSemitoneDelta = useMemo(() => {
    if (!activeSong || !activeDisplayKey) return 0;
    const isMinorSong = activeSong.original_key.endsWith("m");
    
    const oldRootNote = isMinorSong ? activeSong.original_key.slice(0, -1) : activeSong.original_key;
    const newRootNote = isMinorSong ? activeDisplayKey.slice(0, -1) : activeDisplayKey;

    const oldChromaticIndex = CHROMATIC_SCALE.indexOf(normalizeKeyNote(oldRootNote));
    const newChromaticIndex = CHROMATIC_SCALE.indexOf(normalizeKeyNote(newRootNote));
    
    if (oldChromaticIndex === -1 || newChromaticIndex === -1) return 0;
    return (newChromaticIndex - oldChromaticIndex + 12) % 12;
  }, [activeSong, activeDisplayKey]);

  const memoizedSongAstTree = useMemo(() => {
    return sections.map((section): CompiledSectionToken => {
      const rawText = section.content || "";
      if (!rawText.trim()) return { id: section.id, section_name: section.section_name, lines: [] };

      const linesArray = rawText.split("\n").map((line): ParsedLineToken => {
        let commentText = "";
        const cleanLineText = line.replace(/\{([^\}]+)\}/g, (_, p1) => { commentText = p1.trim(); return ""; });
        const wordsMatch = cleanLineText.match(/(?:\[[^\]]+\]|\S)+/g) || [];

        const wordsTokens = wordsMatch.map((chunk): ParsedWordToken => {
          const chordRegex = /\[([^\]]+)\]/g;
          const chordsList: string[] = [];
          let match;
          while ((match = chordRegex.exec(chunk)) !== null) {
            chordsList.push(match[1]);
          }
          const wordText = chunk.replace(/\[[^\]]+\]/g, "");
          return { chords: chordsList, word: wordText };
        });

        return { words: wordsTokens, comment: commentText };
      });

      return { id: section.id, section_name: section.section_name, lines: linesArray };
    });
  }, [sections]);

  // FIX: Added explicit diagnostic loading shell wrapper returns
  if (loading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f8f9fa] p-6 text-center select-none">
        <div className="max-w-md space-y-4">
          <div className="text-xs font-black uppercase text-blue-600 tracking-widest animate-pulse">
            Syncing Live Performance Room...
          </div>
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm text-[11px] font-mono font-bold text-zinc-500 max-w-sm mx-auto leading-relaxed">
            🔍 Status: {loadingStatus}
          </div>
          <p className="text-[10px] text-zinc-400 font-medium">
            If this hangs permanently, press <kbd className="bg-zinc-100 px-1 rounded border text-[9px]">F12</kbd> and look for red connection rejections inside the Console panel.
          </p>
        </div>
      </div>
    );
  }

  if (tracksList.length === 0) return <div className="p-12 text-center text-sm font-bold text-zinc-500">No tracks loaded inside active setlist indexes.</div>;

  const highlightedTargetSectionName = sections[currentSectionIndex]?.section_name || "FLOW";
  const upcomingTrackItem = tracksList[currentTrackIndex + 1] || null;

  return (
    <div className="absolute inset-0 flex flex-col bg-[#f8f9fa] overflow-hidden select-none">
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

      {/* ======================================================================= */}
      {/* --- TWIN-ROW STICKY HEADER CAP PANEL --------------------------------- */}
      {/* ======================================================================= */}
      <div id="fixed-live-header" className="w-full bg-[#f8f9fa] border-b border-zinc-200/50 p-4 md:p-6 flex-shrink-0 z-50">
        <div className="max-w-5xl mx-auto bg-white border border-zinc-200 rounded-[2rem] shadow-sm flex flex-col gap-4 relative overflow-hidden p-6">
          
          <div 
            ref={backdropProgressRef}
            className="absolute inset-y-0 left-0 bg-blue-500/5 pointer-events-none z-0 origin-left will-change-transform w-full"
            style={{ transform: "scaleX(0)" }}
          />
          <div 
            ref={accentProgressBarRef}
            className="absolute bottom-0 left-0 h-1 bg-blue-600 pointer-events-none z-30 origin-left will-change-transform w-full"
            style={{ transform: "scaleX(0)" }}
          />

          {/* ROW 1: CONTROLS, RADIAL TOGGLES, PULSING LIGHTS */}
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5 w-full">
            
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <button 
                type="button" 
                onClick={() => router.back()} 
                className="w-8 h-8 rounded-full bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-500 font-bold text-xs flex items-center justify-center shrink-0 shadow-sm"
              >
                ‹
              </button>
              <div className="min-w-0 leading-tight space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-zinc-950 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-md">
                    LOBBY CONNECTED
                  </span>
                  <span className="bg-blue-50 border border-blue-100 text-blue-600 font-mono font-black text-[10px] px-2 py-0.5 rounded-md shadow-inner">
                    ⏱ {activeSong?.tempo || "--"} BPM
                  </span>
                </div>
                <h1 className="text-2xl font-black tracking-tight text-zinc-950 truncate max-w-xs md:max-w-sm">
                  {activeSong?.title || "Loading Track..."}
                </h1>
              </div>
            </div>

            {/* METRONOME BEAT COUNTERS */}
            <div className="flex items-center gap-1.5 bg-zinc-50 p-1.5 rounded-xl border border-zinc-200 shadow-inner self-start lg:self-center">
              {[1, 2, 3, 4].map((beatNum) => {
                const isByBeatPulsing = isPlayingFlow && currentBeat === beatNum;
                const isBeat4Token = beatNum === 4;
                return (
                  <div
                    key={beatNum}
                    className={`w-10 h-10 flex items-center justify-center font-mono font-black text-sm rounded-lg border transition-all duration-75 select-none ${
                      isByBeatPulsing
                        ? isBeat4Token
                          ? "bg-[#faba37] text-white border-[#e0a22b] shadow-md scale-105"
                          : "bg-blue-600 text-white border-blue-500 shadow-md scale-105"
                        : "bg-white text-zinc-300 border-zinc-100"
                    }`}
                  >
                    {beatNum}
                  </div>
                );
              })}
            </div>

            {/* CONTROL BLOCK ACTIONS CLUSTER */}
            <div className="flex items-center gap-2.5 self-end lg:self-center shrink-0">
              
              <div className="flex items-center bg-zinc-50 border border-zinc-200 p-1 rounded-xl shadow-inner gap-0.5">
                <button
                  type="button"
                  onClick={() => setLyricsFontSize(prev => Math.max(12, prev - 2))}
                  className="w-8 h-8 bg-white hover:bg-zinc-100 border border-zinc-200/60 text-zinc-700 rounded-lg font-black text-xs cursor-pointer flex items-center justify-center"
                >
                  A-
                </button>
                <span className="text-[10px] font-mono font-black text-zinc-400 px-1.5 min-w-[36px] text-center">
                  {lyricsFontSize}px
                </span>
                <button
                  type="button"
                  onClick={() => setLyricsFontSize(prev => Math.min(24, prev + 2))}
                  className="w-8 h-8 bg-white hover:bg-zinc-100 border border-zinc-200/60 text-zinc-700 rounded-lg font-black text-xs cursor-pointer flex items-center justify-center"
                >
                  A+
                </button>
              </div>

              <button
                type="button"
                disabled={isPlayingFlow}
                onClick={handleOpenTransposerModal}
                className="bg-white border border-zinc-200 rounded-xl p-2.5 px-3.5 text-xs font-bold text-zinc-400 shadow-sm flex items-center gap-1 hover:border-blue-500 hover:text-blue-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                KEY <span className="text-blue-600 font-black text-sm">{activeDisplayKey || activeSong?.original_key || "--"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsStructureModalOpen(true)}
                disabled={isPlayingFlow}
                className="px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm disabled:opacity-40"
              >
                🧱 Structure
              </button>

              <button
                type="button"
                onClick={handleToggleFlowPlaybackState}
                className={`px-5 py-2.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer flex items-center gap-1.5 ${
                  isPlayingFlow 
                    ? "bg-red-600 border-red-500 text-white shadow-md ring-4 ring-red-500/10 scale-95" 
                    : "bg-blue-600 border-blue-500 text-white hover:bg-blue-700"
                }`}
              >
                {isPlayingFlow ? "⏹ STOP FLOW" : `▶ START IN ${highlightedTargetSectionName}`}
              </button>
            </div>

          </div>

          {/* ROW 2: SINGLE SONG BAR TRACKLIST DOCK ROW */}
          <div className="w-full border-t border-zinc-100 pt-3 flex flex-wrap items-center gap-2 relative z-10">
            {tracksList.map((track, trackIdx) => (
              <button
                key={track.id}
                type="button"
                disabled={isPlayingFlow}
                onClick={() => handleUserSelectTrackBadge(trackIdx)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-40 border ${
                  currentTrackIndex === trackIdx
                    ? "bg-blue-600 border-blue-500 text-white shadow-sm"
                    : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {trackIdx + 1}. {track.songs?.title || "Song"}{" "}
                <span className="font-mono font-bold opacity-50 ml-0.5">({track.custom_key || track.songs?.original_key})</span>
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* ======================================================================= */}
      {/* --- SCROLLABLE SHEET PANELS PANE CANVAS -------------------------------- */}
      {/* ======================================================================= */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 pt-1 custom-scrollbar pb-24"
      >
        <div className="max-w-5xl w-full mx-auto space-y-4">
          
          {memoizedSongAstTree.map((section, idx) => {
            const isSectionCurrentlyActive = isPlayingFlow && currentSectionIndex === idx;
            const isStagedUnstartedTarget = !isPlayingFlow && currentSectionIndex === idx;
            const centralizedTimingConfig = activeSong?.section_timings?.[section.section_name] || { measures: 4, beats: 0 };

            return (
              <div
                key={section.id}
                ref={(el) => { sectionRefs.current[section.id] = el; }}
                onClick={() => handleSelectSectionDirectly(idx)}
                className={`bg-white border rounded-[2rem] p-6 shadow-sm transition-all duration-300 relative ${
                  isSectionCurrentlyActive 
                    ? "border-blue-500 ring-4 ring-blue-500/10 scale-[1.001] shadow-md z-10 cursor-pointer" 
                    : `border-zinc-200 opacity-95 text-[#f8f9fa] cursor-pointer hover:border-blue-400 hover:bg-zinc-50/30`
                  }`}
                style={isStagedUnstartedTarget ? { borderColor: '#fbbf24', boxShadow: '0 0 0 4px rgba(251, 191, 36, 0.1)' } : {}}
              >
                <div className="flex items-center justify-between border-b border-zinc-100/80 pb-2.5 mb-4 select-none">
                  <div className="flex items-center gap-2">
                    <span className={`font-black text-[10px] uppercase tracking-wider px-3 py-1 rounded-full ${
                      isSectionCurrentlyActive ? "bg-blue-600 text-white shadow-sm" : isStagedUnstartedTarget ? "bg-amber-500 text-white shadow-sm" : "bg-blue-50 text-blue-600"
                    }`}>
                      {section.section_name}
                    </span>
                    {isStagedUnstartedTarget && (
                      <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest animate-pulse"> Staged Target Point </span>
                    )}
                  </div>
                  
                  <div onClick={e => e.stopPropagation()} className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-zinc-50 border rounded-xl px-2 py-0.5 text-[10px] font-bold text-zinc-500 shadow-inner">
                      <span>M:</span>
                      <input 
                        type="number" 
                        min={0}
                        value={centralizedTimingConfig.measures} 
                        onChange={e => commitSectionTimingUpdate(section.section_name, "measures", Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-7 bg-transparent text-center font-black text-zinc-800 outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1 bg-zinc-50 border rounded-xl px-2 py-0.5 text-[10px] font-bold text-zinc-500 shadow-inner">
                      <span>B:</span>
                      <input 
                        type="number" 
                        min={0}
                        max={3}
                        value={centralizedTimingConfig.beats} 
                        onChange={e => commitSectionTimingUpdate(section.section_name, "beats", Math.min(3, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                        className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pl-1.5 select-text selection:bg-blue-50 text-zinc-800 space-y-2">
                  {section.lines.length === 0 ? <div className="h-4" /> : section.lines.map((line, lIdx) => (
                    <div key={lIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1">
                      <div className="flex flex-wrap items-end gap-x-2.5 gap-y-4 py-1 leading-none flex-1">
                        {line.words.map((wordObj, wIdx) => (
                          <div key={wIdx} className="flex flex-col items-start min-h-[38px] justify-end">
                            {wordObj.chords.length > 0 && (
                              <div className="text-[12px] font-mono font-black text-blue-600 tracking-tight pb-0.5 select-none">
                                {wordObj.chords.map((ch, cIdx) => {
                                  const finalChord = runtimeSemitoneDelta !== 0 ? transposeBracketContent(ch, runtimeSemitoneDelta) : ch;
                                  return <span key={cIdx} className="mr-1 bg-blue-50/60 px-1 rounded border border-blue-100/40">{finalChord}</span>;
                                })}
                              </div>
                            )}
                            <div 
                              style={{ fontSize: `${lyricsFontSize}px` }}
                              className="font-sans font-bold text-zinc-800 tracking-tight transition-all duration-100"
                            >
                              {wordObj.word || " "}
                            </div>
                          </div>
                        ))}
                      </div>
                      {line.comment && (
                        <div style={{ fontFamily: "'Nothing You Could Do', cursive" }} className="text-[17px] text-zinc-400 tracking-wide select-none self-center whitespace-nowrap sm:pl-4">
                          {line.comment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {upcomingTrackItem?.songs && (
            <div className="pt-4 animate-in fade-in duration-300">
              <div 
                onClick={() => handleUserSelectTrackBadge(currentTrackIndex + 1)}
                className="w-full bg-zinc-50 border border-dashed border-zinc-300/80 hover:bg-zinc-100/50 hover:border-zinc-400 rounded-3xl p-5 text-center cursor-pointer transition-all select-none group"
              >
                <span className="text-[10px] font-black tracking-widest text-zinc-400 uppercase block mb-1">Up Next In Queue</span>
                <h4 className="font-black text-sm text-zinc-700 group-hover:text-blue-600 transition-colors">
                  ⏩ {upcomingTrackItem.songs.title} <span className="font-normal opacity-50 font-mono text-xs">({upcomingTrackItem.custom_key || upcomingTrackItem.songs.original_key})</span>
                </h4>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================================= */}
      {/* --- OVERHAULED MODAL STRUCTURE OVERRIDE DRAWER WORKSPACE -------------- */}
      {/* ======================================================================= */}
      {isStructureModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[250000] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-100 select-none">
          <div className="bg-white border border-zinc-200 rounded-[2.5rem] shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 relative text-left">
            
            <button
              type="button"
              onClick={() => setIsStructureModalOpen(false)}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-zinc-50 hover:bg-zinc-100 border text-zinc-400 text-xs font-bold flex items-center justify-center shadow-sm cursor-pointer transition-colors"
            >
              ✕
            </button>

            <div className="p-6 px-8 border-b border-zinc-100 flex-shrink-0 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-zinc-900 tracking-tight">Modify Worship Arrangement</h3>
                <p className="text-xs text-zinc-400 font-bold mt-0.5">Drag blocks to reorganize, or append fields to alter the set timeline overrides.</p>
              </div>
              {isSavingStructure && (
                <span className="text-[10px] bg-blue-50 font-black text-blue-600 border border-blue-100 px-3 py-1 rounded-full animate-pulse">Syncing...</span>
              )}
            </div>

            <div className="flex-1 overflow-hidden flex divide-x divide-zinc-100">
              <div className="w-7/12 overflow-y-auto p-6 space-y-2 custom-scrollbar">
                <div className="text-[9px] font-black uppercase text-zinc-400 tracking-wider mb-2">Active Performance Sequence</div>
                
                {sections.map((sec, sIdx) => {
                  const isBeingDragged = draggedSectionIndex === sIdx;
                  const isHoveredTarget = dragOverIndex === sIdx;

                  return (
                    <div
                      key={sec.id}
                      draggable
                      onDragStart={() => handleModalSectionDragStart(sIdx)}
                      onDragOver={(e) => { e.preventDefault(); if (dragOverIndex !== sIdx) setDragOverIndex(sIdx); }}
                      onDragLeave={() => { if (dragOverIndex === sIdx) setDragOverIndex(null); }}
                      onDragEnd={() => { setDraggedSectionIndex(null); setDragOverIndex(null); }}
                      onDrop={() => handleModalSectionDrop(sIdx)}
                      className={`flex items-center justify-between p-3.5 border rounded-2xl cursor-grab active:cursor-grabbing transition-all duration-150 relative ${
                        isBeingDragged 
                          ? "opacity-30 bg-zinc-100 border-zinc-300" 
                          : isHoveredTarget
                          ? "border-blue-500 bg-blue-50/50 scale-[1.01] ring-2 ring-blue-400/20 shadow-md"
                          : "bg-zinc-50 hover:bg-zinc-100 border-zinc-200 shadow-inner"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs text-zinc-400 font-mono font-bold shrink-0">#{sIdx + 1}</span>
                        <span className="text-xs font-black uppercase tracking-wider text-zinc-700 truncate">{sec.section_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          type="button" 
                          onClick={() => handleModalRemoveSectionItem(sIdx)}
                          className="text-[10px] font-bold text-zinc-400 hover:text-red-500 px-1 cursor-pointer transition-colors"
                        >
                          ✕ Remove
                        </button>
                        <span className="text-zinc-300 text-xs font-bold select-none cursor-grab">☰</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="w-5/12 overflow-y-auto p-6 bg-zinc-50/40 space-y-3 custom-scrollbar">
                <div className="text-[9px] font-black uppercase text-zinc-400 tracking-wider mb-1">Add Block Element</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {STRUCTURE_CATALOG_PRESETS.map((presetName) => (
                    <button
                      key={presetName}
                      type="button"
                      onClick={() => handleModalAppendNewSectionItem(presetName)}
                      className="w-full text-left p-3 px-4 bg-white hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 flex justify-between items-center transition-all shadow-sm cursor-pointer group"
                    >
                      <span>🏷️ {presetName}</span>
                      <span className="text-zinc-300 group-hover:text-blue-500 font-black text-xs font-mono">＋</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5 px-8 bg-zinc-50 border-t flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsStructureModalOpen(false)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest rounded-xl shadow-md transition-colors cursor-pointer text-xs"
              >
                Close & Lock Workspace
              </button>
            </div>

          </div>
        </div>
      )}

      {/* OVERLAY KEY OVERRIDE TRANSPOSER MODAL */}
      {isTransposerOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-100 select-none">
          <form 
            onSubmit={handleCommitTranspositionSave}
            className="bg-[#f8f9fa] border border-zinc-200 rounded-[2.5rem] shadow-2xl max-w-xl w-full p-7 px-8 space-y-6 animate-in zoom-in-95 duration-150 relative text-left"
          >
            <button
              type="button"
              onClick={() => setIsTransposerOpen(false)}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white hover:bg-zinc-100 border text-zinc-400 text-xs font-bold flex items-center justify-center shadow-sm cursor-pointer transition-colors"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Setlist Transposer</h3>
              <p className="text-xs font-black text-blue-500">Original Song Base {activeSong?.original_key || "--"}</p>
            </div>

            <div className="grid grid-cols-7 gap-2 bg-white p-2 rounded-2xl border shadow-inner">
              {BASE_LETTER_ROOTS.map((letter) => {
                const isSelected = modalRoot === letter;
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setModalRoot(letter)}
                    className={`aspect-square rounded-xl text-center text-sm font-black transition-all flex items-center justify-center cursor-pointer ${
                      isSelected ? "bg-blue-600 text-white shadow-md scale-105" : "bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 divide-x bg-white rounded-2xl border overflow-hidden shadow-inner h-12">
              <button
                type="button"
                onClick={() => setModalAccidental(modalAccidental === "b" ? "" : "b")}
                className={`text-center text-base font-black transition-colors flex items-center justify-center h-full cursor-pointer ${
                  modalAccidental === "b" ? "bg-blue-50/80 text-blue-600 font-extrabold" : "text-zinc-600 hover:bg-zinc-50/50"
                }`}
              >
                ♭
              </button>
              <button
                type="button"
                onClick={() => setModalAccidental(modalAccidental === "#" ? "" : "#")}
                className={`text-center text-sm font-black transition-colors flex items-center justify-center h-full cursor-pointer ${
                  modalAccidental === "#" ? "bg-blue-50/80 text-blue-600 font-extrabold" : "text-zinc-600 hover:bg-zinc-50/50"
                }`}
              >
                #
              </button>
            </div>

            <div className="pt-2">
              <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-md text-center cursor-pointer">
                Apply Rehearsal Override
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}