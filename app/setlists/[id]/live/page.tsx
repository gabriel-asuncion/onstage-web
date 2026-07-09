"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../../utils/supabase/client";
import { useEngine } from "../../../context/EngineContext"; 
import GlobalLoader from '../../../../components/GlobalLoader';
import { useTimesync } from '../../../../hooks/useTimesync';

import { CompiledSectionToken, CompiledBeatMap, BeatNode, ArrangementSection, SongRecord, ParsedLineToken, ParsedWordToken } from "./types/setlist";
import { CHROMATIC_SCALE, transposeBracketContent, normalizeKeyNote } from "./utils/music-math";
import { normalizeSectionNameToAudioFile } from "./utils/setlist-helpers"; // ✅ SURGICAL FIX: Restored missing import

import { useWakeLock } from "./hooks/useWakeLock";
import { useWebAudioEngine } from "./hooks/useWebAudioEngine";
import { useLocalPreferences } from "./hooks/useLocalPreferences";
import { useSetlistData } from "./hooks/useSetlistData";
import { useLivePresence } from "./hooks/useLivePresence";
import { useYouTubeSync } from "./hooks/useYouTubeSync";
import { useHardwareClock } from "./hooks/useHardwareClock";

import { LiveHeader } from "./components/LiveHeader";
import { SimplifiedStackView } from "./components/SimplifiedStackView";
import { StandardSheetView } from "./components/StandardSheetView";
import { ScrubberOverlay } from "./components/ScrubberOverlay";
import { SettingsModal } from "./components/SettingsModal";
import { StructureEditorModal } from "./components/StructureEditorModal";
import { AddBlockModal } from "./components/AddBlockModal";
import { TransposerModal } from "./components/TransposerModal";
import { MdLockModal } from "./components/MdLockModal";

const supabase = createClient();

export default function SetlistPerformanceRoomPage() {
  const router = useRouter();
  const params = useParams();
  const setlistId = params?.id as string;

  const { simulatedUserId, simulatedRole } = useEngine();
  const { isSynced, getGlobalTime } = useTimesync();

  useWakeLock();
  const { initAudioContext, fetchAndDecodeAudio, playZeroLatencyAudio, playGuideCue, getAudioContext } = useWebAudioEngine();
  
  const {
    lyricsFontSize, setLyricsFontSize, showChords, setShowChords, chordFormat, setChordFormat,
    isSimplifiedMode, setIsSimplifiedMode, lineSpacing, setLineSpacing,
    isMetronomeSoundEnabled, setIsMetronomeSoundEnabled, isMetronomeSoundEnabledRef,
    isDoubleMetronomeEnabled, setIsDoubleMetronomeEnabled, isDoubleMetronomeEnabledRef,
    localClickVolume, setLocalClickVolume, localClickVolumeRef,
    youtubeVolume, setYoutubeVolume, youtubeVolumeRef,
    isYoutubeSyncEnabled, setIsYoutubeSyncEnabled // ✅ Restored
  } = useLocalPreferences();

  const {
    loading, loadingStatus, setlistName, tracksList, setTracksList, tracksListRef,
    currentTrackIndex, setCurrentTrackIndex, currentTrackIndexRef,
    activeSong, setActiveSong, activeSongRef,
    sections, setSections, sectionsRef,
    activeDisplayKey, setActiveDisplayKey,
    mountTargetSetlistTrackIndex
  } = useSetlistData(setlistId, supabase);

  const {
    onlineUsers, setOnlineUsers, localPresenceUser, setLocalPresenceUser, localPresenceUserRef,
    isAdmin, isChannelSubscribedRef, realtimeChannelRef, handleToggleMusicDirectorMode
  } = useLivePresence(supabase, simulatedUserId, simulatedRole);

  const [audioLatencyOffsetMs, setAudioLatencyOffsetMs] = useState<number>(0);
  const [currentDriftMs, setCurrentDriftMs] = useState<number | null>(null);
  const [isTestingSync, setIsTestingSync] = useState<boolean>(false);
  const [testVisualBeat, setTestVisualBeat] = useState<number>(1);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const countdownValueRef = useRef<number | null>(null);

  const [currentMeasureLength, setCurrentMeasureLength] = useState<number>(4);
  const lastVisualMeasureLengthRef = useRef<number>(4);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false); 
  const [isMdLockModalOpen, setIsMdLockModalOpen] = useState<boolean>(false);
  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState<boolean>(false);
  const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
  const [draggedSectionIndex, setDraggedSectionIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSavingStructure, setIsSavingStructure] = useState(false);
  const [isTransposerOpen, setIsTransposerOpen] = useState(false);
  const [modalRoot, setModalRoot] = useState("G");
  const [modalAccidental, setModalAccidental] = useState<"" | "#" | "b">("");

  const [isPlayingFlow, setIsPlayingFlow] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [currentBeat, setCurrentBeat] = useState<number>(1);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const [showSyncBack, setShowSyncBack] = useState<boolean>(false);

  const [playingTrackIndex, setPlayingTrackIndex] = useState<number>(0);
  const [queuedTrackIndex, setQueuedTrackIndex] = useState<number | null>(null);
  const [queuedSectionIndex, setQueuedSectionIndex] = useState<number | null>(null);

  const lastAudioBeatRef = useRef<number>(1);
  const lastVisualBeatRef = useRef<number>(1);
  const hasPlayedCueRef = useRef<boolean>(false);
  const isAutoScrollingRef = useRef<boolean>(false);
  const playingTrackIndexRef = useRef<number>(0);
  const playingSongRef = useRef<SongRecord | null>(null);
  const playingSectionsRef = useRef<ArrangementSection[]>([]);
  const queuedTrackIndexRef = useRef<number | null>(null);
  const queuedSectionIndexRef = useRef<number | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingQuantizedJumpRef = useRef<{ trackIndex: number; sectionIndex: number; jumpTime: number } | null>(null);
  const isYtBackingTrackStartRef = useRef<boolean>(false);
  const activeLineIndexRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const currentSectionIndexRef = useRef(0);
  const sectionStartTimeRef = useRef<number>(0);
  const pauseOffsetMsRef = useRef<number>(0);
  const totalBeatsRef = useRef<number>(0);
  const lastBeatRef = useRef<number>(1);
  const animationFrameRef = useRef<number | null>(null);
  const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const audioContextStartTimeRef = useRef<number | null>(null);
  const astTreeRef = useRef<CompiledSectionToken[]>([]);
  const mdSectionStartTimeRef = useRef<number | null>(null);

  const backdropProgressRef = useRef<HTMLDivElement | null>(null);
  const accentProgressBarRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const simplifiedProgressBarRef = useRef<HTMLDivElement | null>(null);
  
  const metronomeRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const scheduledClicksRef = useRef<{ source: AudioBufferSourceNode, audioTime: number }[]>([]);

  useEffect(() => { playingTrackIndexRef.current = playingTrackIndex; }, [playingTrackIndex]);
  useEffect(() => { queuedTrackIndexRef.current = queuedTrackIndex; }, [queuedTrackIndex]);
  useEffect(() => { queuedSectionIndexRef.current = queuedSectionIndex; }, [queuedSectionIndex]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      fetchAndDecodeAudio("/sound_files/metronome_blip_1.wav", "metronome_1");
      fetchAndDecodeAudio("/sound_files/metronome_blip_2.wav", "metronome_2");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || tracksList.length === 0) return;
    
    // ✅ SURGICAL FIX: Restored the preloader so audio callouts actually exist in RAM!
    const uniqueFiles = new Set<string>();
    tracksList.forEach(track => {
      const structure = track.custom_structure || [];
      structure.forEach(section => {
        const fileName = normalizeSectionNameToAudioFile(section.section_name);
        if (fileName) uniqueFiles.add(fileName);
      });
    });
    uniqueFiles.forEach(fileName => {
      fetchAndDecodeAudio(`/sound_files/${fileName}.wav`, fileName);
    });
  }, [tracksList]);

  // ✅ FIX: Global Audio Unlocker. Browsers mute followers until they interact with the page!
  useEffect(() => {
    const unlockAudio = () => {
      initAudioContext();
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
    };
    document.addEventListener("click", unlockAudio);
    document.addEventListener("touchstart", unlockAudio);
    return () => {
      document.removeEventListener("click", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  // ✅ Auto-scroll Logic (restored and correctly wired)
  useEffect(() => {
    if (isPlayingFlow && !showSyncBack) {
      const activeLineId = `line-${currentSectionIndex}-${activeLineIndex}`;
      const targetLine = document.getElementById(activeLineId);
      if (targetLine) {
        if ((window as any)._autoScrollTimeout) clearTimeout((window as any)._autoScrollTimeout);
        isAutoScrollingRef.current = true;
        targetLine.scrollIntoView({ behavior: "smooth", block: "center" });
        (window as any)._autoScrollTimeout = setTimeout(() => { isAutoScrollingRef.current = false; }, 550); 
      }
    }
  }, [activeLineIndex, currentSectionIndex, isPlayingFlow, showSyncBack]);

  useEffect(() => {
    let reqId: number;
    const testAudioRef = { current: 1 };
    const testVisualRef = { current: 1 };
    
    if (isTestingSync) {
      initAudioContext();
      const startTime = performance.now();
      const tick = (timestamp: number) => {
        const elapsed = timestamp - startTime;
        const audioBeat = Math.floor(elapsed / 500) % 4 + 1; 
        if (audioBeat !== testAudioRef.current) {
           testAudioRef.current = audioBeat;
           triggerMetronomeSound(audioBeat);
           if (isDoubleMetronomeEnabledRef.current) {
             const audioCtx = getAudioContext();
             if (audioCtx) triggerMetronomeSound(2, audioCtx.currentTime + 0.25);
           }
        }
        const visElapsed = elapsed - audioLatencyOffsetMs;
        const visBeat = Math.floor(Math.max(0, visElapsed) / 500) % 4 + 1;
        if (visBeat !== testVisualRef.current) {
           testVisualRef.current = visBeat;
           setTestVisualBeat(visBeat);
        }
        reqId = requestAnimationFrame(tick);
      };
      reqId = requestAnimationFrame(tick);
    } else {
       setTestVisualBeat(1);
    }
    return () => { if (reqId) cancelAnimationFrame(reqId); };
  }, [isTestingSync, audioLatencyOffsetMs, isMetronomeSoundEnabled]);

  useEffect(() => { if (!isSettingsModalOpen) setIsTestingSync(false); }, [isSettingsModalOpen]);

  useEffect(() => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: isPlayingFlow }));
    return () => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: false })); };
  }, [isPlayingFlow]);

  const updateMetronomeUI = (activeBeat: number, isPlaying: boolean, measureLength: number = 4) => {
    metronomeRefs.current.forEach((el, index) => {
      if (!el) return;
      const beatNum = index + 1;
      if (beatNum > measureLength) { el.style.display = 'none'; return; } 
      else { el.style.display = 'flex'; }
      el.className = "w-6 h-6 items-center justify-center font-mono font-black text-[10px] rounded border transition-all duration-75 select-none";
      if (isPlaying && activeBeat === beatNum) {
        if (beatNum === measureLength) el.classList.add("bg-[#faba37]", "text-white", "border-[#e0a22b]");
        else el.classList.add("bg-blue-600", "text-white", "border-blue-500");
      } else {
        el.classList.add("bg-white", "text-zinc-200", "border-zinc-100");
      }
    });
  };

  const triggerMetronomeSound = (beatNum: number, time: number = 0) => {
    if (!isMetronomeSoundEnabledRef.current) return;
    const targetKey = beatNum === 1 ? "metronome_1" : "metronome_2";
    const source = playZeroLatencyAudio(targetKey, localClickVolumeRef.current, time);
    if (source) {
      scheduledClicksRef.current.push({ source, audioTime: time });
      source.onended = () => {
        const idx = scheduledClicksRef.current.findIndex(s => s.source === source);
        if (idx > -1) scheduledClicksRef.current.splice(idx, 1);
      };
    }
  };

  function executeStartSequence(useCountdown: boolean, forcedStartTimestamp?: number, isYtSource: boolean = false) {
    isYtBackingTrackStartRef.current = isYtSource; 
    playingTrackIndexRef.current = currentTrackIndexRef.current;
    setPlayingTrackIndex(currentTrackIndexRef.current);
    playingSongRef.current = activeSongRef.current;
    playingSectionsRef.current = sectionsRef.current;
    isPlayingRef.current = true;
    setIsPlayingFlow(true);

    const delayMs = useCountdown ? 3150 : 150; 
    const startTimestamp = forcedStartTimestamp ?? (getGlobalTime() + delayMs);
    mdSectionStartTimeRef.current = startTimestamp;

    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.send({
        type: "broadcast", event: "lobby_sync",
        payload: { action: "START", trackIndex: currentTrackIndexRef.current, sectionIndex: currentSectionIndexRef.current, mdSectionStartTime: startTimestamp, isYtSource: isYtSource }
      });
    }
  }

  const beatMapRef = useRef<CompiledBeatMap>({ totalBeats: 0, nodes: [], sectionStartBeats: [] });
  
  const {
    youtubeVideoId, isYtBuffering, setIsYtBuffering,
    ytPlayerRef, isYtPlayerReadyRef, ytSyncPendingRef
  } = useYouTubeSync({
    activeSong, activeSongRef, beatMapRef, currentSectionIndexRef,
    getGlobalTime, executeStartSequence, youtubeVolumeRef, isYoutubeSyncEnabled // ✅ Restored
  });

  useHardwareClock({
    isPlayingFlow, isPlayingRef, activeSongRef, playingSongRef, sectionsRef, playingSectionsRef,
    currentSectionIndexRef, setCurrentSectionIndex, beatMapRef, astTreeRef, mdSectionStartTimeRef,
    audioLatencyOffsetMs, isYtBackingTrackStartRef, countdownValueRef, setCountdownValue,
    backdropProgressRef, accentProgressBarRef, simplifiedProgressBarRef, hasPlayedCueRef, playGuideCue,
    queuedSectionIndexRef, queuedTrackIndexRef, audioContextStartTimeRef, getAudioContext, triggerMetronomeSound,
    isDoubleMetronomeEnabledRef, lastAudioBeatRef, lastVisualBeatRef, lastBeatRef, lastVisualMeasureLengthRef, setCurrentMeasureLength,
    pendingQuantizedJumpRef, getGlobalTime, executeJumpNow, localPresenceUserRef, realtimeChannelRef,
    updateMetronomeUI, activeLineIndexRef, setActiveLineIndex, handleAdvanceToNextSetlistTrack,
    sectionStartTimeRef, pauseOffsetMsRef, animationFrameRef, playingTrackIndexRef
  });

  useEffect(() => {
    if (!setlistId || !localPresenceUser) return; 
    isChannelSubscribedRef.current = false;
    
    const lobbyChannel = supabase.channel(`setlist_lobby_${setlistId}`, {
      config: { broadcast: { ack: false, self: true }, presence: { key: localPresenceUser.connectionId } }
    });

    lobbyChannel
      .on("presence", { event: "sync" }, () => {
        const presenceState = lobbyChannel.presenceState();
        setOnlineUsers(Object.values(presenceState).flat() as any[]);
        if (isPlayingRef.current && localPresenceUserRef.current?.isMD) {
          lobbyChannel.send({ 
            type: "broadcast", 
            event: "lobby_sync", 
            payload: { 
              action: "START", 
              trackIndex: currentTrackIndexRef.current, 
              sectionIndex: currentSectionIndexRef.current, 
              mdSectionStartTime: mdSectionStartTimeRef.current || Date.now(),
              isYtSource: isYtBackingTrackStartRef.current // ✅ SURGICAL FIX: Tell late joiners the YT track is running
            } 
          });
        }
      })
      .on("broadcast", { event: "lobby_sync" }, ({ payload }) => {
        if (payload.action === "START") {
          const targetTrackIdx = payload.trackIndex !== undefined ? payload.trackIndex : currentTrackIndex;
          isPlayingRef.current = true; setIsPlayingFlow(true);
          isYtBackingTrackStartRef.current = payload.isYtSource || false;
          
          // ✅ SURGICAL FIX: Followers also respect the 0:00 pre-roll rule!
          if (payload.isYtSource && ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
            let targetVideoTime = 0;
            if (payload.sectionIndex > 0) {
              const beatSpeedSecs = 60 / (activeSongRef.current?.tempo || 75);
              targetVideoTime = ((activeSongRef.current?.youtube_sync_offset_ms || 0) / 1000) + ((beatMapRef.current.sectionStartBeats[payload.sectionIndex] || 0) * beatSpeedSecs);
            }
            try {
              if (Math.abs((ytPlayerRef.current.getCurrentTime() || 0) - targetVideoTime) > 0.5) ytPlayerRef.current.seekTo(targetVideoTime, true);
              ytPlayerRef.current.playVideo();
            } catch (e) {}
          }
          
          executeJumpNow(targetTrackIdx, payload.sectionIndex, payload.mdSectionStartTime, true);
        }
        else if (payload.action === "STOP") { executeLocalResetSequence(); } 
        else if (payload.action === "JUMP") {
          const jumpTime = payload.mdSectionStartTime || getGlobalTime();
          const timeUntilJump = jumpTime - getGlobalTime();
          if (isPlayingRef.current && timeUntilJump > 50) {
            pendingQuantizedJumpRef.current = { trackIndex: payload.trackIndex ?? currentTrackIndexRef.current, sectionIndex: payload.sectionIndex, jumpTime };
            setQueuedTrackIndex(payload.trackIndex ?? currentTrackIndexRef.current);
            setQueuedSectionIndex(payload.sectionIndex);
          } else {
            executeJumpNow(payload.trackIndex ?? currentTrackIndexRef.current, payload.sectionIndex, jumpTime);
          }
        }
        else if (payload.action === "TRACK_CHANGE") { mountTargetSetlistTrackIndex(payload.trackIndex); }
        else if (payload.action === "QUEUE") { setQueuedTrackIndex(payload.trackIndex); setQueuedSectionIndex(payload.sectionIndex); }
        else if (payload.action === "HEARTBEAT" && !localPresenceUserRef.current?.isMD) {
          if (audioContextStartTimeRef.current !== null && mdSectionStartTimeRef.current !== null && isPlayingRef.current) {
            const { mdAbsoluteBeat, mdGlobalBeatTime, mdSectionIndex } = payload;
            
            // ✅ SURGICAL FIX: Only accept heartbeats if the Follower is in the exact same section as the MD!
            if (mdSectionIndex === currentSectionIndexRef.current) {
              const beatSpeedMs = (60 / (activeSongRef.current?.tempo || 75)) * 1000;
              const sectionStartAbsoluteBeat = beatMapRef.current.sectionStartBeats[currentSectionIndexRef.current] || 0;
              const localBeatCount = mdAbsoluteBeat - sectionStartAbsoluteBeat;
              
              const mdImpliedStartMs = mdGlobalBeatTime - (localBeatCount * beatSpeedMs);
              const driftMs = mdSectionStartTimeRef.current - mdImpliedStartMs;
              
              if (Math.abs(driftMs) > 15) {
                mdSectionStartTimeRef.current = mdImpliedStartMs;
                const audioCtx = getAudioContext();
                if (audioCtx) {
                   const timeUntilStartSecs = (mdImpliedStartMs - getGlobalTime()) / 1000;
                   const theoreticalSongStartOffset = sectionStartAbsoluteBeat * (beatSpeedMs / 1000); 
                   audioContextStartTimeRef.current = (audioCtx.currentTime + timeUntilStartSecs) - theoreticalSongStartOffset;
                }
              }
            }
          }
        }
        else if (payload.action === "MD_TAKEOVER") {
          if (localPresenceUserRef.current?.isMD && localPresenceUserRef.current.id !== payload.newMdId) {
            const downgradedPayload = { ...localPresenceUserRef.current, isMD: false };
            setLocalPresenceUser(downgradedPayload);
            localPresenceUserRef.current = downgradedPayload;
            if (isChannelSubscribedRef.current) lobbyChannel.track(downgradedPayload);
            executeLocalResetSequence();
          }
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") { isChannelSubscribedRef.current = true; lobbyChannel.track(localPresenceUser); }
      });

    realtimeChannelRef.current = lobbyChannel;
    return () => { if (lobbyChannel) supabase.removeChannel(lobbyChannel); };
  }, [setlistId, localPresenceUser]);

  function executeJumpNow(targetTrackIdx: number, targetSectionIdx: number, jumpTime: number, isInitialStart: boolean = false) {
    if (targetTrackIdx !== undefined && targetTrackIdx !== playingTrackIndexRef.current) mountTargetSetlistTrackIndex(targetTrackIdx);
    
    // ✅ FIX: Followers must populate the 'playing' variables, otherwise their timeline crashes!
    playingTrackIndexRef.current = targetTrackIdx !== undefined ? targetTrackIdx : currentTrackIndexRef.current;
    setPlayingTrackIndex(playingTrackIndexRef.current);
    playingSongRef.current = activeSongRef.current;
    playingSectionsRef.current = sectionsRef.current;

    if (jumpTime) {
      mdSectionStartTimeRef.current = jumpTime;
      initAudioContext(); 
      const audioCtx = getAudioContext();
      if (audioCtx) {
        const timeUntilJumpMs = jumpTime - getGlobalTime();
        const absoluteHardwareTimeAtJump = audioCtx.currentTime + (timeUntilJumpMs / 1000);
        const targetAbsoluteBeat = beatMapRef.current.sectionStartBeats[targetSectionIdx] || 0;
        const beatSpeedSecs = 60 / (activeSongRef.current?.tempo || 75);
        const theoreticalSongStartOffset = targetAbsoluteBeat * beatSpeedSecs;
        audioContextStartTimeRef.current = absoluteHardwareTimeAtJump - theoreticalSongStartOffset;

        if (!isInitialStart && isYtBackingTrackStartRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
          const ytOffsetSecs = (activeSongRef.current?.youtube_sync_offset_ms || 0) / 1000;
          try { ytPlayerRef.current.seekTo(ytOffsetSecs + theoreticalSongStartOffset, true); } catch(e) {}
        }
        if (timeUntilJumpMs >= 3000 && !isYtBackingTrackStartRef.current) {
          triggerMetronomeSound(2, absoluteHardwareTimeAtJump - 3); triggerMetronomeSound(2, absoluteHardwareTimeAtJump - 2); triggerMetronomeSound(1, absoluteHardwareTimeAtJump - 1); 
        }
      }
    }
    currentSectionIndexRef.current = targetSectionIdx; setCurrentSectionIndex(targetSectionIdx);
    lastAudioBeatRef.current = beatMapRef.current.sectionStartBeats[targetSectionIdx] || 0; 
    lastBeatRef.current = 0; lastVisualBeatRef.current = 0;
    setQueuedTrackIndex(null); setQueuedSectionIndex(null); pendingQuantizedJumpRef.current = null;
    scheduledClicksRef.current.forEach(click => { try { click.source.stop(); click.source.disconnect(); } catch(e) {} });
    scheduledClicksRef.current = []; hasPlayedCueRef.current = false; 
    
    // ✅ FIX: Force followers to resume auto-scrolling when the MD jumps!
    setShowSyncBack(false);

    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
    if (isPlayingRef.current) {
      const apparentLatency = getGlobalTime() - jumpTime;
      sectionStartTimeRef.current = Math.abs(apparentLatency) < 2000 ? performance.now() - apparentLatency : performance.now();
    }
  }

  function executeLocalResetSequence() {
    isPlayingRef.current = false; setIsPlayingFlow(false); hasPlayedCueRef.current = false;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    scheduledClicksRef.current.forEach(click => { try { click.source.stop(); click.source.disconnect(); } catch(e) {} });
    scheduledClicksRef.current = [];
    if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') ytPlayerRef.current.pauseVideo();
    currentSectionIndexRef.current = 0; lastBeatRef.current = 0; activeLineIndexRef.current = 0;
    setCurrentSectionIndex(0); updateMetronomeUI(1, false); setActiveLineIndex(0);
    setQueuedTrackIndex(null); setQueuedSectionIndex(null); setCurrentDriftMs(null);
    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
  }

  function handleUserSelectTrackBadge(trackIdx: number) {
    mountTargetSetlistTrackIndex(trackIdx);
    if (!isPlayingFlow && localPresenceUser?.isMD && realtimeChannelRef.current) {
      realtimeChannelRef.current.send({ type: "broadcast", event: "lobby_sync", payload: { action: "TRACK_CHANGE", trackIndex: trackIdx } });
    }
  }

  function handleAdvanceToNextSetlistTrack() {
    const nextTrackIndex = playingTrackIndexRef.current + 1; 
    if (nextTrackIndex < tracksListRef.current.length) {
      mountTargetSetlistTrackIndex(nextTrackIndex);
      if (localPresenceUserRef.current?.isMD && realtimeChannelRef.current) realtimeChannelRef.current.send({ type: "broadcast", event: "lobby_sync", payload: { action: "TRACK_CHANGE", trackIndex: nextTrackIndex } });
      setTimeout(() => { isPlayingRef.current = true; setIsPlayingFlow(true); if (localPresenceUserRef.current?.isMD) mdSectionStartTimeRef.current = getGlobalTime(); }, 120);
    } else {
      handleResetFlowTrigger();
    }
  }

  function handleToggleFlowPlaybackState() {
    initAudioContext();
    if (!localPresenceUser?.isMD) { setIsMdLockModalOpen(true); return; }
    if (isPlayingFlow) {
      if (playClickTimeoutRef.current) { clearTimeout(playClickTimeoutRef.current); playClickTimeoutRef.current = null; }
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') ytPlayerRef.current.pauseVideo();
      handleResetFlowTrigger();
    } else {
      if (sections.length === 0 || !activeSong) return;
      const triggerYoutubeSync = () => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
          setIsYtBuffering(true); ytSyncPendingRef.current = true;
          
          // ✅ SURGICAL FIX: If starting from the very beginning, play video from 0:00 (Pre-roll). 
          // Otherwise, jump directly to the offset + section time.
          let targetVideoTime = 0;
          if (currentSectionIndexRef.current > 0) {
            const beatSpeedSecs = 60 / (activeSongRef.current?.tempo || 75);
            targetVideoTime = ((activeSongRef.current?.youtube_sync_offset_ms || 0) / 1000) + ((beatMapRef.current.sectionStartBeats[currentSectionIndexRef.current] || 0) * beatSpeedSecs);
          }
          
          if (Math.abs((ytPlayerRef.current.getCurrentTime() || 0) - targetVideoTime) > 0.5) ytPlayerRef.current.seekTo(targetVideoTime, true);
          ytPlayerRef.current.playVideo();
        } else { executeStartSequence(true); }
      };

      if (playClickTimeoutRef.current) {
        clearTimeout(playClickTimeoutRef.current); playClickTimeoutRef.current = null;
        if (isYoutubeSyncEnabled && youtubeVideoId) triggerYoutubeSync(); else executeStartSequence(true); 
      } else {
        playClickTimeoutRef.current = setTimeout(() => {
          playClickTimeoutRef.current = null;
          if (isYoutubeSyncEnabled && youtubeVideoId) triggerYoutubeSync(); else executeStartSequence(false);
        }, 250);
      }
    }
  }

  function handleResetFlowTrigger() {
    executeLocalResetSequence();
    if (localPresenceUser?.isMD && realtimeChannelRef.current) realtimeChannelRef.current.send({ type: "broadcast", event: "lobby_sync", payload: { action: "STOP" } });
  }

  function handleSectionInteractiveSelection(index: number) {
    if (!localPresenceUser?.isMD && (onlineUsers.find(u => u.isMD && u.id !== localPresenceUser?.id) !== undefined)) return; 
    if (!isPlayingFlow) {
      const jumpTime = getGlobalTime() + 150; executeJumpNow(currentTrackIndex, index, jumpTime);
      if (realtimeChannelRef.current) realtimeChannelRef.current.send({ type: "broadcast", event: "lobby_sync", payload: { action: "JUMP", trackIndex: currentTrackIndex, sectionIndex: index, mdSectionStartTime: jumpTime } });
      return;
    }
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current); clickTimeoutRef.current = null;
      setQueuedTrackIndex(currentTrackIndex); setQueuedSectionIndex(index); pendingQuantizedJumpRef.current = null;
      if (realtimeChannelRef.current) realtimeChannelRef.current.send({ type: "broadcast", event: "lobby_sync", payload: { action: "QUEUE", trackIndex: currentTrackIndex, sectionIndex: index } });
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        let jumpTime = getGlobalTime() + 150;
        if (mdSectionStartTimeRef.current && activeSongRef.current && isPlayingRef.current) {
          const measureDurationMs = (60 / (activeSongRef.current.tempo || 75)) * 4000; 
          jumpTime = getGlobalTime() + (measureDurationMs - ((getGlobalTime() - mdSectionStartTimeRef.current) % measureDurationMs));
          pendingQuantizedJumpRef.current = { trackIndex: currentTrackIndex, sectionIndex: index, jumpTime };
          const audioCtx = getAudioContext();
          if (audioCtx) {
            const audioJumpTime = audioCtx.currentTime + ((jumpTime - getGlobalTime()) / 1000);
            scheduledClicksRef.current.forEach(click => { if (click.audioTime >= audioJumpTime - 0.05) { try { click.source.stop(); click.source.disconnect(); } catch(e) {} } });
            scheduledClicksRef.current = scheduledClicksRef.current.filter(click => click.audioTime < audioJumpTime - 0.05);
          }
          setQueuedTrackIndex(currentTrackIndex); setQueuedSectionIndex(index);
          if (sectionsRef.current[index]) playGuideCue(sectionsRef.current[index].section_name);
          hasPlayedCueRef.current = true; 
        } else { executeJumpNow(currentTrackIndex, index, jumpTime); }
        if (realtimeChannelRef.current) realtimeChannelRef.current.send({ type: "broadcast", event: "lobby_sync", payload: { action: "JUMP", trackIndex: currentTrackIndex, sectionIndex: index, mdSectionStartTime: jumpTime } });
      }, 250);
    }
  }

  const runtimeSemitoneDelta = useMemo(() => {
    if (!activeSong || !activeDisplayKey) return 0;
    const isMinorSong = activeSong.original_key.endsWith("m");
    const oldIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(isMinorSong ? activeSong.original_key.slice(0, -1) : activeSong.original_key));
    const newIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(isMinorSong ? activeDisplayKey.slice(0, -1) : activeDisplayKey));
    if (oldIdx === -1 || newIdx === -1) return 0;
    return (newIdx - oldIdx + 12) % 12;
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
          const chordRegex = /\[([^\]]+)\]/g; const chordsList: string[] = []; let match;
          while ((match = chordRegex.exec(chunk)) !== null) chordsList.push(runtimeSemitoneDelta !== 0 ? transposeBracketContent(match[1], runtimeSemitoneDelta) : match[1]);
          return { chords: chordsList, word: chunk.replace(/\[[^\]]+\]/g, "") };
        });
        return { words: wordsTokens, comment: commentText };
      });
      return { id: section.id, section_name: section.section_name, lines: linesArray };
    });
  }, [sections, runtimeSemitoneDelta]);

  beatMapRef.current = useMemo(() => {
    const map: BeatNode[] = []; const sectionStartBeats: number[] = []; let currentAbsoluteBeat = 0;
    if (!activeSong || sections.length === 0) return { totalBeats: 0, nodes: [], sectionStartBeats: [] };

    sections.forEach((section, sIdx) => {
      sectionStartBeats.push(currentAbsoluteBeat);
      const timings = activeSong.section_timings?.[section.section_name] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
      const sectionMultiplier = (timings.repeats || 0) + 1;
      const headBeats = (timings.head_m || 0) * 4;
      const tailBeats = (timings.tail_m || 0) * 4;
      
      let totalCoreBeats = ((timings.measures || 0) * 4) + (timings.beats || 0);
      let baseLoopBeats = totalCoreBeats / sectionMultiplier;
      
      const parsedLinesCount = memoizedSongAstTree[sIdx]?.lines.length || 1;
      let hasLineOverrides = false; 
      const lineBeatsMap: number[] = [];
      
      if (timings.line_timings && Object.keys(timings.line_timings).length > 0) {
        let sumBaseLoopBeats = 0;
        for (let i = 0; i < parsedLinesCount; i++) {
          const t = timings.line_timings[String(i)] || { measures: 0, beats: 0 };
          const lineMult = (t.repeats || 0) + 1; 
          const lineBeats = ((t.measures * 4) + (t.beats || 0)) * lineMult;
          lineBeatsMap.push(lineBeats); 
          sumBaseLoopBeats += lineBeats;
        }
        if (sumBaseLoopBeats > 0) { 
          hasLineOverrides = true; 
          baseLoopBeats = sumBaseLoopBeats; 
        }
      }

      const stampBeats = (totalBeatsToStamp: number) => {
          let remaining = totalBeatsToStamp;
          while (remaining > 0) { 
            const mLen = remaining >= 4 ? 4 : remaining; 
            for (let b = 1; b <= mLen; b++) { map.push({ absoluteBeatIndex: currentAbsoluteBeat, measureBeatIndex: b, measureLength: mLen, sectionIndex: sIdx, isDownbeat: b === 1 }); currentAbsoluteBeat++; }
            remaining -= mLen; 
          }
      };

      stampBeats(headBeats);
      for (let r = 0; r < sectionMultiplier; r++) { 
        if (hasLineOverrides) { lineBeatsMap.forEach(b => stampBeats(b)); } 
        else { stampBeats(baseLoopBeats); } 
      }
      stampBeats(tailBeats);
    });

    return { totalBeats: currentAbsoluteBeat, nodes: map, sectionStartBeats };
  }, [activeSong, sections, memoizedSongAstTree]);
  useEffect(() => { astTreeRef.current = memoizedSongAstTree; }, [memoizedSongAstTree]);

  const displayedOnlineUsers = useMemo(() => {
    const usersMap = new Map();
    onlineUsers.forEach((user) => { if (user.id) usersMap.set(user.id, user); });
    if (localPresenceUser) usersMap.set(localPresenceUser.id, localPresenceUser);
    return Array.from(usersMap.values());
  }, [onlineUsers, localPresenceUser]);

  const getSectionDurationString = (sectionName: string, sectionIdx?: number) => {
    const timings = activeSong?.section_timings?.[sectionName] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
    const sectionMultiplier = (timings.repeats || 0) + 1;
    
    let totalCoreBeats = ((timings.measures || 0) * 4) + (timings.beats || 0);

    if (sectionIdx !== undefined && timings.line_timings && memoizedSongAstTree[sectionIdx]) {
        let calcBaseLoop = 0;
        for (let i = 0; i < memoizedSongAstTree[sectionIdx].lines.length; i++) { 
           const t = timings.line_timings[String(i)] || { measures: 0, beats: 0 };
           const lineMult = (t.repeats || 0) + 1; 
           calcBaseLoop += ((t.measures * 4) + (t.beats || 0)) * lineMult;
        }
        if (calcBaseLoop > 0) {
          totalCoreBeats = calcBaseLoop * sectionMultiplier;
        }
    }
    
    let totalBeats = totalCoreBeats + ((timings.head_m || 0) * 4) + ((timings.tail_m || 0) * 4);
    if (totalBeats <= 0) totalBeats = 16; 
    
    const totalSeconds = Math.round((totalBeats * (60000 / (activeSong?.tempo || 75))) / 1000);
    return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
  };

  if (loading) return <GlobalLoader message="LOADING SETLIST..." />;

  return (
    <div className="absolute inset-0 flex flex-col bg-[#f8f9fa] overflow-hidden select-none">
      
      <LiveHeader 
        activeSong={activeSong} activeDisplayKey={activeDisplayKey} currentDriftMs={currentDriftMs}
        localPresenceUser={localPresenceUser} isPlayingFlow={isPlayingFlow} currentBeat={currentBeat}
        currentMeasureLength={currentMeasureLength} metronomeRefs={metronomeRefs} setIsSettingsModalOpen={setIsSettingsModalOpen}
        handleToggleFlowPlaybackState={handleToggleFlowPlaybackState} displayedOnlineUsers={displayedOnlineUsers}
        tracksList={tracksList} currentTrackIndex={currentTrackIndex} handleUserSelectTrackBadge={handleUserSelectTrackBadge}
        backdropProgressRef={backdropProgressRef} accentProgressBarRef={accentProgressBarRef}
      />

      {isSimplifiedMode ? (
        <SimplifiedStackView 
          memoizedSongAstTree={memoizedSongAstTree} currentSectionIndex={currentSectionIndex} queuedSectionIndex={queuedSectionIndex}
          queuedTrackIndex={queuedTrackIndex} currentTrackIndex={currentTrackIndex} activeLineIndex={activeLineIndex}
          chordFormat={chordFormat} activeDisplayKey={activeDisplayKey} getSectionDurationString={getSectionDurationString}
          simplifiedProgressBarRef={simplifiedProgressBarRef} upcomingTrackItem={tracksList[currentTrackIndex + 1] || null}
        />
      ) : (
        <StandardSheetView 
          memoizedSongAstTree={memoizedSongAstTree} isPlayingFlow={isPlayingFlow} playingTrackIndex={playingTrackIndex}
          currentTrackIndex={currentTrackIndex} currentSectionIndex={currentSectionIndex} queuedTrackIndex={queuedTrackIndex}
          queuedSectionIndex={queuedSectionIndex} getSectionDurationString={getSectionDurationString} handleSectionInteractiveSelection={handleSectionInteractiveSelection}
          sectionRefs={sectionRefs} activeLineIndex={activeLineIndex} showChords={showChords} lyricsFontSize={lyricsFontSize}
          lineSpacing={lineSpacing} chordFormat={chordFormat} activeDisplayKey={activeDisplayKey} upcomingTrackItem={tracksList[currentTrackIndex + 1] || null}
          handleUserSelectTrackBadge={handleUserSelectTrackBadge} scrollContainerRef={scrollContainerRef}
          isAutoScrollingRef={isAutoScrollingRef} setShowSyncBack={setShowSyncBack} // ✅ Wired
        />
      )}

      {showSyncBack && (
        <button type="button" onClick={() => {
          if (currentTrackIndex !== playingTrackIndexRef.current) mountTargetSetlistTrackIndex(playingTrackIndexRef.current);
          else {
            const targetElement = isPlayingRef.current ? document.getElementById(`line-${currentSectionIndex}-${activeLineIndex}`) || sectionRefs.current[sections[currentSectionIndex]?.id] : sectionRefs.current[sections[currentSectionIndex]?.id];
            if (targetElement) { isAutoScrollingRef.current = true; targetElement.scrollIntoView({ behavior: "smooth", block: "center" }); setShowSyncBack(false); setTimeout(() => { isAutoScrollingRef.current = false; }, 550); }
          }
        }} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100000] bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-full shadow-2xl flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-3 duration-200 cursor-pointer active:scale-95 transition-all border border-blue-500/20">🎯 Sync Back</button>
      )}

      <ScrubberOverlay 
        sections={sections} currentSectionIndex={currentSectionIndex} queuedTrackIndex={queuedTrackIndex} currentTrackIndex={currentTrackIndex}
        queuedSectionIndex={queuedSectionIndex} isPlayingFlow={isPlayingFlow} sectionRefs={sectionRefs} isAutoScrollingRef={isAutoScrollingRef} setShowSyncBack={setShowSyncBack}
      />

      <SettingsModal 
        isSettingsModalOpen={isSettingsModalOpen} setIsSettingsModalOpen={setIsSettingsModalOpen} localPresenceUser={localPresenceUser} onlineUsers={onlineUsers} handleToggleMusicDirectorMode={handleToggleMusicDirectorMode}
        showChords={showChords} setShowChords={setShowChords} chordFormat={chordFormat} setChordFormat={setChordFormat} isSimplifiedMode={isSimplifiedMode} setIsSimplifiedMode={setIsSimplifiedMode}
        lineSpacing={lineSpacing} setLineSpacing={setLineSpacing} lyricsFontSize={lyricsFontSize} setLyricsFontSize={setLyricsFontSize}
        isMetronomeSoundEnabled={isMetronomeSoundEnabled} setIsMetronomeSoundEnabled={setIsMetronomeSoundEnabled} isDoubleMetronomeEnabled={isDoubleMetronomeEnabled} setIsDoubleMetronomeEnabled={setIsDoubleMetronomeEnabled}
        localClickVolume={localClickVolume} setLocalClickVolume={setLocalClickVolume} audioLatencyOffsetMs={audioLatencyOffsetMs} setAudioLatencyOffsetMs={setAudioLatencyOffsetMs}
        isTestingSync={isTestingSync} setIsTestingSync={setIsTestingSync} testVisualBeat={testVisualBeat} activeSong={activeSong}
        isYoutubeSyncEnabled={isYoutubeSyncEnabled} setIsYoutubeSyncEnabled={setIsYoutubeSyncEnabled} youtubeVolume={youtubeVolume} setYoutubeVolume={setYoutubeVolume}
        isAdmin={isAdmin} isPlayingFlow={isPlayingFlow} router={router} handleOpenTransposerModal={() => setIsTransposerOpen(true)} setIsStructureModalOpen={setIsStructureModalOpen}
      />

      <StructureEditorModal 
        isStructureModalOpen={isStructureModalOpen} setIsStructureModalOpen={setIsStructureModalOpen} isSavingStructure={isSavingStructure} sections={sections}
        draggedSectionIndex={draggedSectionIndex} setDraggedSectionIndex={setDraggedSectionIndex} dragOverIndex={dragOverIndex} setDragOverIndex={setDragOverIndex}
        handleModalSectionDrop={(idx) => {
          if (draggedSectionIndex === null || draggedSectionIndex === idx || !activeSong) return;
          const workingBlocks = [...sections]; workingBlocks.splice(idx, 0, workingBlocks.splice(draggedSectionIndex, 1)[0]);
          setSections(workingBlocks); setDragOverIndex(null); setDraggedSectionIndex(null);
          setIsSavingStructure(true); supabase.from("setlist_songs").update({ custom_structure: workingBlocks as any }).eq("id", tracksList[currentTrackIndex]?.id).then(() => { setTracksList(prev => prev.map((t, i) => i === currentTrackIndex ? { ...t, custom_structure: workingBlocks } : t)); setIsSavingStructure(false); handleResetFlowTrigger(); });
        }}
        handleModalSectionRemoveItem={(idx) => {
          if (!activeSong || sections.length <= 1) return;
          const workingBlocks = sections.filter((_, i) => i !== idx); setSections(workingBlocks);
          setIsSavingStructure(true); supabase.from("setlist_songs").update({ custom_structure: workingBlocks as any }).eq("id", tracksList[currentTrackIndex]?.id).then(() => { setTracksList(prev => prev.map((t, i) => i === currentTrackIndex ? { ...t, custom_structure: workingBlocks } : t)); setIsSavingStructure(false); handleResetFlowTrigger(); });
        }}
        setIsAddBlockModalOpen={setIsAddBlockModalOpen}
      />

      <AddBlockModal 
        isAddBlockModalOpen={isAddBlockModalOpen} setIsAddBlockModalOpen={setIsAddBlockModalOpen} availableSectionNames={[]}
        handleModalAppendNewSectionItem={async (name) => {
          if (!activeSong) return;
          let sectionContent = sections.find(s => s.section_name === name)?.content;
          if (!sectionContent || sectionContent.trim() === "") { const { data } = await supabase.from("song_sections").select("content").eq("song_id", activeSong.id).eq("section_name", name).maybeSingle(); if (data?.content) sectionContent = data.content; }
          const workingBlocks = [...sections, { id: `local-${Date.now()}`, section_name: name, content: sectionContent || " " }];
          setSections(workingBlocks); setIsSavingStructure(true); supabase.from("setlist_songs").update({ custom_structure: workingBlocks as any }).eq("id", tracksList[currentTrackIndex]?.id).then(() => { setTracksList(prev => prev.map((t, i) => i === currentTrackIndex ? { ...t, custom_structure: workingBlocks } : t)); setIsSavingStructure(false); handleResetFlowTrigger(); });
        }}
      />

      <TransposerModal 
        isTransposerOpen={isTransposerOpen} setIsTransposerOpen={setIsTransposerOpen} activeSong={activeSong}
        modalRoot={modalRoot} setModalRoot={setModalRoot} modalAccidental={modalAccidental as ""|"#"|"b"} setModalAccidental={setModalAccidental}
        handleCommitTranspositionSave={(e) => {
          e.preventDefault(); if (!activeSong) return;
          const formatted = `${modalRoot}${modalAccidental}${activeSong.original_key.endsWith("m") ? "m" : ""}`;
          setActiveDisplayKey(formatted); setIsTransposerOpen(false);
          supabase.from("setlist_songs").update({ custom_key: formatted }).eq("id", tracksList[currentTrackIndex]?.id);
          setTracksList(prev => prev.map((t, idx) => idx === currentTrackIndex ? { ...t, custom_key: formatted } : t)); handleResetFlowTrigger();
        }}
      />

      <MdLockModal 
        isMdLockModalOpen={isMdLockModalOpen} setIsMdLockModalOpen={setIsMdLockModalOpen} 
        activeMDConnection={onlineUsers.find(u => u.isMD && u.id !== localPresenceUser?.id)} 
        initAudioContext={initAudioContext} // ✅ Wired
      />

      {countdownValue !== null && (
        <div className="fixed inset-0 z-[400000] bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-100 select-none touch-none">
          <span className="text-blue-500 font-black tracking-widest uppercase mb-4 text-xl md:text-2xl animate-pulse">Pre-Warming Sync Engine</span>
          <span className="text-[150px] md:text-[250px] font-black text-white leading-none tracking-tighter drop-shadow-2xl">{countdownValue}</span>
        </div>
      )}
      <div className="absolute opacity-0 pointer-events-none w-[1px] h-[1px] overflow-hidden -z-50"><div id="yt-live-player-container"></div></div>
      {isYtBuffering && (
        <div className="fixed inset-0 z-[400000] bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-100 select-none touch-none">
          <span className="text-red-500 font-black tracking-widest uppercase mb-4 text-xl md:text-2xl animate-pulse">Buffering Backing Track</span>
          <span className="text-[100px] md:text-[150px] font-black text-white leading-none tracking-tighter drop-shadow-2xl">∞</span>
        </div>
      )}

    </div>
  );
}