"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../../utils/supabase/client";
import { useEngine } from "../../../context/EngineContext"; 

// HOISTED TO GLOBAL SCOPE: Instantiates exactly once per tab instance to protect the WebSocket stream!
const supabase = createClient();

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
  const router = useRouter();
  const params = useParams();
  const setlistId = params?.id as string;
  

  // Consume active profile states from your context simulation layer
  const { simulatedUserId, simulatedRole } = useEngine();

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
  
  // Accessibility & Layout Preference Configurations
  const [lyricsFontSize, setLyricsFontSize] = useState<number>(16);
  const [showChords, setShowChords] = useState<boolean>(true); 
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false); 
  const [lineSpacing, setLineSpacing] = useState<number>(16); 

  // ✅ SURGICAL REFACTOR: Added isMD?: boolean to the state type matrices
  const [onlineUsers, setOnlineUsers] = useState<{ id: string; name: string; initials: string; bg: string; connectionId?: string; avatar?: string | null; isMD?: boolean; }[]>([]);
  const [localPresenceUser, setLocalPresenceUser] = useState<{ id: string; name: string; initials: string; bg: string; connectionId?: string; avatar?: string | null; isMD?: boolean; } | null>(null);
 
  // Tracking references to eliminate stale closure blocks
  const localPresenceUserRef = useRef<any>(null);
  const isChannelSubscribedRef = useRef<boolean>(false);
    
  // ✅ SURGICAL ASSIGNMENT: Master clock reference anchor tracking pointer
  const mdSectionStartTimeRef = useRef<number | null>(null);
 
  // Floating scroll state anchors tracking fields
  const [showSyncBack, setShowSyncBack] = useState<boolean>(false);
  const isAutoScrollingRef = useRef<boolean>(false);

  // Background Metronome Runtime Registers
  const [playingTrackIndex, setPlayingTrackIndex] = useState<number>(0);
  const playingTrackIndexRef = useRef<number>(0);
  const playingSongRef = useRef<SongRecord | null>(null);
  const playingSectionsRef = useRef<ArrangementSection[]>([]);

  // Multi-Track Cross-Song Mashup Queue States
  const [queuedTrackIndex, setQueuedTrackIndex] = useState<number | null>(null);
  const queuedTrackIndexRef = useRef<number | null>(null);
  const [queuedSectionIndex, setQueuedSectionIndex] = useState<number | null>(null);
  const queuedSectionIndexRef = useRef<number | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const [isPausedFlow, setIsPausedFlow] = useState(false); // 🌟 Check for the 'd' in "Paused"!
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
  const pauseOffsetMsRef = useRef<number>(0);
  const totalBeatsRef = useRef<number>(0);
  const lastBeatRef = useRef<number>(1);
  const animationFrameRef = useRef<number | null>(null);
  const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Layout Container Sizing Style References
  const backdropProgressRef = useRef<HTMLDivElement | null>(null);
  const accentProgressBarRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Workspace tracking references driving precision background clock rendering loops
  const currentTrackIndexRef = useRef<number>(0);

  // Synchronize layout state tracking variables seamlessly
  useEffect(() => { activeSongRef.current = activeSong; }, [activeSong]);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => { tracksListRef.current = tracksList; }, [tracksList]);
  
  // Sync background execution pointer changes
  useEffect(() => { playingTrackIndexRef.current = playingTrackIndex; }, [playingTrackIndex]);
  useEffect(() => { queuedTrackIndexRef.current = queuedTrackIndex; }, [queuedTrackIndex]);
  useEffect(() => { queuedSectionIndexRef.current = queuedSectionIndex; }, [queuedSectionIndex]);
  useEffect(() => { currentTrackIndexRef.current = currentTrackIndex; }, [currentTrackIndex]);

  // Pull from profiles table matching the context user simulation coordinates
  useEffect(() => {
    async function fetchCurrentPresenceIdentity() {
      let targetUserId = simulatedUserId;

      if (!targetUserId || targetUserId === "00000000-0000-0000-0000-000000000000") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) targetUserId = user.id;
      }

      if (targetUserId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", targetUserId)
          .maybeSingle();

        const displayName = profile?.full_name || "Simulated Account";
        const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "U";
        
        const colorPresets = ["bg-red-600", "bg-blue-600", "bg-purple-600", "bg-emerald-600", "bg-amber-600", "bg-indigo-600"];
        const idCharCodeSum = targetUserId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const assignedBg = colorPresets[idCharCodeSum % colorPresets.length];

        const identityPayload = { 
          id: targetUserId, 
          connectionId: `${targetUserId}-${Math.random().toString(36).substring(2, 7)}`, 
          name: displayName, 
          initials, 
          bg: assignedBg,
          avatar: profile?.avatar_url || null,
          isMD: false // ✅ SURGICAL ASSIGNMENT: Track MD status natively over the presence stream
        };

        localPresenceUserRef.current = identityPayload;
        setLocalPresenceUser(identityPayload);
      }
    }
    fetchCurrentPresenceIdentity();
  }, [simulatedUserId]);

  // ==========================================================
  // --- REAL-TIME NETWORK BROADCAST & PRESENCE ENGINE -------
  // ==========================================================
  useEffect(() => {
    if (!setlistId || !localPresenceUser) return; 

    console.log(`Setting up Realtime Channel connection for room: setlist_lobby_${setlistId}`);
    isChannelSubscribedRef.current = false;
    
    const lobbyChannel = supabase.channel(`setlist_lobby_${setlistId}`, {
      config: {
        broadcast: { ack: false, self: true },
        presence: { key: localPresenceUser.connectionId } 
      }
    });

    lobbyChannel
      .on("presence", { event: "sync" }, () => {
        const presenceState = lobbyChannel.presenceState();
        const activeUsersList = Object.values(presenceState).flat() as any[];
        setOnlineUsers(activeUsersList);

        // ✅ SURGICAL FIX: Mid-set joiners sync immediately upon connection detection if the MD is currently playing
        if (isPlayingRef.current && localPresenceUserRef.current?.isMD) {
          lobbyChannel.send({
            type: "broadcast",
            event: "lobby_sync",
            payload: {
              action: "START",
              trackIndex: currentTrackIndexRef.current,
              sectionIndex: currentSectionIndexRef.current,
              mdSectionStartTime: mdSectionStartTimeRef.current || Date.now()
            }
          });
        }
      })
      .on("broadcast", { event: "lobby_sync" }, ({ payload }) => {
        // ✅ SURGICAL REFACTOR: Convert MD absolute time anchors into matching local animation timeline frames
        if (payload.action === "START") {
          const targetTrackIdx = payload.trackIndex !== undefined ? payload.trackIndex : currentTrackIndex;
          mountTargetSetlistTrackIndex(targetTrackIdx, tracksListRef.current, false, true);

          // ✅ SURGICAL FIX: Ensure late joiners cache the absolute timestamp right into their state pointers
          if (payload.mdSectionStartTime) {
            mdSectionStartTimeRef.current = payload.mdSectionStartTime;
          }

          // Phase-lock the timeline clock to match the leader's execution frame
          const networkLatencyOffset = Date.now() - (payload.mdSectionStartTime || Date.now());
          sectionStartTimeRef.current = performance.now() - networkLatencyOffset;

          currentSectionIndexRef.current = payload.sectionIndex;
          setCurrentSectionIndex(payload.sectionIndex);
          lastBeatRef.current = 1;
          setCurrentBeat(1);
          if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
          if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";

          isPlayingRef.current = true;
          setIsPlayingFlow(true);
        } 
        else if (payload.action === "STOP") {
          executeLocalResetSequence();
        } 
        else if (payload.action === "JUMP") {
          if (payload.trackIndex !== undefined && payload.trackIndex !== playingTrackIndexRef.current) {
            mountTargetSetlistTrackIndex(payload.trackIndex, tracksListRef.current, false, true);
          }

          if (payload.mdSectionStartTime) {
            mdSectionStartTimeRef.current = payload.mdSectionStartTime;
          }

          currentSectionIndexRef.current = payload.sectionIndex;
          setCurrentSectionIndex(payload.sectionIndex);
          
          // ✅ Force the local audio metronome and progress bars to clear to 0 instantly on transition
          lastBeatRef.current = 1;
          setCurrentBeat(1);
          if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
          if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
          
          if (isPlayingRef.current) {
            sectionStartTimeRef.current = performance.now();
          }
        }
        else if (payload.action === "TRACK_CHANGE") {
          mountTargetSetlistTrackIndex(payload.trackIndex, tracksListRef.current, true, true);
        }
        else if (payload.action === "QUEUE") {
          setQueuedTrackIndex(payload.trackIndex);
          setQueuedSectionIndex(payload.sectionIndex);
        }
      })
      .subscribe((status) => {
        console.log(`📡 WebSocket Subscription Status for Room [${setlistId}]:`, status);
        if (status === "SUBSCRIBED") {
          isChannelSubscribedRef.current = true; 
          lobbyChannel.track(localPresenceUser);
        }
      });

    realtimeChannelRef.current = lobbyChannel;

    return () => {
      if (lobbyChannel) {
        console.log("Cleaning up Realtime Channel connection context link thread.");
        supabase.removeChannel(lobbyChannel);
      }
    };
  }, [setlistId, localPresenceUser]);

  function executeLocalResetSequence() {
    isPlayingRef.current = false;
    setIsPlayingFlow(false);
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    currentSectionIndexRef.current = 0;
    lastBeatRef.current = 1;
    
    setCurrentSectionIndex(0);
    setCurrentBeat(1);
    setQueuedTrackIndex(null);
    setQueuedSectionIndex(null);

    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
  }

  // ==========================================================
  // --- BULLETPROOF INLINE ENVIRONMENT PERFORMANCE LOADER ----
  // ==========================================================
  useEffect(() => {
    let isCurrentActiveMount = true;

    async function initializePerformanceEnvironment() {
      if (!setlistId) {
        setLoadingStatus("Waiting for Next.js route parameters to hydrate...");
        return;
      }

      try {
        setLoadingStatus("Connecting to database and pulling room metadata...");
        
        const { data: setlistRow, error: setlistError } = await supabase
          .from("setlists")
          .select("name")
          .eq("id", setlistId)
          .maybeSingle();
        
        if (setlistError) console.error("Setlist metadata query warning:", setlistError);
        if (setlistRow?.name) setNewSetlistName(setlistRow.name);

        setLoadingStatus("Extracting track lineup array allocations...");
        const primaryResponse = await supabase
          .from("setlist_songs")
          .select("id, sequence_order, start_time, custom_key, custom_structure, songs (*)")
          .eq("setlist_id", setlistId)
          .order("sequence_order", { ascending: true });

        // Explicitly declare typing definitions to pass strict pipeline checks
        let rawQueryData: any[] | null = primaryResponse.data;
        if (primaryResponse.error) {
          const fallbackResponse = await supabase
            .from("setlist_songs")
            .select("id, sequence_order, start_time, custom_key, songs (*)")
            .eq("setlist_id", setlistId)
            .order("sequence_order", { ascending: true });
          rawQueryData = fallbackResponse.data;
        }

        if (rawQueryData && rawQueryData.length > 0) {
          setLoadingStatus("Compiling abstract lyric chord maps and building sheet matrices...");
          
          const formattedTracks = await Promise.all(rawQueryData.map(async (t: any) => {
            const flattenedSongNode = Array.isArray(t.songs) ? t.songs[0] : t.songs;
            if (!flattenedSongNode) return null;

            let loadedStructure = t.custom_structure ? (t.custom_structure as unknown as ArrangementSection[]) : null;
            if (!loadedStructure) {
              const { data: sectionsData } = await supabase
                .from("song_sections")
                .select("id, section_name, content")
                .eq("song_id", flattenedSongNode.id)
                .order("sequence_order", { ascending: true });
              loadedStructure = sectionsData || [];
            }

            return {
              id: t.id,
              sequence_order: t.sequence_order,
              start_time: t.start_time,
              custom_key: t.custom_key || undefined,
              custom_structure: loadedStructure,
              songs: flattenedSongNode as unknown as SongRecord
            };
          }));

          const cleanTracks = formattedTracks.filter(t => t !== null) as SetlistTrackItem[];
          
          if (isCurrentActiveMount) {
            setTracksList(cleanTracks);
            
            if (cleanTracks.length > 0) {
              const firstTrackItem = cleanTracks[0];
              if (firstTrackItem && firstTrackItem.songs) {
                setActiveSong(firstTrackItem.songs);
                setCurrentTrackIndex(0);
                setActiveDisplayKey(firstTrackItem.custom_key || firstTrackItem.songs.original_key || "G");
                setSections(firstTrackItem.custom_structure || []);

                playingTrackIndexRef.current = 0;
                setPlayingTrackIndex(0);
                playingSongRef.current = firstTrackItem.songs;
                playingSectionsRef.current = firstTrackItem.custom_structure || [];
              }
            }
            setLoading(false);
          }
        } else {
          setLoadingStatus("Handshake clean, but this setlist has no songs added to it yet.");
        }
      } catch (err: any) {
        console.error("Lobby initialization crash:", err);
        setLoadingStatus(`Critical Crash: ${err?.message || "Check connection parameters"}`);
      }
    }

    initializePerformanceEnvironment();

    return () => {
      isCurrentActiveMount = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [setlistId]);

  // ✅ Decouple display viewing from core background player loops and support gapless transitions
  async function mountTargetSetlistTrackIndex(trackIndex: number, currentTracksArray = tracksListRef.current, isLocalBrowsing = false, keepPlaying = false) {
    const targetTrackItem = currentTracksArray[trackIndex];
    if (!targetTrackItem || !targetTrackItem.songs) return;

    const targetSong = targetTrackItem.songs;
    setActiveSong(targetSong);
    setCurrentTrackIndex(trackIndex);
    setActiveDisplayKey(targetTrackItem.custom_key || targetSong.original_key || "G");

    const loadedSections = targetTrackItem.custom_structure || [];
    setSections(loadedSections);

    if (!isLocalBrowsing) {
      playingTrackIndexRef.current = trackIndex;
      setPlayingTrackIndex(trackIndex);
      playingSongRef.current = targetSong;
      playingSectionsRef.current = loadedSections;
      
      // ✅ Never drop execution threads unless explicitly asked to do so
      if (!keepPlaying) {
        executeLocalResetSequence();
      }
    }
  }

  function handleUserSelectTrackBadge(trackIdx: number) {
    if (isPlayingFlow) {
      mountTargetSetlistTrackIndex(trackIdx, tracksList, true);
    } else {
      mountTargetSetlistTrackIndex(trackIdx, tracksList, false);
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: "broadcast",
          event: "lobby_sync",
          payload: { action: "TRACK_CHANGE", trackIndex: trackIdx }
        });
      }
    }
  }

  function handleAdvanceToNextSetlistTrack() {
    const nextTrackIndex = playingTrackIndexRef.current + 1; 
    if (nextTrackIndex < tracksListRef.current.length) {
      mountTargetSetlistTrackIndex(nextTrackIndex, tracksListRef.current, false, false);
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
        // ✅ SURGICAL FIX: Cache real-time anchor state coordinates instantly on track progress updates
        if (localPresenceUserRef.current?.isMD) {
          mdSectionStartTimeRef.current = Date.now();
        }
      }, 120);
    } else {
      handleResetFlowTrigger();
    }
  }

  // REUSABLE DYNAMIC ALIGNMENT SNAPPING
  const handleScrollToActiveSectionAnchor = () => {
    if (currentTrackIndex !== playingTrackIndexRef.current) {
      const activePlayingTrackItem = tracksList[playingTrackIndexRef.current];
      if (activePlayingTrackItem && activePlayingTrackItem.songs) {
        setActiveSong(activePlayingTrackItem.songs);
        setCurrentTrackIndex(playingTrackIndexRef.current);
        setActiveDisplayKey(activePlayingTrackItem.custom_key || activePlayingTrackItem.songs.original_key || "G");
        setSections(activePlayingTrackItem.custom_structure || []);
      }
      return;
    }

    if (sections.length === 0 || !sections[currentSectionIndex] || !scrollContainerRef.current) return;

    const targetElement = sectionRefs.current[sections[currentSectionIndex].id];
    if (targetElement) {
      isAutoScrollingRef.current = true; 
      const containerTop = scrollContainerRef.current.getBoundingClientRect().top;
      const elementTop = targetElement.getBoundingClientRect().top;
      const absoluteTargetScrollTop = scrollContainerRef.current.scrollTop + (elementTop - containerTop) - 24;

      scrollContainerRef.current.scrollTo({
        top: absoluteTargetScrollTop,
        behavior: "smooth"
      });

      setShowSyncBack(false); 
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 550);
    }
  };

  // Automated layout tracker scrolling on internal node adjustments
  useEffect(() => {
    if (currentTrackIndex === playingTrackIndexRef.current) {
      handleScrollToActiveSectionAnchor();
    }
  }, [currentSectionIndex]);

  // Viewport listener evaluates user scroll drift
  useEffect(() => {
    const containerNode = scrollContainerRef.current;
    if (!containerNode) return;

    const handleContainerScrollDetection = () => {
      if (!isPlayingFlow || isAutoScrollingRef.current) return;

      if (currentTrackIndex !== playingTrackIndexRef.current) {
        setShowSyncBack(true);
        return;
      }

      const activeSectionNode = sections[currentSectionIndex];
      if (!activeSectionNode) return;

      const targetElement = sectionRefs.current[activeSectionNode.id];
      if (!targetElement) return;

      const containerRect = containerNode.getBoundingClientRect();
      const elementRect = targetElement.getBoundingClientRect();

      const isOutOfViewBounds = (elementRect.bottom < containerRect.top + 20) || (elementRect.top > containerRect.bottom - 20);
      setShowSyncBack(isOutOfViewBounds);
    };

    containerNode.addEventListener("scroll", handleContainerScrollDetection);
    return () => containerNode.removeEventListener("scroll", handleContainerScrollDetection);
  }, [isPlayingFlow, currentSectionIndex, sections, currentTrackIndex, playingTrackIndex]);


  // ==========================================================
  // --- COMPOSER ENGINE HARDWARE ANIMATION TIMELINE LOOP -----
  // ==========================================================
  useEffect(() => {
    if (!isPlayingFlow || !activeSong || sections.length === 0) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    sectionStartTimeRef.current = performance.now();
    lastBeatRef.current = 1;

    // ✅ SURGICAL REFACTOR: Pull and evaluate MD state directly inside current loop execution frame
    const isCurrentlyMD = localPresenceUser?.isMD === true;
    const beatSpeedMs = (60 / (activeSong.tempo || 75)) * 1000;

    if (pauseOffsetMsRef.current > 0) {
      sectionStartTimeRef.current = performance.now() - pauseOffsetMsRef.current;
    } else {
      sectionStartTimeRef.current = performance.now();
    }

    const activeSection = sections[currentSectionIndexRef.current];
    if (activeSection) {
      const timings = activeSong.section_timings?.[activeSection.section_name] || { measures: 4, beats: 0 };
      totalBeatsRef.current = (timings.measures * 4) + timings.beats || 16;
    }

    const clockExecutionTick = (timestamp: number) => {
      if (!isPlayingRef.current || !activeSongRef.current || sectionsRef.current.length === 0) return;
      
      const song = playingSongRef.current || activeSongRef.current; 
      const secs = playingSectionsRef.current;
      const idx = currentSectionIndexRef.current;

      const currentSection = secs[idx];
      if (!currentSection) {
        handleAdvanceToNextSetlistTrack();
        return;
      }

      const beatSpeedMsCurrent = (60 / (song.tempo || 75)) * 1000;
      const timings = song.section_timings?.[currentSection.section_name] || { measures: 4, beats: 0 };
      const totalBeats = (timings.measures * 4) + timings.beats || 16;
      const totalDurationMs = totalBeats * beatSpeedMsCurrent;

      // ✅ SURGICAL REFACTOR: Non-MD users calculate time directly from the MD's absolute epoch coordinates
      let elapsedMs = timestamp - sectionStartTimeRef.current;
      if (isCurrentlyMD || mdSectionStartTimeRef.current === null) {
        elapsedMs = timestamp - sectionStartTimeRef.current;
      } else {
        elapsedMs = Date.now() - mdSectionStartTimeRef.current;
      }
      
      const progressRatio = Math.min(1, elapsedMs / totalDurationMs);

      // PERFORMANCE OPTIMIZATION: Mutating GPU transforms eliminates browser reflow completely
      if (backdropProgressRef.current) backdropProgressRef.current.style.transform = `scaleX(${progressRatio})`;
      if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;

      const currentBeatPulse = Math.floor(elapsedMs / beatSpeedMsCurrent) % 4 + 1;
      if (currentBeatPulse !== lastBeatRef.current) {
        lastBeatRef.current = currentBeatPulse;
        setCurrentBeat(currentBeatPulse);
      }

      if (elapsedMs >= totalDurationMs) {
        // ✅ Buffer layout states smoothly on read-only screens if they finish a section early
        // Holds at 100% capacity and stops auto-advancing until the MD pushes a network update
        if (!isCurrentlyMD) {
          if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(1)";
          if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(1)";
          animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
          return;
        }

        const harmsActiveQueue = queuedSectionIndexRef.current !== null && queuedTrackIndexRef.current !== null;
        let nextTrackIdx = playingTrackIndexRef.current;
        let nextSectionIdx = idx + 1;

        if (harmsActiveQueue) {
          nextTrackIdx = queuedTrackIndexRef.current as number;
          nextSectionIdx = queuedSectionIndexRef.current as number;
          setQueuedSectionIndex(null); 
          setQueuedTrackIndex(null);
        }

        if (nextTrackIdx !== playingTrackIndexRef.current) {
          const targetTrackItem = tracksListRef.current[nextTrackIdx];
          if (targetTrackItem && targetTrackItem.songs) {
            playingTrackIndexRef.current = nextTrackIdx;
            setPlayingTrackIndex(nextTrackIdx);
            playingSongRef.current = targetTrackItem.songs;
            playingSectionsRef.current = targetTrackItem.custom_structure || [];

            setActiveSong(targetTrackItem.songs);
            setCurrentTrackIndex(nextTrackIdx);
            setActiveDisplayKey(targetTrackItem.custom_key || targetTrackItem.songs.original_key || "G");
            setSections(targetTrackItem.custom_structure || []);

            if (realtimeChannelRef.current) {
              realtimeChannelRef.current.send({
                type: "broadcast",
                event: "lobby_sync",
                payload: { action: "TRACK_CHANGE", trackIndex: nextTrackIdx }
              });
            }
          }
        }

        const currentPlayingSongSections = playingSectionsRef.current;
        if (nextSectionIdx < currentPlayingSongSections.length) {
          const overrun = elapsedMs - totalDurationMs;
          currentSectionIndexRef.current = nextSectionIdx;
          setCurrentSectionIndex(nextSectionIdx);
          sectionStartTimeRef.current = performance.now() - overrun;
          lastBeatRef.current = 1;

          // ✅ SURGICAL FIX: Keep absolute global state anchors updated locally during gapless loop changes
          const calculatedNextStart = Date.now() - overrun;
          if (isCurrentlyMD) {
            mdSectionStartTimeRef.current = calculatedNextStart;
          }

          if (realtimeChannelRef.current) {
            realtimeChannelRef.current.send({
              type: "broadcast",
              event: "lobby_sync",
              payload: { 
                action: "JUMP", 
                trackIndex: nextTrackIdx,
                sectionIndex: nextSectionIdx,
                mdSectionStartTime: calculatedNextStart // Sync epoch offset adjusted for overrun
              }
            });
          }
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
  }, [isPlayingFlow, currentSectionIndex, activeSong, sections, localPresenceUser]);

  function handleToggleFlowPlaybackState() {
    if (isPlayingFlow) {
      handleResetFlowTrigger();
    } else {
      if (sections.length === 0 || !activeSong) return;
      
      playingTrackIndexRef.current = currentTrackIndex;
      setPlayingTrackIndex(currentTrackIndex);
      playingSongRef.current = activeSong;
      playingSectionsRef.current = sections;

      isPlayingRef.current = true;
      setIsPlayingFlow(true);

      // ✅ SURGICAL FIX: Cache the epoch timestamp natively right on play invocation
      const startTimestamp = Date.now();
      mdSectionStartTimeRef.current = startTimestamp;

      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: "broadcast",
          event: "lobby_sync",
          payload: { 
            action: "START", 
            trackIndex: currentTrackIndex, 
            sectionIndex: currentSectionIndex,
            mdSectionStartTime: startTimestamp // ✅ Sync start epoch
          }
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

  // Implemented debounced cross-song queuing handler
  function handleSectionInteractiveSelection(index: number) {
    if (isReadOnlyMode) return; // 🛑 MD OVERRIDE: Read-only participants cannot trigger jumps or queues
    if (!isPlayingFlow) {
      const jumpTime = Date.now();
      mdSectionStartTimeRef.current = jumpTime;
      handleSelectSectionDirectlyLocally(index);
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: "broadcast",
          event: "lobby_sync",
          payload: { 
            action: "JUMP", 
            trackIndex: currentTrackIndex, 
            sectionIndex: index,
            mdSectionStartTime: jumpTime // ✅ Sync jump epoch
          }
        });
      }
      return;
    }

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;

      const isSameSelectionCancel = queuedSectionIndexRef.current === index && queuedTrackIndexRef.current === currentTrackIndex;
      const targetNextQueueIdx = isSameSelectionCancel ? null : index;
      const targetNextQueueTrackIdx = isSameSelectionCancel ? null : currentTrackIndex;

      setQueuedSectionIndex(targetNextQueueIdx);
      setQueuedTrackIndex(targetNextQueueTrackIdx);

      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: "broadcast",
          event: "lobby_sync",
          payload: { 
            action: "QUEUE", 
            trackIndex: targetNextQueueTrackIdx, 
            sectionIndex: targetNextQueueIdx 
          }
        });
      }
    } else {
      // FIRST TAP WINDOW: Set single click timeout fallback
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        
        // ✅ SURGICAL REFACTOR: Consolidated into one atomic JUMP network payload to kill desync
        playingTrackIndexRef.current = currentTrackIndex;
        setPlayingTrackIndex(currentTrackIndex);
        const targetTrackItem = tracksListRef.current[currentTrackIndex];
        if (targetTrackItem && targetTrackItem.songs) {
          playingSongRef.current = targetTrackItem.songs;
          playingSectionsRef.current = targetTrackItem.custom_structure || [];
        }

        const jumpTime = Date.now();
        mdSectionStartTimeRef.current = jumpTime;
        handleSelectSectionDirectlyLocally(index);

        if (realtimeChannelRef.current) {
          realtimeChannelRef.current.send({
            type: "broadcast",
            event: "lobby_sync",
            payload: { 
              action: "JUMP", 
              trackIndex: currentTrackIndex, // Bundled together
              sectionIndex: index,
              mdSectionStartTime: jumpTime
            }
          });
        }
      }, 250);
    }
  }

  // Next tracker layout utility strings computing layer
  const playbackNextButtonText = useMemo(() => {
    if (!isPlayingFlow) return "";

    if (queuedSectionIndex !== null && queuedTrackIndex !== null) {
      const queuedTrackItem = tracksList[queuedTrackIndex];
      const queuedSongSections = queuedTrackItem?.custom_structure || [];
      const queuedSectionName = queuedSongSections[queuedSectionIndex]?.section_name || "Section";
      
      if (queuedTrackIndex !== playingTrackIndex) {
        return `Next: ${queuedTrackItem?.songs?.title || "Song"} ${queuedSectionName}`;
      }
      return `Next: ${queuedSectionName}`;
    }

    const runningSections = playingSectionsRef.current;
    const nextNaturalSectionIdx = currentSectionIndex + 1;
    if (nextNaturalSectionIdx < runningSections.length) {
      return `Next: ${runningSections[nextNaturalSectionIdx].section_name}`;
    }

    const nextTrackIdx = playingTrackIndex + 1;
    if (nextTrackIdx < tracksList.length) {
      return `Next: ${tracksList[nextTrackIdx].songs?.title || "Next Song"}`;
    }

    return "Next: End";
  }, [isPlayingFlow, queuedSectionIndex, queuedTrackIndex, playingTrackIndex, currentSectionIndex, tracksList]);

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

  function handleModalSectionRemoveItem(idx: number) {
    if (!activeSong || sections.length <= 1) return;
    
    const workingBlocks = sections.filter((_, index) => index !== idx);
    setSections(workingBlocks);
    saveMutatedStructurePayload(workingBlocks);
    handleResetFlowTrigger();
  }

  function handleSongTabNavigationClick(e: React.MouseEvent<HTMLButtonElement>, index: number) {
    handleUserSelectTrackBadge(index);
    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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
  
  const displayedOnlineUsers = useMemo(() => {
    const usersMap = new Map();
    onlineUsers.forEach((user) => { if (user.id) usersMap.set(user.id, user); });
    if (localPresenceUser) { usersMap.set(localPresenceUser.id, localPresenceUser); }
    return Array.from(usersMap.values());
  }, [onlineUsers, localPresenceUser]);


  if (loading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f8f9fa] p-4 text-center select-none">
        <div className="w-full max-w-xs space-y-3">
          <div className="text-[10px] font-black uppercase text-blue-600 tracking-widest animate-pulse">
            Syncing Live Deck...
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-3 text-[10px] font-mono font-bold text-zinc-400 leading-normal shadow-sm">
            Status: {loadingStatus}
          </div>
        </div>
      </div>
    );
  }
  
  

  // Leave ONLY plain variables down here right above the return statement:
  const highlightedTargetSectionName = sections[currentSectionIndex]?.section_name || "FLOW";
  const upcomingTrackItem = tracksList[currentTrackIndex + 1] || null;

  // ✅ SURGICAL ADDITION: Compute live Music Director locks across the room
  const activeMDConnection = onlineUsers.find(u => u.isMD);
  const isReadOnlyMode = activeMDConnection !== undefined && activeMDConnection.id !== localPresenceUser?.id;
  const isCurrentlyMD = localPresenceUser?.isMD === true;

  const handleToggleMusicDirectorMode = () => {
    if (!localPresenceUser) return;

    // Guard against multiple users becoming MD simultaneously
    const alternateMD = onlineUsers.find(u => u.isMD && u.id !== localPresenceUser.id);
    if (alternateMD && !localPresenceUser.isMD) {
      alert(`Access Denied: ${alternateMD.name} is currently driving this setlist as the Music Director.`);
      return;
    }

    const updatedPresencePayload = { ...localPresenceUser, isMD: !localPresenceUser.isMD };
    setLocalPresenceUser(updatedPresencePayload);
    // ✅ SURGICAL FIX: Cache the dynamic presence token update instantly inside the reference array closure
    localPresenceUserRef.current = updatedPresencePayload;

    // Push the updated state immediately over the WebSocket connection thread
    if (realtimeChannelRef.current && isChannelSubscribedRef.current) {
      realtimeChannelRef.current.track(updatedPresencePayload);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-[#f8f9fa] overflow-hidden select-none">
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

      {/* FULL-WIDTH CONSOLE NAVBAR HEADER */}
      <div id="fixed-live-header" className="w-full bg-white border-b border-zinc-200 flex-shrink-0 z-50 shadow-sm px-4 md:px-8 py-3.5 relative overflow-hidden">
        
        {/* ✅ Progress bar structures isolated from static JSX property object constraints to prevent alignment drops */}
        <div 
          ref={backdropProgressRef}
          className="absolute inset-y-0 left-0 bg-blue-500/5 pointer-events-none z-0 origin-left w-full"
        />
        <div 
          ref={accentProgressBarRef}
          className="absolute bottom-0 left-0 h-[3px] bg-blue-600 pointer-events-none z-35 origin-left w-full"
        />

        <div className="max-w-5xl mx-auto flex flex-col gap-2.5 relative">

          {/* ROW 1: CONTROLS & ATTENDANCE TRACK */}
          <div className="relative z-10 flex items-center justify-between gap-2 w-full">
            
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button 
                type="button" 
                onClick={() => router.back()} 
                className="w-7 h-7 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-500 font-black text-xs flex items-center justify-center shrink-0 cursor-pointer"
              >
                ‹
              </button>
              <div className="min-w-0 leading-none space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="bg-zinc-950 text-white font-mono font-black text-[8px] tracking-wider px-1.5 py-0.5 rounded">
                    SUBSCRIBED
                  </span>
                  <span className="bg-blue-50 text-blue-600 font-mono font-black text-[8px] px-1.5 py-0.5 rounded">
                    ⏱{activeSong?.tempo || "--"}
                  </span>
                  <div className="bg-zinc-50 text-zinc-600 rounded border font-mono font-black text-[8px] px-1.5 py-0.5 flex items-center gap-0.5">
                    K:<span className="text-blue-600 font-black">{activeDisplayKey}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <h1 className="text-base font-black tracking-tight text-zinc-950 truncate max-w-[140px] sm:max-w-xs leading-none">
                    {activeSong?.title || "Loading..."}
                  </h1>

                  {/* Presence indicator avatars track */}
                  <div className="flex items-center gap-1">
                    <div className="flex -space-x-1.5 overflow-hidden py-0.5">
                      {displayedOnlineUsers.map((user, idx) => (
                        <div 
                          key={`${user.connectionId || user.id}-${idx}`} 
                          title={user.name} 
                          className="w-5 h-5 rounded-full ring-2 ring-white overflow-hidden shadow-sm shrink-0 select-none bg-zinc-100 flex items-center justify-center relative"
                        >
                          {user.avatar ? (
                            <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className={`w-full h-full ${user.bg || 'bg-blue-600'} text-white font-mono font-black text-[7px] flex items-center justify-center`}>
                              {user.initials}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <span className="text-[9px] font-bold text-zinc-400 ml-1 lowercase">online now</span>
                  </div>
                </div>
              </div>
            </div>

            {/* METRONOME SYSTEM */}
            <div className="flex items-center gap-1 bg-zinc-50 p-1 rounded-lg border border-zinc-200 shadow-inner shrink-0">
              {[1, 2, 3, 4].map((beatNum) => {
                const isByBeatPulsing = isPlayingFlow && currentBeat === beatNum;
                return (
                  <div
                    key={beatNum}
                    className={`w-6 h-6 flex items-center justify-center font-mono font-black text-[10px] rounded border transition-all duration-75 select-none ${
                      isByBeatPulsing
                        ? beatNum === 4
                          ? "bg-[#faba37] text-white border-[#e0a22b]"
                          : "bg-blue-600 text-white border-blue-500"
                        : "bg-white text-zinc-200 border-zinc-100"
                    }`}
                  >
                    {beatNum}
                  </div>
                );
              })}
            </div>

            {/* ACTION CONFIGURATION CONTROLLERS */}
            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(true)}
                className="h-8 w-8 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-600 font-extrabold text-xs flex items-center justify-center shadow-sm cursor-pointer hover:bg-zinc-100"
              >
                ⚙️
              </button>

              <button
                type="button"
                disabled={isReadOnlyMode} // ✅ Prevents read-only users from stopping/starting the deck
                onClick={handleToggleFlowPlaybackState}
                className={`h-8 px-3 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                  isPlayingFlow 
                    ? "bg-purple-600 border-purple-500 text-white ring-2 ring-purple-500/10" 
                    : "bg-blue-600 border-blue-500 text-white shadow-sm"
                }`}
              >
                {isPlayingFlow ? playbackNextButtonText : `▶ ${highlightedTargetSectionName}`}
              </button>
            </div>

          </div>

          {/* ROW 2: TRACKS BAR NAVIGATION */}
          <div className="w-full border-t border-zinc-100 pt-2 flex items-center overflow-x-auto overflow-y-hidden flex-nowrap gap-1.5 scrollbar-none relative z-10 select-none pb-0.5 scroll-smooth">
            {tracksList.map((track, trackIdx) => (
              <button
                key={track.id}
                type="button"
                onClick={(e) => handleSongTabNavigationClick(e, trackIdx)}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 border transition-all cursor-pointer ${
                  currentTrackIndex === trackIdx
                    ? "bg-blue-600 border-blue-500 text-white shadow-sm"
                    : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {trackIdx + 1}. {track.songs?.title || "Song"}{" "}
                <span className="font-mono opacity-50 font-bold ml-0.5">({track.custom_key || track.songs?.original_key})</span>
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* SCROLLABLE LYRIC CANVAS CANVAS */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 md:p-8 pt-4 custom-scrollbar pb-24"
      >
        <div className="max-w-5xl w-full mx-auto space-y-4 md:space-y-6">
          
          {memoizedSongAstTree.map((section, idx) => {
            const isThisSectionActivePlayback = isPlayingFlow && playingTrackIndex === currentTrackIndex && currentSectionIndex === idx;
            const isThisSectionQueuedNext = queuedTrackIndex === currentTrackIndex && queuedSectionIndex === idx;
            const isStagedUnstartedTarget = !isPlayingFlow && currentSectionIndex === idx;
            const centralizedTimingConfig = activeSong?.section_timings?.[section.section_name] || { measures: 4, beats: 0 };

            return (
              <div
                key={section.id}
                ref={(el) => { sectionRefs.current[section.id] = el; }}
                onClick={() => handleSectionInteractiveSelection(idx)}
                className={`bg-white border rounded-xl md:rounded-3xl p-5 md:p-6 shadow-sm transition-all duration-300 relative ${
                  isThisSectionActivePlayback 
                    ? "border-blue-500 ring-4 ring-blue-500/10 scale-[1.001] shadow-md z-10 cursor-pointer" 
                    : isThisSectionQueuedNext
                    ? "border-purple-500 ring-4 ring-purple-500/10 scale-[1.001] shadow-md z-10 cursor-pointer" 
                    : `border-zinc-200 opacity-95 cursor-pointer hover:border-blue-400 hover:bg-zinc-50/30`
                  }`}
                style={isStagedUnstartedTarget && !isThisSectionQueuedNext ? { borderColor: '#fbbf24', boxShadow: '0 0 0 4px rgba(251, 191, 36, 0.1)' } : {}}
              >
                <div className="flex items-center justify-between border-b border-zinc-100/80 pb-2.5 mb-3.5 select-none">
                  <div className="flex items-center gap-2">
                    <span className={`font-black text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                      isThisSectionActivePlayback ? "bg-blue-600 text-white shadow-sm" : isStagedUnstartedTarget ? "bg-amber-500 text-white shadow-sm" : "bg-blue-50 text-blue-600"
                    }`}>
                      {section.section_name}
                    </span>
                    {isStagedUnstartedTarget && !isThisSectionQueuedNext && (
                      <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest animate-pulse"> Staged </span>
                    )}
                    {isThisSectionQueuedNext && (
                      <span className="text-[8px] font-black bg-purple-600 text-white uppercase tracking-widest px-2 py-0.5 rounded shadow-sm"> ⚡ QUEUED NEXT </span>
                    )}
                  </div>
                  
                  <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[9px] font-bold text-zinc-400 shadow-inner">
                      <span>M:</span>
                      <input 
                        type="number" 
                        min={0}
                        disabled={isReadOnlyMode} // ✅ Lock adjustments if read-only
                        value={centralizedTimingConfig.measures} 
                        onChange={e => commitSectionTimingUpdate(section.section_name, "measures", Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-9 bg-transparent text-center font-black text-zinc-700 outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[9px] font-bold text-zinc-400 shadow-inner">
                      <span>B:</span>
                      <input 
                        type="number" 
                        min={0}
                        max={3}
                        disabled={isReadOnlyMode} // ✅ Lock adjustments if read-only
                        value={centralizedTimingConfig.beats} 
                        onChange={e => commitSectionTimingUpdate(section.section_name, "beats", Math.min(3, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                        className="w-9 bg-transparent text-center font-black text-zinc-700 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pl-0.5 select-text selection:bg-blue-50 text-zinc-800 space-y-2">
                  {section.lines.length === 0 ? <div className="h-4" /> : section.lines.map((line: ParsedLineToken, lIdx: number) => (
                    <div 
                      key={lIdx} 
                      style={{ paddingBottom: `${lineSpacing}px` }} 
                      className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-zinc-100/50 last:border-0"
                    >
                      <div className="flex flex-wrap items-end gap-x-2 gap-y-3.5 py-0.5 leading-none flex-1">
                        {line.words.map((wordObj, wIdx) => (
                          <div key={wIdx} className="flex flex-col items-start min-h-[36px] justify-end">
                            {showChords && wordObj.chords.length > 0 && (
                              <div className="text-[11px] font-mono font-black text-blue-600 tracking-tight pb-0.5 select-none">
                                {wordObj.chords.map((ch, cIdx) => {
                                  const finalChord = runtimeSemitoneDelta !== 0 ? transposeBracketContent(ch, runtimeSemitoneDelta) : ch;
                                  return <span key={cIdx} className="mr-0.5 bg-blue-50/60 px-0.5 rounded border border-blue-100/40">{finalChord}</span>;
                                })}
                              </div>
                            )}
                            <div 
                              style={{ fontSize: `${lyricsFontSize}px` }}
                              className="font-sans font-bold text-zinc-950 tracking-tight transition-all duration-100 uppercase"
                            >
                              {wordObj.word || " "}
                            </div>
                          </div>
                        ))}
                      </div>
                      {line.comment && (
                        <div style={{ fontFamily: "'Nothing You Could Do', cursive" }} className="text-[14px] text-zinc-400 tracking-wide select-none whitespace-nowrap sm:pl-4 self-end">
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
            <div className="pt-2 animate-in fade-in duration-300">
              <div 
                onClick={() => handleUserSelectTrackBadge(currentTrackIndex + 1)}
                className="w-full bg-zinc-50 border border-dashed border-zinc-300/80 hover:bg-zinc-100/50 rounded-2xl p-5 text-center cursor-pointer transition-all select-none group"
              >
                <span className="text-[8px] font-black tracking-widest text-zinc-400 uppercase block mb-0.5">Up Next</span>
                <h4 className="font-black text-xs text-zinc-600 group-hover:text-blue-600 transition-colors">
                  ⏩ {upcomingTrackItem.songs.title} <span className="font-normal opacity-50 font-mono text-[10px]">({upcomingTrackItem.custom_key || upcomingTrackItem.songs.original_key})</span>
                </h4>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FLOATING CENTERED SYNC BACK CONTROLLER */}
      {showSyncBack && (
        <button
          type="button"
          onClick={handleScrollToActiveSectionAnchor}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100000] bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-full shadow-2xl flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-3 duration-200 cursor-pointer active:scale-95 transition-all border border-blue-500/20"
        >
          🎯 Sync Back
        </button>
      )}

      {/* DYNAMIC ACCESS PREFERENCES MODAL CONSOLE */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[150000] flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
          <div className="bg-[#f8f9fa] border border-zinc-200 rounded-[2.5rem] shadow-2xl p-6 max-w-sm w-full space-y-5 animate-in zoom-in-95 duration-100 text-left relative">
            <button 
              type="button" 
              onClick={() => setIsSettingsModalOpen(false)} 
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white border text-zinc-400 text-xs font-bold flex items-center justify-center shadow-sm cursor-pointer hover:bg-zinc-50"
            >
              ✕
            </button>
            
            <div className="space-y-0.5">
              <h3 className="text-lg font-black text-zinc-900 tracking-tight">Console Preferences</h3>
              <p className="text-[11px] font-bold text-zinc-400">Tweak user accessibility and dynamic track constraints.</p>
            </div>
            {/* Preferences Option 0: Music Director Master Control Switch */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Performance Authorization</label>
              <button
                type="button"
                onClick={handleToggleMusicDirectorMode}
                className={`w-full py-2.5 px-4 rounded-xl font-black text-[10px] uppercase border transition-all cursor-pointer flex justify-between items-center ${
                  isCurrentlyMD 
                    ? "bg-purple-600 text-white border-purple-500 shadow-md" 
                    : activeMDConnection 
                    ? "bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed opacity-60"
                    : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span>{isCurrentlyMD ? "👑 You are Music Director" : activeMDConnection ? `🔒 MD Mode Active (${activeMDConnection.name})` : "🎧 Take Music Director Control"}</span>
                <span className="font-mono opacity-60">{isCurrentlyMD ? "ON" : "OFF"}</span>
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Chord Notation Display</label>
              <div className="grid grid-cols-2 gap-1 bg-white border p-1 rounded-xl shadow-inner">
                <button
                  type="button"
                  onClick={() => setShowChords(true)}
                  className={`py-2 text-center rounded-lg font-black text-[10px] uppercase transition-all cursor-pointer ${
                    showChords ? "bg-zinc-900 text-white shadow-md" : "text-zinc-500 hover:text-zinc-800 bg-zinc-50/20"
                  }`}
                >
                  👁️ Show Chords
                </button>
                <button
                  type="button"
                  onClick={() => setShowChords(false)}
                  className={`py-2 text-center rounded-lg font-black text-[10px] uppercase transition-all cursor-pointer ${
                    !showChords ? "bg-zinc-900 text-white shadow-md" : "text-zinc-500 hover:text-zinc-800 bg-zinc-50/20"
                  }`}
                >
                  🙈 Hide Chords
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Lyrics Font Display Size</label>
              <div className="grid grid-cols-4 gap-1 bg-white border p-1 rounded-xl shadow-inner">
                {([
                  { label: "Default", size: 16 },
                  { label: "Medium", size: 24 },
                  { label: "Large", size: 32 },
                  { label: "Huge", size: 40 }
                ]).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setLyricsFontSize(preset.size)}
                    className={`py-2 text-center rounded-lg font-black text-[10px] uppercase transition-all cursor-pointer ${
                      lyricsFontSize === preset.size ? "bg-blue-600 text-white shadow-md" : "text-zinc-500 hover:text-zinc-800 bg-zinc-50/20"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Line Spacing Padding</label>
              <div className="grid grid-cols-3 gap-1 bg-white border p-1 rounded-xl shadow-inner">
                {([
                  { label: "Default", spacing: 16 },
                  { label: "Medium", spacing: 24 },
                  { label: "Large", spacing: 32 }
                ]).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setLineSpacing(preset.spacing)}
                    className={`py-2 text-center rounded-lg font-black text-[10px] uppercase transition-all cursor-pointer ${
                      lineSpacing === preset.spacing ? "bg-blue-600 text-white shadow-md" : "text-zinc-500 hover:text-zinc-800 bg-zinc-50/20"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block">Arrangement & Transposition</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isPlayingFlow}
                  onClick={() => { setIsSettingsModalOpen(false); handleOpenTransposerModal(); }}
                  className="py-3 bg-white hover:bg-zinc-50 text-zinc-700 border rounded-xl font-extrabold text-xs text-center shadow-sm flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  🎹 Transpose Key
                </button>
                <button
                  type="button"
                  disabled={isPlayingFlow}
                  onClick={() => { setIsSettingsModalOpen(false); setIsStructureModalOpen(true); }}
                  className="py-3 bg-white hover:bg-zinc-50 text-zinc-700 border rounded-xl font-extrabold text-xs text-center shadow-sm flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  🧱 Structure
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button 
                type="button" 
                onClick={() => setIsSettingsModalOpen(false)} 
                className="w-full py-3 bg-zinc-950 text-white font-black text-xs uppercase tracking-widest rounded-xl text-center shadow-md cursor-pointer"
              >
                Close Parameters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPONENT DRAG-AND-DROP ARRANGEMENTS INTERFACE OVERLAY */}
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
                        isBeingDragged ? "opacity-30 bg-zinc-100 border-zinc-300" : isHoveredTarget ? "border-blue-500 bg-blue-50/50 scale-[1.01] ring-2 ring-blue-400/20 shadow-md" : "bg-zinc-50 hover:bg-zinc-100 border-zinc-200 shadow-inner"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs text-zinc-400 font-mono font-bold shrink-0">#{sIdx + 1}</span>
                        <span className="text-xs font-black uppercase tracking-wider text-zinc-700 truncate">{sec.section_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => handleModalSectionRemoveItem(sIdx)} className="text-[10px] font-bold text-zinc-400 hover:text-red-500 px-1 cursor-pointer transition-colors">✕ Remove</button>
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
              <button type="button" onClick={() => setIsStructureModalOpen(false)} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest rounded-xl shadow-md transition-colors cursor-pointer text-xs">Close & Lock Workspace</button>
            </div>
          </div>
        </div>
      )}

      {/* REHEARSAL KEY TRANSPOSER MODAL BLOCK */}
      {isTransposerOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-100 select-none">
          <form onSubmit={handleCommitTranspositionSave} className="bg-[#f8f9fa] border border-zinc-200 rounded-[2.5rem] shadow-2xl max-w-xl w-full p-7 px-8 space-y-6 animate-in zoom-in-95 duration-150 relative text-left">
            <button type="button" onClick={() => setIsTransposerOpen(false)} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white hover:bg-zinc-100 border text-zinc-400 text-xs font-bold flex items-center justify-center shadow-sm cursor-pointer transition-colors">✕</button>
            <div className="space-y-1"><h3 className="text-2xl font-black text-zinc-900 tracking-tight">Setlist Transposer</h3><p className="text-xs font-black text-blue-500">Original Song Base {activeSong?.original_key || "--"}</p></div>
            <div className="grid grid-cols-7 gap-2 bg-white p-2 rounded-2xl border shadow-inner">{BASE_LETTER_ROOTS.map((letter) => <button key={letter} type="button" onClick={() => setModalRoot(letter)} className={`aspect-square rounded-xl text-center text-sm font-black transition-all flex items-center justify-center cursor-pointer ${modalRoot === letter ? "bg-blue-600 text-white shadow-md scale-105" : "bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100"}`}>{letter}</button>)}</div>
            <div className="grid grid-cols-2 divide-x bg-white rounded-2xl border overflow-hidden shadow-inner h-12"><button type="button" onClick={() => setModalAccidental(modalAccidental === "b" ? "" : "b")} className={`text-center text-base font-black transition-colors flex items-center justify-center h-full cursor-pointer ${modalAccidental === "b" ? "bg-blue-50/80 text-blue-600 font-extrabold" : "text-zinc-600 hover:bg-zinc-50/50"}`}>♭</button><button type="button" onClick={() => setModalAccidental(modalAccidental === "#" ? "" : "#")} className={`text-center text-sm font-black transition-colors flex items-center justify-center h-full cursor-pointer ${modalAccidental === "#" ? "bg-blue-50/80 text-blue-600 font-extrabold" : "text-zinc-600 hover:bg-zinc-50/50"}`}>#</button></div>
            <div className="pt-2"><button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-md text-center cursor-pointer">Apply Rehearsal Override</button></div>
          </form>
        </div>
      )}

    </div>
  );
}