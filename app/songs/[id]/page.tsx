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
  const [sections, setSections] = useState<ArrangementSection[]>([]);
  const [activeDisplayKey, setActiveDisplayKey] = useState<string>("G");
  
  // Custom Workspace Preferences Control States
  const [isPrefsModalOpen, setIsPrefsModalOpen] = useState(false);
  const [showChords, setShowChords] = useState(true);
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

  // Preload Audio Cues for this specific song
  useEffect(() => {
    if (typeof window === "undefined" || sections.length === 0) return;
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
    return sections.map((section): CompiledSectionToken => {
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
  }, [sections]);

  // =======================================================
  // DECOUPLED LOCAL HARDWARE PRACTICE ENGINE
  // =======================================================
  
  const handleTogglePlayState = () => {
    if (isPlayingFlow) {
      isPlayingRef.current = false;
      setIsPlayingFlow(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (backdropProgressRef.current) backdropProgressRef.current.style.transform = `scaleX(0)`;
      if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = `scaleX(0)`;
    } else {
      if (!song || memoizedSongAstTree.length === 0) return;
      initAudioContext(); // Unlock browser audio engine
      isPlayingRef.current = true;
      setIsPlayingFlow(true);
      
      currentSectionIndexRef.current = currentSectionIndex;
      sectionStartTimeRef.current = performance.now();
    }
  };

  useEffect(() => {
    if (!isPlayingFlow || !song || memoizedSongAstTree.length === 0) return;

    const clockExecutionTick = () => {
      if (!isPlayingRef.current) return;

      const idx = currentSectionIndexRef.current;
      const activeSection = memoizedSongAstTree[idx];
      
      if (!activeSection) {
        isPlayingRef.current = false;
        setIsPlayingFlow(false);
        if (backdropProgressRef.current) backdropProgressRef.current.style.transform = `scaleX(0)`;
        if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = `scaleX(0)`;
        return;
      }

      const timings = song.section_timings?.[activeSection.section_name] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
      const sectionMultiplier = (timings.repeats || 0) + 1;
      const headBeats = (timings.head_m || 0) * 4;
      const tailBeats = (timings.tail_m || 0) * 4;
      const baseBeats = (timings.measures * 4) + (timings.beats || 0);

      let totalBeats = (baseBeats * sectionMultiplier) + headBeats + tailBeats;
      if (totalBeats <= 0) totalBeats = 32;

      const tempo = song.tempo || 75;
      const msPerBeat = 60000 / tempo;
      const sectionDurationMs = msPerBeat * totalBeats;

      const elapsedMs = performance.now() - sectionStartTimeRef.current;
      const progressRatio = Math.min(1, elapsedMs / sectionDurationMs);

      // Hardware accelerated DOM update for BOTH bars
      if (backdropProgressRef.current) backdropProgressRef.current.style.transform = `scaleX(${progressRatio})`;
      if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;

      // Guide Cue Trigger
      const remainingBeats = (sectionDurationMs - elapsedMs) / msPerBeat;
      if (remainingBeats <= 4.05 && remainingBeats > 0 && !hasPlayedCueRef.current) {
        hasPlayedCueRef.current = true;
        const nextIndex = idx + 1;
        if (nextIndex < memoizedSongAstTree.length) {
          playGuideCue(memoizedSongAstTree[nextIndex].section_name);
        }
      }

      // When the bar hits exactly 100%, Auto-Advance to the next section!
      if (elapsedMs >= sectionDurationMs) {
        sectionStartTimeRef.current += sectionDurationMs; 
        hasPlayedCueRef.current = false; // Reset cue lock for the new section
        
        const nextIndex = idx + 1;
        if (nextIndex < memoizedSongAstTree.length) {
          currentSectionIndexRef.current = nextIndex;
          setCurrentSectionIndex(nextIndex);
          
          const targetSection = memoizedSongAstTree[nextIndex];
          if (targetSection) {
            const targetElement = sectionRefs.current[targetSection.id];
            if (targetElement) targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } else {
          isPlayingRef.current = false;
          setIsPlayingFlow(false);
          if (backdropProgressRef.current) backdropProgressRef.current.style.transform = `scaleX(0)`;
          if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = `scaleX(0)`;
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

  // =======================================================
  // UI HANDLERS
  // =======================================================
  function handleSectionClick(idx: number) {
    currentSectionIndexRef.current = idx;
    setCurrentSectionIndex(idx);
    
    if (isPlayingRef.current) {
      sectionStartTimeRef.current = performance.now();
      hasPlayedCueRef.current = false; // Reset cue lock when jumping
    }
  }

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
              {isPlayingFlow ? "⏹ STOP" : "▶ PLAY"}
            </button>
            
            <button
              type="button"
              onClick={handleOpenTransposerModal}
              className="bg-white border border-zinc-200 rounded-xl p-2.5 px-3.5 text-xs font-bold text-zinc-400 shadow-sm flex items-center gap-1 hover:border-blue-500 hover:text-blue-600 transition-colors cursor-pointer h-10"
            >
              KEY <span className="text-blue-600 font-black text-sm">{activeDisplayKey}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPrefsModalOpen(true)}
              className="w-10 h-10 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 font-bold text-sm rounded-xl shadow-sm flex items-center justify-center cursor-pointer hover:border-blue-500 hover:text-blue-600 transition-colors"
              title="Open Console Settings Preferences"
            >
              🎛️
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
                  currentSectionIndex === idx ? "border-blue-500 ring-4 ring-blue-500/10 shadow-md z-10" : ""
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
                      <div key={lIdx} className={`flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-50/20 last:border-0 ${rowSpacingStyles}`}>
                        
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
      {/* --- UNIFIED CONSOLE PREFERENCES INTERACTIVE OVERLAY ------------------- */}
      {/* ======================================================================= */}
      {isPrefsModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
          <div className="bg-white rounded-[2rem] border border-zinc-200 shadow-2xl max-w-md w-full p-6 space-y-6 text-left relative animate-in zoom-in-95 duration-150">
            
            <button
              type="button"
              onClick={() => setIsPrefsModalOpen(false)}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-zinc-50 hover:bg-zinc-100 border text-zinc-400 text-xs font-bold flex items-center justify-center cursor-pointer transition-colors"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-zinc-900 tracking-tight">Console Preferences</h3>
              <p className="text-xs text-zinc-400 font-bold">Tweak user accessibility and dynamic track constraints.</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Chord Notation Display</label>
              <div className="flex bg-zinc-50 p-1 rounded-full border shadow-inner items-center relative h-[42px]">
                <button
                  type="button"
                  onClick={() => setShowChords(true)}
                  className={`flex-1 text-center text-[11px] font-serif font-black rounded-full tracking-wider uppercase h-full transition-all flex items-center justify-center gap-1 ${
                    showChords ? "bg-[#18181b] text-white shadow-md" : "text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  👁️ Show Chords
                </button>
                <button
                  type="button"
                  onClick={() => setShowChords(false)}
                  className={`flex-1 text-center text-[11px] font-serif font-black rounded-full tracking-wider uppercase h-full transition-all flex items-center justify-center gap-1 ${
                    !showChords ? "bg-[#18181b] text-white shadow-md" : "text-zinc-400 hover:text-zinc-600"
                  }`}
                >
                  🙈 Hide Chords
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Lyrics Font Display Size</label>
              <div className="grid grid-cols-4 bg-zinc-50 p-1 rounded-full border shadow-inner items-center h-[42px]">
                {(["default", "medium", "large", "huge"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setLyricsFontSize(opt)}
                    className={`text-center text-[10px] font-serif font-black rounded-full uppercase tracking-tight h-full flex items-center justify-center transition-all ${
                      lyricsFontSize === opt ? "bg-[#2563eb] text-white shadow-md" : "text-zinc-400 hover:text-zinc-600"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Line Spacing Padding</label>
              <div className="grid grid-cols-3 bg-zinc-50 p-1 rounded-full border shadow-inner items-center h-[42px]">
                {(["default", "medium", "large"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setLineSpacing(opt)}
                    className={`text-center text-[10px] font-serif font-black rounded-full uppercase tracking-tight h-full flex items-center justify-center transition-all ${
                      lineSpacing === opt ? "bg-[#2563eb] text-white shadow-md" : "text-zinc-400 hover:text-zinc-600"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsPrefsModalOpen(false)}
                className="w-full py-3 bg-zinc-950 hover:bg-zinc-900 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all active:scale-[0.99] text-center cursor-pointer"
              >
                Close Parameters
              </button>
            </div>

          </div>
        </div>
      )}

      {/* OVERLAY KEY REMODAL TRANSPOSER INTERFACE */}
      {isTransposerOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-100 select-none">
          <form 
            onSubmit={handleCommitTransposition}
            className="bg-[#f8f9fa] border border-zinc-200 rounded-2xl shadow-2xl max-w-xl w-full p-7 px-8 space-y-6 text-left relative animate-in zoom-in-95"
          >
            <button
              type="button"
              onClick={() => setIsTransposerOpen(false)}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white hover:bg-zinc-100 border text-zinc-400 text-xs font-bold flex items-center justify-center shadow-sm cursor-pointer"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Rehearsal Sheet Transposer</h3>
              <p className="text-xs font-black text-blue-500">Master Catalog Baseline Key: {song.original_key || "--"}</p>
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
                  modalAccidental === "b" ? "bg-blue-50/80 text-blue-600" : "text-zinc-600 hover:bg-zinc-50/50"
                }`}
              >
                ♭
              </button>
              <button
                type="button"
                onClick={() => setModalAccidental(modalAccidental === "#" ? "" : "#")}
                className={`text-center text-sm font-black transition-colors flex items-center justify-center h-full cursor-pointer ${
                  modalAccidental === "#" ? "bg-blue-50/80 text-blue-600" : "text-zinc-600 hover:bg-zinc-50/50"
                }`}
              >
                #
              </button>
            </div>

            <div className="pt-2">
              <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-md text-center">
                Transpose Sheet Read View
              </button>
            </div>
          </form>
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

    </div>
  );
}