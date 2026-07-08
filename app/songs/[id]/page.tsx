"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";
import { useEngine } from "../../context/EngineContext";
import GlobalLoader from "../../../components/GlobalLoader";

// =======================================================
// INTERFACES
// =======================================================
interface SongRecord {
  id: string;
  title: string;
  artist: string;
  original_key: string;
  tempo: number;
  youtube_url?: string;             // ✅ SURGICAL ADDITION
  youtube_sync_offset_ms?: number;  // ✅ SURGICAL ADDITION
  section_timings?: {
    [sectionName: string]: { 
      measures: number; 
      beats: number;
      repeats?: number;
      head_m?: number;
      tail_m?: number;
    };
  };
}

interface ArrangementSection {
  id: string;
  section_name: string;
  content: string;
  sequence_order: number;
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

// =======================================================
// CONSTANTS & HELPERS
// =======================================================
const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BASE_LETTER_ROOTS = ["C", "D", "E", "F", "G", "A", "B"];

const normalizeKeyNote = (note: string): string => {
  const flatMap: { [key: string]: string } = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
  return flatMap[note] || note;
};

const getSectionBadgeStyle = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('verse')) return "border-cyan-200 text-cyan-500 bg-cyan-50/30";
  if (lower.includes('chorus')) return "border-orange-200 text-orange-500 bg-orange-50/30";
  if (lower.includes('bridge')) return "border-purple-200 text-purple-500 bg-purple-50/30";
  if (lower.includes('outro') || lower.includes('tag')) return "border-emerald-200 text-emerald-500 bg-emerald-50/30";
  if (lower.includes('pre')) return "border-blue-200 text-blue-500 bg-blue-50/30";
  return "border-zinc-200 text-zinc-500 bg-zinc-50/30"; // Interludes, Instrumentals, etc.
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

const getSectionAbbreviation = (name: string): string => {
  if (!name) return "";
  const lower = name.toLowerCase();
  
  if (lower.includes('verse')) {
    const match = lower.match(/\d+/);
    return match ? `V${match[0]}` : 'V';
  }
  if (lower.includes('pre')) return 'Pr';
  if (lower.includes('post')) return 'Po';
  if (lower.includes('chorus')) {
    const match = lower.match(/\d+/);
    return match ? `C${match[0]}` : 'C';
  }
  if (lower.includes('bridge')) return 'Br';
  if (lower.includes('intro')) return 'In';
  if (lower.includes('outro')) return 'Ou';
  if (lower.includes('tag')) return 'Tg';
  if (lower.includes('inst')) return 'In';
  if (lower.includes('ad lib')) return 'AL';
  
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
};

// =======================================================
// WEB AUDIO ENGINE & CUES
// =======================================================
const normalizeSectionNameToAudioFile = (rawSectionName: string): string | null => {
  if (!rawSectionName) return null;
  let cleanName = rawSectionName.trim();
  const lowerName = cleanName.toLowerCase();
  
  if (lowerName.includes("pre")) return "Pre Chorus";
  if (lowerName.includes("post")) return "Post Chorus";
  if (lowerName.includes("chorus")) return "Chorus";
  if (lowerName.includes("bridge")) return "Bridge";
  if (lowerName.includes("intro")) return "Intro";
  if (lowerName.includes("outro")) return "Outro";
  if (lowerName.includes("refrain")) return "Refrain";
  if (lowerName.includes("tag")) return "Tag"; 
  if (lowerName.includes("ad lib")) return "Ad Lib";
  if (lowerName.includes("interlude")) return "Interlude";
  if (lowerName.includes("instrumental") || lowerName.includes("inst")) return "Instrumental";
  
  const verseMatch = lowerName.match(/verse\s*(\d+)/);
  if (verseMatch) return `Verse ${verseMatch[1]}`;
  return null; 
};

let globalAudioContext: AudioContext | null = null;
const audioBufferCache: Record<string, AudioBuffer> = {};

const initAudioContext = () => {
  if (typeof window !== "undefined" && !globalAudioContext) {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (globalAudioContext && globalAudioContext.state === 'suspended') {
    globalAudioContext.resume();
  }
};

const fetchAndDecodeAudio = async (url: string, key: string) => {
  if (audioBufferCache[key]) return;
  initAudioContext();
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    if (globalAudioContext) {
      const audioBuffer = await globalAudioContext.decodeAudioData(arrayBuffer);
      audioBufferCache[key] = audioBuffer;
    }
  } catch (err) {
    console.warn(`Failed to decode audio: ${url}`);
  }
};



const playZeroLatencyAudio = (key: string, volume: number = 1.0, time: number = 0) => {
  if (!globalAudioContext || !audioBufferCache[key]) return;
  const source = globalAudioContext.createBufferSource();
  source.buffer = audioBufferCache[key];
  const gainNode = globalAudioContext.createGain();
  gainNode.gain.value = volume;
  source.connect(gainNode);
  gainNode.connect(globalAudioContext.destination);
  source.start(time); 
};

const playGuideCue = (rawSectionName: string) => {
  if (!rawSectionName) return;
  const cleanName = normalizeSectionNameToAudioFile(rawSectionName);
  if (cleanName) playZeroLatencyAudio(cleanName, 0.85);
};

// =======================================================
// MAIN COMPONENT
// =======================================================
export default function MasterSongProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const songId = params?.id as string;
  
  const { simulatedRole } = useEngine();

  const [loading, setLoading] = useState(true);
  const [song, setSong] = useState<SongRecord | null>(null);
  const [originalSections, setOriginalSections] = useState<ArrangementSection[]>([]);
  const [localSections, setLocalSections] = useState<ArrangementSection[]>([]);
  const [sections, setSections] = useState<ArrangementSection[]>([]);
  const [activeDisplayKey, setActiveDisplayKey] = useState<string>("G");

  const [activeSettingsPane, setActiveSettingsPane] = useState<"main" | "structure">("main");
  const [isAddingSection, setIsAddingSection] = useState(false);
  
  // Custom Workspace Preferences Control States
  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false);
  const [showChords, setShowChords] = useState(true);
  const [chordFormat, setChordFormat] = useState<"key" | "numbers">("key"); // ✅ NEW: Chord Format
  const [lyricsFontSize, setLyricsFontSize] = useState<"default" | "medium" | "large" | "huge">("default");
  const [lineSpacing, setLineSpacing] = useState<"default" | "medium" | "large">("default");

  // Transposer Selection Modal States
  const [isTransposerOpen, setIsTransposerOpen] = useState(false);
  const [modalRoot, setModalRoot] = useState("G");
  const [modalAccidental, setModalAccidental] = useState<"" | "#" | "b">("");

  // Admin & Live Parity States
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPlayingFlow, setIsPlayingFlow] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

  // Scrubber & UI Refs
  const [isScrubberActive, setIsScrubberActive] = useState(false);
  const [scrubberHoverIndex, setScrubberHoverIndex] = useState<number | null>(null);
  const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Independent Hardware Engine Refs
  const isPlayingRef = useRef(false);
  const currentSectionIndexRef = useRef(0);
  const sectionStartTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  
  // Audio & Progress Refs
  const hasPlayedCueRef = useRef<boolean>(false);
  const backdropProgressRef = useRef<HTMLDivElement>(null);
  const accentProgressBarRef = useRef<HTMLDivElement>(null);

  // Sync Simulator Role to Admin State
  useEffect(() => {
    if (simulatedRole === "admin") setIsAdmin(true);
    else if (simulatedRole === "member") setIsAdmin(false);
  }, [simulatedRole]);

  useEffect(() => {
    if (!isPrefsModalOpen) {
      setTimeout(() => {
        setActiveSettingsPane("main");
        setIsAddingSection(false);
      }, 200); // Wait for fade-out animation
    }
  }, [isPrefsModalOpen]);

  async function loadMasterSongProfile() {
    try {
      setLoading(true);
      
      if (simulatedRole === "admin") {
        setIsAdmin(true);
      } else {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", authData.user.id)
            .maybeSingle();
          
          
          if (profile?.role === "admin") setIsAdmin(true);
        }
      }

      const { data: songData, error: songErr } = await supabase
        .from("songs")
        .select("*")
        .eq("id", songId)
        .maybeSingle();

      if (songErr || !songData) {
        console.error("Song item fetch exception:", songErr);
        return;
      }

      setSong(songData as SongRecord);
      setActiveDisplayKey(songData.original_key || "G");

      const { data: sectionsData } = await supabase
        .from("song_sections")
        .select("*")
        .eq("song_id", songId)
        .order("sequence_order", { ascending: true });

      // ✅ SURGICAL FIX: Populate both states
      setOriginalSections(sectionsData || []);
      setLocalSections(sectionsData || []);

      setSections(sectionsData || []);
    } catch (err) {
      console.error("Profile pipeline loading failure:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (songId) loadMasterSongProfile();
  }, [songId]);

  // Preload Audio Cues & Metronome for this specific song
  useEffect(() => {
    if (typeof window === "undefined" || sections.length === 0) return;
    
    // ✅ SURGICAL ADDITION: Preload the click track into hardware cache
    fetchAndDecodeAudio('/sound_files/metronome_1.wav', 'metronome_1');
    fetchAndDecodeAudio('/sound_files/metronome_2.wav', 'metronome_2');

    const uniqueRequiredFiles = new Set<string>();
    sections.forEach(section => {
      const fileName = normalizeSectionNameToAudioFile(section.section_name);
      if (fileName) uniqueRequiredFiles.add(fileName);
    });
    uniqueRequiredFiles.forEach(fileName => {
      fetchAndDecodeAudio(`/sound_files/${fileName}.wav`, fileName);
    });
  }, [sections]);

  // =======================================================
  // HARDWARE TOUCH SCRUBBER ENGINE
  // =======================================================
  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsScrubberActive(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleScrubberPointerMove(e);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 && e.pointerType === "mouse") {
      setIsScrubberActive(false);
      return;
    }
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const indexStr = element?.getAttribute("data-scrubber-index");
    if (indexStr !== null && indexStr !== undefined) {
      setScrubberHoverIndex(parseInt(indexStr, 10));
    }
  };

  const handleScrubberPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsScrubberActive(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    if (scrubberHoverIndex !== null) {
      const targetSection = memoizedSongAstTree[scrubberHoverIndex];
      if (targetSection) {
        currentSectionIndexRef.current = scrubberHoverIndex;
        setCurrentSectionIndex(scrubberHoverIndex);
        sectionStartTimeRef.current = performance.now();

        const targetElement = sectionRefs.current[targetSection.id];
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      setScrubberHoverIndex(null);
    }
  };

  // =======================================================
  // DATA PARSERS & ENGINES
  // =======================================================
  const runtimeSemitoneDelta = useMemo(() => {
    if (!song || !activeDisplayKey) return 0;
    const isMinorSong = song.original_key.endsWith("m");
    
    const oldRootNote = isMinorSong ? song.original_key.slice(0, -1) : song.original_key;
    const newRootNote = isMinorSong ? activeDisplayKey.slice(0, -1) : activeDisplayKey;

    const oldChromaticIndex = CHROMATIC_SCALE.indexOf(normalizeKeyNote(oldRootNote));
    const newChromaticIndex = CHROMATIC_SCALE.indexOf(normalizeKeyNote(newRootNote));
    
    if (oldChromaticIndex === -1 || newChromaticIndex === -1) return 0;
    return (newChromaticIndex - oldChromaticIndex + 12) % 12;
  }, [song, activeDisplayKey]);

  const memoizedSongAstTree = useMemo(() => {
    return localSections.map((section): CompiledSectionToken => {
      const rawText = section.content || "";
      if (!rawText.trim()) {
        return { 
          id: section.id, 
          section_name: section.section_name, 
          lines: []
        };
      }

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

      return { 
        id: section.id, 
        section_name: section.section_name, 
        lines: linesArray
      };
    });
  }, [localSections]);

  // =======================================================
  // DECOUPLED LOCAL HARDWARE PRACTICE ENGINE
  // =======================================================
  
  // =======================================================
  // ✅ SURGICAL REPLACEMENT: THE ZERO-LATENCY HARDWARE SCHEDULER
  // =======================================================
  
  function executeStartSequence(useCountdown: boolean, forcedStartTimestamp?: number, isYtSource: boolean = false) {
    isYtBackingTrackStartRef.current = isYtSource;
    currentSectionIndexRef.current = currentSectionIndex;
    lastAudioBeatRef.current = beatMapRef.current.sectionStartBeats[currentSectionIndex] || 0;
    
    isPlayingRef.current = true;
    setIsPlayingFlow(true);
    hasPlayedCueRef.current = false;
    
    const delayMs = useCountdown ? 3150 : 150; 
    sectionStartTimeRef.current = forcedStartTimestamp ?? (getGlobalTime() + delayMs);
  }

  function executeStopSequence() {
    isPlayingRef.current = false;
    setIsPlayingFlow(false);
    hasPlayedCueRef.current = false;
    setQueuedSectionIndex(null);
    pendingQuantizedJumpRef.current = null;
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = `scaleX(0)`;
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = `scaleX(0)`;

    if (lastHighlightedSectionRef.current !== null && activeLineIndexRef.current !== null) {
      const prevEl = document.getElementById(`line-${lastHighlightedSectionRef.current}-${activeLineIndexRef.current}`);
      if (prevEl) prevEl.classList.remove('bg-blue-50/50', 'border-blue-500', 'pl-3');
    }
    activeLineIndexRef.current = null;
    lastHighlightedSectionRef.current = null;
    
    scheduledClicksRef.current.forEach(click => {
      try { click.source.stop(); click.source.disconnect(); } catch(e) {}
    });
    scheduledClicksRef.current = [];
    
    if (isYtPlayerReadyRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
      try { ytPlayerRef.current.pauseVideo(); } catch(e) {}
    }
  }

  const handleTogglePlayState = () => {
    initAudioContext();
    if (isPlayingFlow) {
      executeStopSequence();
    } else {
      if (!song || memoizedSongAstTree.length === 0) return;
      if (isYoutubeSyncEnabled && song.youtube_url) {
        if (isYtPlayerReadyRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
          setIsYtBuffering(true);
          ytSyncPendingRef.current = true;
          try { ytPlayerRef.current.seekTo(0); ytPlayerRef.current.playVideo(); } catch(e) {}
        } else {
          executeStartSequence(true);
        }
      } else {
        executeStartSequence(true);
      }
    }
  };

  useEffect(() => {
    if (!isPlayingFlow || !song || memoizedSongAstTree.length === 0) return;

    const clockExecutionTick = () => {
      if (!isPlayingRef.current) return;
      
      const elapsedMs = getGlobalTime() - sectionStartTimeRef.current;
      
      // 1. Visual Countdown Engine
      if (elapsedMs < -500 && !isYtBackingTrackStartRef.current) {
        const secondsLeft = Math.ceil(Math.abs(elapsedMs) / 1000);
        if (secondsLeft <= 3 && secondsLeft > 0) {
          if (countdownValueRef.current !== secondsLeft) {
            countdownValueRef.current = secondsLeft;
            setCountdownValue(secondsLeft);
          }
        }
        animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
        return; 
      } else if (elapsedMs < 0) {
        if (countdownValueRef.current !== null) {
          countdownValueRef.current = null;
          setCountdownValue(null);
        }
        animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
        return;
      }

      if (countdownValueRef.current !== null) {
        countdownValueRef.current = null;
        setCountdownValue(null);
      }

      const beatSpeedSecs = 60 / (song.tempo || 75);
      const beatSpeedMs = beatSpeedSecs * 1000;
      
      // 2. Hardware Metronome Lookahead
      if (globalAudioContext) {
        const currentAudioTime = globalAudioContext.currentTime;
        const lookaheadSecs = 0.2; 
        
        let theoreticalSongStartOffset = beatMapRef.current.sectionStartBeats[currentSectionIndexRef.current] * beatSpeedSecs;
        let hardwareGridAnchor = (sectionStartTimeRef.current - getGlobalTime()) / 1000 + currentAudioTime;
        let nextBeatTime = hardwareGridAnchor + (lastAudioBeatRef.current * beatSpeedSecs);

        while (nextBeatTime < currentAudioTime + lookaheadSecs) {
          if (pendingQuantizedJumpRef.current) {
            const timeUntilBeatSecs = nextBeatTime - currentAudioTime;
            const exactGlobalBeatTime = getGlobalTime() + (timeUntilBeatSecs * 1000);
            if (exactGlobalBeatTime >= pendingQuantizedJumpRef.current.jumpTime - 10) break;
          }

          if (lastAudioBeatRef.current < beatMapRef.current.nodes.length) {
            const beatNode = beatMapRef.current.nodes[lastAudioBeatRef.current];
            const pulse = beatNode.isDownbeat ? 1 : 2;
            
            // ✅ SURGICAL FIX: Clean Metronome scheduling
            if (isMetronomeEnabledRef.current) {
              initAudioContext();
              triggerMetronomeSound(pulse, nextBeatTime);
              
              if (isDoubleMetronomeRef.current) {
                // Schedule the 8th note exactly halfway to the next beat
                triggerMetronomeSound(2, nextBeatTime + (beatSpeedSecs / 2)); 
              }
            }
          }
          lastAudioBeatRef.current++;
          lastAudioBeatRef.current++;
          nextBeatTime = hardwareGridAnchor + (lastAudioBeatRef.current * beatSpeedSecs);
        }
      }

      // 3. UI Progress Bar & Quantized Jumps
      const activeIdx = currentSectionIndexRef.current;
      const sectionStartAbsoluteBeat = beatMapRef.current.sectionStartBeats[activeIdx] || 0;
      let nextSectionStartBeat = beatMapRef.current.sectionStartBeats[activeIdx + 1];
      if (nextSectionStartBeat === undefined) nextSectionStartBeat = beatMapRef.current.nodes.length;
      
      const totalSectionBeats = nextSectionStartBeat - sectionStartAbsoluteBeat;
      const sectionDurationMs = totalSectionBeats * beatSpeedMs;
      const progressRatio = Math.min(1, Math.max(0, elapsedMs / sectionDurationMs));

      if (backdropProgressRef.current) backdropProgressRef.current.style.transform = `scaleX(${progressRatio})`;
      if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;

      // ✅ SURGICAL ADDITION: 60FPS Hardware Line Highlighting
      const activeSectionObj = memoizedSongAstTree[activeIdx];
      if (activeSectionObj && activeSectionObj.lines.length > 0) {
        // Calculate which line we are currently on based on section progress
        const currentLineIndex = Math.min(activeSectionObj.lines.length - 1, Math.floor(progressRatio * activeSectionObj.lines.length));
        
        if (activeLineIndexRef.current !== currentLineIndex || lastHighlightedSectionRef.current !== activeIdx) {
          // Remove highlight from previous line
          if (lastHighlightedSectionRef.current !== null && activeLineIndexRef.current !== null) {
            const prevEl = document.getElementById(`line-${lastHighlightedSectionRef.current}-${activeLineIndexRef.current}`);
            if (prevEl) prevEl.classList.remove('bg-blue-50/50', 'border-blue-500', 'pl-3');
          }
          // Add highlight to active line
          const newEl = document.getElementById(`line-${activeIdx}-${currentLineIndex}`);
          if (newEl) newEl.classList.add('bg-blue-50/50', 'border-blue-500', 'pl-3');
          
          activeLineIndexRef.current = currentLineIndex;
          lastHighlightedSectionRef.current = activeIdx;
        }
      }

      if (lastHighlightedSectionRef.current !== null && activeLineIndexRef.current !== null) {
      const prevEl = document.getElementById(`line-${lastHighlightedSectionRef.current}-${activeLineIndexRef.current}`);
      if (prevEl) prevEl.classList.remove('bg-blue-50/50', 'border-blue-500', 'pl-3');
    }
    activeLineIndexRef.current = null;
    lastHighlightedSectionRef.current = null;

      // Guide Cues
      const remainingMs = sectionDurationMs - elapsedMs;
      if (remainingMs <= 4050 && remainingMs > 0 && !hasPlayedCueRef.current) {
        hasPlayedCueRef.current = true;
        const targetNextIdx = pendingQuantizedJumpRef.current ? pendingQuantizedJumpRef.current.sectionIndex : activeIdx + 1;
        if (targetNextIdx < memoizedSongAstTree.length) {
          playGuideCue(memoizedSongAstTree[targetNextIdx].section_name);
        }
      }

      // Execute Jump or Auto-Advance
      if (elapsedMs >= sectionDurationMs) {
        if (pendingQuantizedJumpRef.current) {
          currentSectionIndexRef.current = pendingQuantizedJumpRef.current.sectionIndex;
          setCurrentSectionIndex(pendingQuantizedJumpRef.current.sectionIndex);
          sectionStartTimeRef.current = pendingQuantizedJumpRef.current.jumpTime;
          lastAudioBeatRef.current = beatMapRef.current.sectionStartBeats[pendingQuantizedJumpRef.current.sectionIndex];
          setQueuedSectionIndex(null);
          pendingQuantizedJumpRef.current = null;
        } else {
          const nextIndex = activeIdx + 1;
          if (nextIndex < memoizedSongAstTree.length) {
            currentSectionIndexRef.current = nextIndex;
            setCurrentSectionIndex(nextIndex);
            sectionStartTimeRef.current += sectionDurationMs;
          } else {
            executeStopSequence();
            return;
          }
        }
        
        hasPlayedCueRef.current = false;
        const targetElement = sectionRefs.current[memoizedSongAstTree[currentSectionIndexRef.current].id];
        if (targetElement) targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
    };

    animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlayingFlow]); 

  // Interactive Section Jumping
  function handleSectionClick(idx: number) {
    if (isPlayingFlow) {
      if (idx === currentSectionIndex) return;
      
      const beatSpeedMs = (60 / (song?.tempo || 75)) * 1000;
      const measureDurationMs = beatSpeedMs * 4; 
      const elapsed = getGlobalTime() - sectionStartTimeRef.current;
      const timeToNextMeasure = measureDurationMs - (elapsed % measureDurationMs);
      const jumpTime = getGlobalTime() + timeToNextMeasure;

      pendingQuantizedJumpRef.current = { sectionIndex: idx, jumpTime };
      setQueuedSectionIndex(idx);
      
      if (globalAudioContext) {
        const audioJumpTime = globalAudioContext.currentTime + (timeUntilJumpSecs => timeUntilJumpSecs / 1000)(jumpTime - getGlobalTime());
        scheduledClicksRef.current.forEach(click => {
          if (click.audioTime >= audioJumpTime - 0.05) {
            try { click.source.stop(); click.source.disconnect(); } catch(e) {}
          }
        });
        scheduledClicksRef.current = scheduledClicksRef.current.filter(click => click.audioTime < audioJumpTime - 0.05);
      }
    } else {
      currentSectionIndexRef.current = idx;
      setCurrentSectionIndex(idx);
    }
  }

  // =======================================================
  // UI HANDLERS
  // =======================================================
  function handleOpenTransposerModal() {
    if (!song) return;
    const cleanKeyBase = activeDisplayKey.endsWith("m") ? activeDisplayKey.slice(0, -1) : activeDisplayKey;
    let baseLetter = cleanKeyBase.charAt(0);
    let accidentalSign: "" | "#" | "b" = "";
    
    if (cleanKeyBase.includes("#")) accidentalSign = "#";
    else if (cleanKeyBase.includes("b")) accidentalSign = "b";

    setModalRoot(baseLetter);
    setModalAccidental(accidentalSign);
    setIsTransposerOpen(true);
  }

  function handleCommitTransposition(e: React.FormEvent) {
    e.preventDefault();
    if (!song) return;
    const isMinorSong = song.original_key.endsWith("m");
    const formattedNewKeyName = `${modalRoot}${modalAccidental}${isMinorSong ? "m" : ""}`;
    setActiveDisplayKey(formattedNewKeyName);
    setIsTransposerOpen(false);
  }

  const activeFontSizeValue = {
    default: "15px",
    medium: "18px",
    large: "22px",
    huge: "26px"
  }[lyricsFontSize];

  const rowSpacingStyles = {
    default: "py-1.5 gap-4",
    medium: "py-3 gap-5",
    large: "py-5 gap-6"
  }[lineSpacing];

  // =======================================================
  // ✅ SURGICAL ADDITION: SOLO PRACTICE HARDWARE ENGINES
  // =======================================================
  const getGlobalTime = () => performance.now();
  
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const countdownValueRef = useRef<number | null>(null);
  const [queuedSectionIndex, setQueuedSectionIndex] = useState<number | null>(null);
  
  const [isMetronomeSoundEnabled, setIsMetronomeSoundEnabled] = useState(false);
  const [isDoubleMetronomeEnabled, setIsDoubleMetronomeEnabled] = useState(false);
  const [localClickVolume, setLocalClickVolume] = useState(0.8);
  const isMetronomeEnabledRef = useRef(false);
  const isDoubleMetronomeRef = useRef(false);
  const localClickVolumeRef = useRef(0.8);

  const [isYoutubeSyncEnabled, setIsYoutubeSyncEnabled] = useState(false);
  const [youtubeVolume, setYoutubeVolume] = useState(0.8);
  const [isYtBuffering, setIsYtBuffering] = useState(false);
  
  const ytPlayerRef = useRef<any>(null);
  const isYtPlayerReadyRef = useRef(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const isYtBackingTrackStartRef = useRef(false);
  const ytSyncPendingRef = useRef(false);

  const pendingQuantizedJumpRef = useRef<{ sectionIndex: number; jumpTime: number } | null>(null);
  const scheduledClicksRef = useRef<{ source: AudioBufferSourceNode, audioTime: number }[]>([]);
  const lastAudioBeatRef = useRef<number>(0);
  const beatMapRef = useRef<{ nodes: { isDownbeat: boolean, sectionIndex: number }[], sectionStartBeats: number[] }>({ nodes: [], sectionStartBeats: [] });

  const activeLineIndexRef = useRef<number | null>(null);
  const lastHighlightedSectionRef = useRef<number | null>(null);

  // ✅ SURGICAL ADDITION: Bulletproof Metronome Trigger
  const triggerMetronomeSound = (beatNum: number, time: number) => {
    if (!globalAudioContext) return;
    const targetKey = beatNum === 1 ? "metronome_1" : "metronome_2";
    if (!audioBufferCache[targetKey]) return;
    
    try {
      const source = globalAudioContext.createBufferSource();
      source.buffer = audioBufferCache[targetKey];
      const gain = globalAudioContext.createGain();
      
      // If it's a double metronome 8th note, drop the volume slightly
      gain.gain.value = localClickVolumeRef.current * (beatNum === 2 && isDoubleMetronomeRef.current ? 0.7 : 1.0);
      
      source.connect(gain);
      gain.connect(globalAudioContext.destination);
      source.start(time);
      
      scheduledClicksRef.current.push({ source, audioTime: time });
      source.onended = () => {
        const idx = scheduledClicksRef.current.findIndex(s => s.source === source);
        if (idx > -1) scheduledClicksRef.current.splice(idx, 1);
      };
    } catch(e) { console.warn("Metronome trigger failed", e) }
  };

  // Sync state to refs for the hardware loop
  useEffect(() => { isMetronomeEnabledRef.current = isMetronomeSoundEnabled; }, [isMetronomeSoundEnabled]);
  useEffect(() => { isDoubleMetronomeRef.current = isDoubleMetronomeEnabled; }, [isDoubleMetronomeEnabled]);
  useEffect(() => { localClickVolumeRef.current = localClickVolume; }, [localClickVolume]);
  
  useEffect(() => {
    if (isYtPlayerReadyRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      try { ytPlayerRef.current.setVolume(youtubeVolume * 100); } catch(e) {}
    }
  }, [youtubeVolume]);

  // Load preferences from cache
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (localStorage.getItem("wm_prefs_clickOn") === "true") setIsMetronomeSoundEnabled(true);
      if (localStorage.getItem("wm_prefs_doubleMetronome") === "true") setIsDoubleMetronomeEnabled(true);
      
      const savedFormat = localStorage.getItem("wm_prefs_chordFormat");
      if (savedFormat === "numbers" || savedFormat === "key") setChordFormat(savedFormat);
      const vol = localStorage.getItem("wm_prefs_clickVolume");
      if (vol) setLocalClickVolume(Number(vol));
      const ytVol = localStorage.getItem("wm_prefs_ytVolume");
      if (ytVol) setYoutubeVolume(Number(ytVol));
    }
  }, []);

  // Generate the Master Beat Map for the song
  useEffect(() => {
    if (!song || memoizedSongAstTree.length === 0) return;
    const nodes: { isDownbeat: boolean, sectionIndex: number }[] = [];
    const sectionStartBeats: number[] = [];
    
    memoizedSongAstTree.forEach((section, idx) => {
      sectionStartBeats.push(nodes.length);
      const timings = song.section_timings?.[section.section_name] || { measures: 4, beats: 0, head_m: 0, tail_m: 0, repeats: 0 };
      const sectionMultiplier = (timings.repeats || 0) + 1;
      const totalBeats = (((timings.measures * 4) + (timings.beats || 0)) * sectionMultiplier) + ((timings.head_m || 0) * 4) + ((timings.tail_m || 0) * 4);
      
      for (let i = 0; i < (totalBeats || 32); i++) {
        nodes.push({ isDownbeat: i % 4 === 0, sectionIndex: idx });
      }
    });
    beatMapRef.current = { nodes, sectionStartBeats };
  }, [song, memoizedSongAstTree]);

  // YouTube Pre-Warm Engine
  useEffect(() => {
    if (!song?.youtube_url || !isYoutubeSyncEnabled) return;
    const match = song.youtube_url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
    const videoId = match && match[2].length === 11 ? match[2] : null;
    if (!videoId) return;

    const initPlayer = () => {
      if (!(window as any).YT || !(window as any).YT.Player) {
        setTimeout(initPlayer, 200);
        return;
      }
      
      if (ytPlayerRef.current && isYtPlayerReadyRef.current && typeof ytPlayerRef.current.cueVideoById === 'function') {
        if (loadedVideoIdRef.current !== videoId) {
          loadedVideoIdRef.current = videoId;
          try { ytPlayerRef.current.cueVideoById(videoId); } catch(e) {}
        }
      } else if (!ytPlayerRef.current) {
        loadedVideoIdRef.current = videoId;
        ytPlayerRef.current = new (window as any).YT.Player('yt-solo-player-container', {
          height: '10px', width: '10px', videoId: videoId,
          playerVars: { 'playsinline': 1, 'controls': 0, 'disablekb': 1 },
          events: {
            'onReady': (event: any) => {
              isYtPlayerReadyRef.current = true;
              event.target.setVolume(youtubeVolume * 100);
              event.target.mute();
              event.target.playVideo();
              setTimeout(() => {
                try { event.target.pauseVideo(); event.target.seekTo(0); event.target.unMute(); } catch(e) {}
              }, 500);
            },
            'onStateChange': (event: any) => {
              if (event.data === 1 && ytSyncPendingRef.current) {
                ytSyncPendingRef.current = false;
                setIsYtBuffering(false);
                const currentVideoTimeMs = (event.target.getCurrentTime() || 0) * 1000;
                const offsetMs = song.youtube_sync_offset_ms || 0;
                executeStartSequence(false, getGlobalTime() + (offsetMs - currentVideoTimeMs), true);
              }
            }
          }
        });
      }
    };

    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
    initPlayer();

    return () => {
      if (isYtPlayerReadyRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
        try { ytPlayerRef.current.pauseVideo(); } catch(e) {}
      }
    };
  }, [song?.youtube_url, isYoutubeSyncEnabled, youtubeVolume]);

  if (loading) {
    return <GlobalLoader message="SYNCING MASTER SHEET ENGINE..." />;
  }
  
  if (!song) {
    return <div className="p-12 text-center text-sm font-bold text-zinc-500">Song master record profile missing or deleted.</div>;
  }
  return (
    <div className="absolute inset-0 flex flex-col bg-[#f8f9fa] overflow-hidden select-none">
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

      {/* ======================================================================= */}
      {/* --- RE-ARCHITECTED FULL-WIDTH STICKY COCKPIT HEADER ------------------ */}
      {/* ======================================================================= */}
      <div id="fixed-live-header" className="w-full bg-white border-b border-zinc-200 px-6 py-4 flex-shrink-0 z-50 shadow-sm select-none relative overflow-hidden">
        
        {/* Exact Live Page Dual Progress Bars */}
        <div 
          ref={backdropProgressRef}
          className="absolute inset-y-0 left-0 bg-blue-500/5 pointer-events-none z-0 origin-left w-full"
          style={{ willChange: 'transform', transform: 'scaleX(0)' }}
        />
        <div 
          ref={accentProgressBarRef}
          className="absolute bottom-0 left-0 h-[3px] bg-blue-600 pointer-events-none z-35 origin-left w-full"
          style={{ willChange: 'transform', transform: 'scaleX(0)' }}
        />

        <div className="max-w-5xl mx-auto flex items-center justify-between gap-6 w-full relative z-10">
          
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <button 
              type="button" 
              onClick={() => router.back()} 
              className="w-8 h-8 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-500 font-bold text-xs flex items-center justify-center shrink-0 shadow-sm"
            >
              ‹
            </button>
            <div className="min-w-0 leading-tight space-y-0.5">
              
              <div className="flex items-center">
                <span className="bg-blue-50 border border-blue-100 text-blue-600 font-mono font-black text-[10px] px-2 py-0.5 rounded-md shadow-inner">
                  ⏱ {song.tempo || "--"} BPM
                </span>
              </div>

              <h1 className="text-xl font-black tracking-tight text-zinc-950 truncate max-w-xs md:max-w-sm">
                {song.title}
              </h1>
              <p className="text-[11px] text-zinc-400 font-bold">by {song.artist || "Unknown Author"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button
                type="button"
                onClick={() => router.push(`/songs/${songId}/edit`)}
                className="flex bg-zinc-950 hover:bg-zinc-800 text-white border border-zinc-900 rounded-xl px-3 md:px-4 text-[10px] md:text-[11px] font-black uppercase tracking-widest shadow-sm transition-colors cursor-pointer h-10 items-center justify-center"
              >
                Edit
              </button>
            )}

            <button
              type="button"
              onClick={handleTogglePlayState}
              className={`h-10 px-5 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isPlayingFlow 
                  ? "bg-red-600 border-red-500 text-white ring-2 ring-red-500/20 shadow-md" 
                  : "bg-blue-600 border-blue-500 text-white shadow-sm"
              }`}
            >
              {isPlayingFlow ? "⏹" : "▶"}
            </button>
               
            <button
              type="button"
              onClick={() => setIsPrefsModalOpen(true)}
              className="w-10 h-10 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 font-bold text-sm rounded-xl shadow-sm flex items-center justify-center cursor-pointer hover:border-blue-500 hover:text-blue-600 transition-colors"
              title="Open Console Settings Preferences"
            >
              <img alt="Settings" className="w-3 h-3 opacity-60" src="/assets/settings.svg" />
            </button>
          </div>

        </div>
      </div>

      {/* ======================================================================= */}
      {/* --- SHEET CANVAS PANE VIEW ------------------------------------------- */}
      {/* ======================================================================= */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pt-6 custom-scrollbar pb-24">
        <div className="max-w-5xl w-full mx-auto space-y-4">
          
          {memoizedSongAstTree.map((section, idx) => {
            const timings = song.section_timings?.[section.section_name] || { measures: 4, beats: 0, head_m: 0, tail_m: 0, repeats: 0 };
            const sectionMultiplier = (timings.repeats || 0) + 1;
            const displayMeasures = ((timings.measures || 0) * sectionMultiplier) + (timings.head_m || 0) + (timings.tail_m || 0);
            const displayBeats = (timings.beats || 0) * sectionMultiplier;

            return (
              <div
                key={section.id}
                id={`section-${idx}`}
                ref={(el) => { sectionRefs.current[section.id] = el; }}
                onClick={() => handleSectionClick(idx)}
                className={`bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm relative transition-all duration-300 cursor-pointer hover:border-blue-300 ${
                  queuedSectionIndex === idx 
                    ? "border-purple-500 ring-4 ring-purple-500/20 bg-purple-50/30"
                    : currentSectionIndex === idx ? "border-blue-500 ring-4 ring-blue-500/10 shadow-md z-10" : ""
                }`}
              >
                <div className="flex items-center justify-between border-b border-zinc-100/80 pb-2.5 mb-4 select-none">
                  <span className={`font-black text-[10px] uppercase tracking-wider px-3 py-1 rounded-full ${
                    currentSectionIndex === idx ? "bg-blue-600 text-white shadow-sm" : "bg-blue-50 text-blue-600"
                  }`}>
                    {section.section_name}
                  </span>
                  
                  <span className="text-[9px] font-black uppercase text-zinc-400">
                     {displayMeasures}M {displayBeats > 0 ? `+${displayBeats}B` : ''}
                  </span>
                </div>

                <div className="pl-1.5 select-text selection:bg-blue-50 text-zinc-800 space-y-1">
                  {section.lines.length === 0 ? (
                    <div className="h-4" />
                  ) : (
                    section.lines.map((line, lIdx) => (
                      <div 
                        key={lIdx} 
                        id={`line-${idx}-${lIdx}`} 
                        className={`flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-50/20 last:border-0 ${rowSpacingStyles} transition-all duration-300 border-l-4 border-transparent`}
                      >
                        
                        <div className="flex flex-wrap items-end gap-x-2.5 gap-y-4 py-1 leading-none flex-1">
                          {line.words.map((wordObj, wIdx) => (
                            <div key={wIdx} className="flex flex-col items-start min-h-[38px] justify-end">
                              {showChords && wordObj.chords.length > 0 && (
                                <div className="text-[12px] font-mono font-black text-blue-600 tracking-tight pb-0.5 select-none">
                                  {wordObj.chords.map((ch, cIdx) => {
                                    const finalChord = runtimeSemitoneDelta !== 0 ? transposeBracketContent(ch, runtimeSemitoneDelta) : ch;
                                    return <span key={cIdx} className="mr-1 bg-blue-50/60 px-1 rounded border border-blue-100/40">{finalChord}</span>;
                                  })}
                                </div>
                              )}
                              <div 
                                style={{ fontSize: activeFontSizeValue }}
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
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {sections.length === 0 && (
            <div className="bg-white border border-dashed text-center text-zinc-400 p-16 rounded-2xl font-bold select-none text-sm">
              This master profile template is completely blank. Instantiation coordinates have no loaded lyrics.
            </div>
          )}
        </div>
      </div>

      {/* ======================================================================= */}
      {/* --- UNIFIED BOTTOM SHEET PREFERENCES MODAL ---------------------------- */}
      {/* ======================================================================= */}
      {isPrefsModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[200000] flex justify-center items-end sm:items-center p-0 sm:p-4 animate-in fade-in duration-200 select-none">
          <div className="bg-white w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl relative animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 flex flex-col max-h-[90vh] overflow-hidden">
            
            {/* Drag Handle & Dynamic Header */}
            <div className="sticky top-0 bg-white z-20 border-b border-zinc-100 pb-4 pt-4 px-6 flex flex-col items-center shrink-0">
              <div className="w-12 h-1.5 bg-zinc-200 rounded-full mb-4 sm:hidden" />
              <div className="flex items-center justify-between w-full relative">
                {activeSettingsPane === "structure" ? (
                  <button onClick={() => setActiveSettingsPane("main")} className="w-8 h-8 rounded-full bg-zinc-50 hover:bg-zinc-100 text-zinc-500 text-lg font-black flex items-center justify-center transition-colors">
                    ‹
                  </button>
                ) : (
                  <div className="w-8" /> /* Spacer for centering */
                )}
                
                <h3 className="text-lg font-black text-zinc-900 tracking-tight text-center absolute left-1/2 -translate-x-1/2">
                  {activeSettingsPane === "main" ? "Preferences" : "Edit Structure"}
                </h3>
                
                <button
                  onClick={() => setIsPrefsModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-zinc-50 hover:bg-zinc-100 text-zinc-500 text-xs font-bold flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto p-6 custom-scrollbar pb-12 min-h-[50vh]">
              
              {activeSettingsPane === "main" && (
                <div className="space-y-8 animate-in slide-in-from-left-4 fade-in duration-200">
                  
                  {/* --- 1. INSTANT TRANSPOSER --- */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black uppercase text-zinc-900 tracking-wider">Transpose Key</label>
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md shadow-inner">
                        Original: {song?.original_key || "--"}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-1.5">
                      {BASE_LETTER_ROOTS.map(letter => {
                        const currentRoot = activeDisplayKey.replace(/[m#b]/g, "");
                        const currentAccidental = activeDisplayKey.includes("#") ? "#" : activeDisplayKey.includes("b") ? "b" : "";
                        const isMinor = activeDisplayKey.endsWith("m");
                        const isSelected = currentRoot === letter;
                        
                        return (
                          <button
                            key={letter}
                            onClick={() => setActiveDisplayKey(`${letter}${currentAccidental}${isMinor ? 'm' : ''}`)}
                            className={`aspect-square rounded-xl text-center text-sm font-black transition-all flex items-center justify-center cursor-pointer ${
                              isSelected ? "bg-blue-600 text-white shadow-md scale-105" : "bg-zinc-50 border border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                            }`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 divide-x border border-zinc-200 rounded-xl overflow-hidden h-10 shadow-sm">
                      {['b', '#'].map(acc => {
                        const currentRoot = activeDisplayKey.replace(/[m#b]/g, "");
                        const currentAccidental = activeDisplayKey.includes("#") ? "#" : activeDisplayKey.includes("b") ? "b" : "";
                        const isMinor = activeDisplayKey.endsWith("m");
                        const isSelected = currentAccidental === acc;

                        return (
                          <button
                            key={acc}
                            onClick={() => setActiveDisplayKey(`${currentRoot}${isSelected ? '' : acc}${isMinor ? 'm' : ''}`)}
                            className={`text-center font-black transition-colors flex items-center justify-center h-full cursor-pointer ${
                              isSelected ? "bg-blue-50 text-blue-600" : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                            }`}
                          >
                            {acc === 'b' ? '♭' : '#'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* --- 2. DISPLAY OPTIONS --- */}
                  <div className="space-y-4 pt-2 border-t border-zinc-100">
                    <label className="text-xs font-black uppercase text-zinc-900 tracking-wider">Display Options</label>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Chord Notation</span>
                      <div className="flex bg-zinc-50 p-1 rounded-xl border border-zinc-200 shadow-inner items-center h-10">
                        <button onClick={() => setShowChords(true)} className={`flex-1 text-[11px] font-black rounded-lg h-full transition-all ${showChords ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-700"}`}>Show</button>
                        <button onClick={() => setShowChords(false)} className={`flex-1 text-[11px] font-black rounded-lg h-full transition-all ${!showChords ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-700"}`}>Hide</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">Chord Format <span className="bg-blue-100 text-blue-600 text-[8px] px-1.5 py-0.5 rounded-sm">Beta</span></span>
                      <div className="flex bg-zinc-50 p-1 rounded-xl border border-zinc-200 shadow-inner items-center h-10">
                        <button onClick={() => { setChordFormat("key"); localStorage.setItem("wm_prefs_chordFormat", "key"); }} className={`flex-1 text-[11px] font-black rounded-lg h-full transition-all ${chordFormat === "key" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-700"}`}>Key</button>
                        <button onClick={() => { setChordFormat("numbers"); localStorage.setItem("wm_prefs_chordFormat", "numbers"); }} className={`flex-1 text-[11px] font-black rounded-lg h-full transition-all ${chordFormat === "numbers" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-700"}`}>Numbers</button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Line Spacing</span>
                        <div className="flex bg-zinc-50 p-1 rounded-xl border border-zinc-200 shadow-inner items-center h-[36px]">
                          {(["default", "medium", "large"] as const).map((opt) => (
                            <button key={opt} onClick={() => setLineSpacing(opt)} className={`flex-1 text-[10px] font-black rounded-lg uppercase h-full transition-all ${lineSpacing === opt ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400 hover:text-zinc-700"}`}>{opt.slice(0,1)}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Lyrics Size</span>
                        <div className="flex bg-zinc-50 p-1 rounded-xl border border-zinc-200 shadow-inner items-center h-[36px]">
                          {(["default", "medium", "large", "huge"] as const).map((opt) => (
                            <button key={opt} onClick={() => setLyricsFontSize(opt)} className={`flex-1 text-[10px] font-black rounded-lg uppercase h-full transition-all ${lyricsFontSize === opt ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-400 hover:text-zinc-700"}`}>{opt.slice(0,1)}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* --- 3. HARDWARE & SYNC ENGINES --- */}
                  <div className="space-y-4 pt-2 border-t border-zinc-100">
                    <label className="text-xs font-black uppercase text-zinc-900 tracking-wider">Metronome & Audio</label>
                    
                    <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl p-3 shadow-sm">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-zinc-800">Local Click Track</span>
                        <span className="text-[9px] font-bold text-zinc-400">Zero-latency metronome</span>
                      </div>
                      <button onClick={() => setIsMetronomeSoundEnabled(!isMetronomeSoundEnabled)} className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors shadow-inner ${isMetronomeSoundEnabled ? 'bg-blue-500' : 'bg-zinc-200'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isMetronomeSoundEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    {/* YouTube Sync Settings */}
                    {song?.youtube_url && song?.youtube_sync_offset_ms !== undefined && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl p-3 shadow-sm">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-zinc-800 flex items-center gap-1.5"><span className="text-red-600 text-sm">▶</span> YouTube Sync</span>
                            <span className="text-[9px] font-bold text-zinc-400">Lock metronome to backing track</span>
                          </div>
                          <button onClick={() => setIsYoutubeSyncEnabled(!isYoutubeSyncEnabled)} className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors shadow-inner ${isYoutubeSyncEnabled ? 'bg-red-500' : 'bg-zinc-200'}`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isYoutubeSyncEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        {isYoutubeSyncEnabled && (
                          <div className="flex flex-col gap-2 bg-red-50/50 border border-red-100 rounded-xl p-3 animate-in slide-in-from-top-1">
                            <span className="text-[10px] font-bold text-red-800">Track Mix Volume</span>
                            <input type="range" min="0" max="1" step="0.05" value={youtubeVolume} onChange={(e) => setYoutubeVolume(parseFloat(e.target.value))} className="w-full accent-red-600" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* --- THE NEW ACTIONS MENU --- */}
                  <div className="space-y-4 pt-2 border-t border-zinc-100">
                    <label className="text-xs font-black uppercase text-zinc-900 tracking-wider">Actions</label>
                    <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-zinc-100">
                      
                      {/* <button onClick={() => router.push(`/songs/${songId}/edit`)} className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">📝</span>
                          <span className="text-sm font-bold text-zinc-800">Edit Song</span>
                        </div>
                        <span className="text-zinc-300 font-bold text-lg leading-none">›</span>
                      </button> */}

                      <button onClick={() => setActiveSettingsPane("structure")} className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">🧱</span>
                          <span className="text-sm font-bold text-zinc-800">Edit Structure</span>
                        </div>
                        <span className="text-zinc-300 font-bold text-lg leading-none">›</span>
                      </button>

                    </div>
                  </div>
                </div>
              )}

              {activeSettingsPane === "structure" && (
                <div className="flex flex-col gap-3 animate-in slide-in-from-right-4 fade-in duration-200">
                  
                  {/* Draggable List Items */}
                  {localSections.map((sec, i) => (
                    <div key={`${sec.id}-${i}`} className="flex items-center justify-between p-3.5 bg-white border border-zinc-200 rounded-2xl shadow-sm transition-all hover:border-zinc-300">
                      <div className="flex items-center gap-3.5">
                        {/* 6-dot drag handle icon */}
                        <div className="grid grid-cols-2 gap-[2px] opacity-20 cursor-grab px-1">
                          {[...Array(6)].map((_, dot) => <div key={dot} className="w-1 h-1 bg-black rounded-full" />)}
                        </div>
                        
                        <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${getSectionBadgeStyle(sec.section_name)}`}>
                          {getSectionAbbreviation(sec.section_name)}
                        </div>
                        
                        <span className="text-sm font-bold text-zinc-900">{sec.section_name}</span>
                      </div>
                      
                      <button onClick={() => setLocalSections(prev => prev.filter((_, index) => index !== i))} className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-red-500 transition-colors text-lg">
                        ✕
                      </button>
                    </div>
                  ))}

                  {localSections.length === 0 && (
                    <div className="p-8 text-center text-zinc-400 font-bold text-sm border-2 border-dashed border-zinc-200 rounded-2xl">
                      No sections in arrangement.
                    </div>
                  )}

                  {/* Add New Structures Engine */}
                  <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-col items-start gap-4">
                    <button 
                      onClick={() => setIsAddingSection(!isAddingSection)}
                      className="text-blue-500 hover:text-blue-600 font-bold text-sm flex items-center gap-2 transition-colors"
                    >
                      <span className="text-lg leading-none">{isAddingSection ? '−' : '+'}</span> Add New Structures
                    </button>

                    {isAddingSection && (
                      <div className="flex flex-wrap gap-2 animate-in slide-in-from-top-2 fade-in">
                        {Array.from(new Set(originalSections.map(s => s.section_name))).map(uniqueName => {
                          const origSec = originalSections.find(s => s.section_name === uniqueName);
                          if (!origSec) return null;
                          return (
                            <button 
                              key={`add-${uniqueName}`} 
                              onClick={() => { setLocalSections(prev => [...prev, origSec]); setIsAddingSection(false); }} 
                              className={`border px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${getSectionBadgeStyle(uniqueName)} hover:scale-105 cursor-pointer`}
                            >
                              + {uniqueName}
                            </button>
                          );
                        })}
                        <button onClick={() => { setLocalSections(originalSections); setIsAddingSection(false); }} className="bg-zinc-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-zinc-900 shadow-sm ml-auto cursor-pointer">
                          ↺ Reset Original
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          </div>
        </div>
      )}
      
      {/* ======================================================= */}
      {/* QUICK JUMP TOUCH SCRUBBER                               */}
      {/* ======================================================= */}
      {memoizedSongAstTree.length > 0 && (
        <div
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={isScrubberActive ? handleScrubberPointerMove : undefined}
          onPointerUp={handleScrubberPointerUp}
          onPointerCancel={handleScrubberPointerUp}
          className={`fixed right-0 top-[140px] bottom-24 z-40 flex flex-col overflow-y-auto custom-scrollbar pl-12 pr-1 md:pr-3 touch-none transition-all duration-300 select-none ${
            isScrubberActive ? "w-48" : "w-10"
          }`}
        >
          <div className="relative z-10 flex flex-col items-end gap-2 md:gap-3 py-4 my-auto transition-all duration-300 w-full min-h-min">
            {memoizedSongAstTree.map((sec, idx) => {
              const isHovered = scrubberHoverIndex === idx;
              const isActive = currentSectionIndex === idx;
              const abbr = getSectionAbbreviation(sec.section_name);

              return (
                <div
                  key={`scrub-${sec.id}`}
                  data-scrubber-index={idx}
                  className={`flex items-center justify-end gap-3 transition-all duration-200 w-full text-right ${
                    isHovered ? "-translate-x-1" : isScrubberActive ? "cursor-crosshair" : "cursor-pointer"
                  }`}
                >
                  <span 
                    data-scrubber-index={idx}
                    className={`font-black uppercase tracking-wider transition-all duration-200 ${
                      !isScrubberActive ? "hidden opacity-0" :
                      isHovered 
                        ? "text-[16px] text-black opacity-100 scale-105 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]" 
                        : "text-[12px] text-black opacity-90"
                    }`}
                  >
                    {sec.section_name}
                  </span>
                  
                  <div
                    data-scrubber-index={idx}
                    className={`rounded-full transition-all duration-300 shrink-0 shadow-sm flex items-center justify-center overflow-hidden ${
                      isActive
                        ? "w-6 h-6 bg-blue-600 ring-2 ring-blue-500/20 text-white font-black text-[9px] shadow-md"
                        : isHovered
                        ? "w-3 h-3 bg-blue-400 ring-4 ring-blue-400/20"
                        : "w-1.5 h-1.5 bg-zinc-400/80 hover:bg-zinc-500"
                    }`}
                  >
                    {isActive && <span className="pt-[1px]">{abbr}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    {/* ======================================================= */}
      {/* ✅ SURGICAL ADDITION: RENDER OVERLAYS                     */}
      {/* ======================================================= */}
      
      {/* 3... 2... 1... Overlay */}
      {countdownValue !== null && (
        <div className="absolute inset-0 z-[100000] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md pointer-events-none select-none">
          <div key={countdownValue} className="animate-in zoom-in-50 fade-in duration-300 zoom-out-150 fade-out slide-out-to-top-8">
            <span className="text-[250px] font-black text-white leading-none tracking-tighter drop-shadow-2xl">
              {countdownValue}
            </span>
          </div>
        </div>
      )}

      {/* Buffering Overlay */}
      {isYtBuffering && (
        <div className="fixed inset-0 z-[400000] bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-100 select-none touch-none">
          <span className="text-red-500 font-black tracking-widest uppercase mb-4 text-xl md:text-2xl animate-pulse">Buffering Track</span>
          <span className="text-[100px] md:text-[150px] font-black text-white leading-none tracking-tighter drop-shadow-2xl">∞</span>
        </div>
      )}

      {/* Hidden YouTube Target */}
      <div className="absolute opacity-0 pointer-events-none w-[1px] h-[1px] overflow-hidden -z-50">
        <div id="yt-solo-player-container"></div>
      </div>
    </div>
  );
}