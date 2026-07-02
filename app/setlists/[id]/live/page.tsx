"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../../utils/supabase/client";
import { useEngine } from "../../../context/EngineContext"; 
import GlobalLoader from '../../../../components/GlobalLoader';

import { useTimesync } from '../../../../hooks/useTimesync';

// HOISTED TO GLOBAL SCOPE: Instantiates exactly once per tab instance to protect the WebSocket stream!
const supabase = createClient();

interface SongRecord {
  id: string;
  title: string;
  artist: string;
  original_key: string;
  tempo: number;
  section_timings: {
    [sectionName: string]: { 
      measures: number; 
      beats: number;
      repeats?: number;
      // ✅ SURGICAL ADDITION: Include Head and Tail types
      head_m?: number;
      tail_m?: number;
      line_timings?: {
        [lineIndex: string]: { measures: number; beats: number; repeats?: number }
      };
    };
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


// ✅ SURGICAL REFACTOR: Centralized normalizer for smart scanning
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
  if (lowerName.includes("tag")) return "Tag"; // ✅ Added Tag Cue
  if (lowerName.includes("ad lib")) return "Ad Lib";
  if (lowerName.includes("interlude")) return "Interlude";
  if (lowerName.includes("instrumental") || lowerName.includes("inst")) return "Instrumental";
  
  // Smart Regex catch for Verses (maps "Verse1", "verse 1", "Verse 1 (Quiet)" -> "Verse 1")
  const verseMatch = lowerName.match(/verse\s*(\d+)/);
  if (verseMatch) return `Verse ${verseMatch[1]}`;
  
  // Return null if it's a completely custom name that doesn't have a matching .wav file
  return null; 
};

// ✅ SURGICAL ADDITION: Smart Section Abbreviator for the Scrubber Dot
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
  if (lower.includes('tag')) return 'Tg'; // ✅ Added Tag Abbreviation
  if (lower.includes('inst')) return 'In';
  if (lower.includes('ad lib')) return 'AL';
  
  // Default to the first letter of the first two words
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
};

// ✅ SURGICAL PERFORMANCE FIX & UI OVERHAUL: O(1) Memoized Rendering
const MemoizedLyricLine = React.memo(({ 
  line, 
  sectionIndex, 
  lineIndex, 
  isCurrentlyPlayingLine, 
  showChords, 
  lyricsFontSize, 
  lineSpacing,
  chordFormat,      // ✅ Added prop
  activeDisplayKey  // ✅ Added prop
}: {
  line: ParsedLineToken;
  sectionIndex: number;
  lineIndex: number;
  isCurrentlyPlayingLine: boolean;
  showChords: boolean;
  lyricsFontSize: number;
  lineSpacing: number;
  chordFormat: "Key" | "Numbers"; 
  activeDisplayKey: string;
}) => {
  return (
    <div 
      id={`line-${sectionIndex}-${lineIndex}`}
      style={{ paddingBottom: `${Math.max(2, lineSpacing - 12)}px` }} 
      className={`flex flex-col sm:flex-row sm:items-start justify-between gap-1 border-b border-zinc-100/40 last:border-0 px-2 py-1 -mx-2 rounded-xl transition-all duration-300 ${
        isCurrentlyPlayingLine 
          ? "bg-zinc-100/80 shadow-sm scale-[1.002] border-transparent z-20" 
          : ""
      }`}
    >
      <div className="flex flex-wrap items-end gap-x-1.5 gap-y-2.5 leading-none flex-1 mt-1">
        {line.words.map((wordObj, wIdx) => (
          <div key={wIdx} className="flex flex-col items-start justify-end">
            {showChords && wordObj.chords.length > 0 && (
              <div className="w-0 overflow-visible whitespace-nowrap">
                <div className="text-[14px] md:text-[15px] font-['Roboto_Condensed'] font-bold tracking-tight pb-0.5 select-none text-blue-600 flex">
                  {wordObj.chords.map((ch, cIdx) => {
                    // ✅ Apply Roman Numeral Translation if requested
                    const displayChord = chordFormat === "Numbers" ? chordToRoman(ch, activeDisplayKey) : ch;
                    return (
                      <span key={cIdx} className="mr-1 px-1 rounded border bg-blue-50/60 border-blue-100/40 inline-block leading-none">
                        {displayChord}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            <div 
              style={{ fontSize: `${lyricsFontSize}px`, fontFamily: "'Roboto Condensed', sans-serif" }}
              className="font-medium tracking-tight transition-all duration-100 text-zinc-950 uppercase"
            >
              {wordObj.word || " "}
            </div>
          </div>
        ))}
      </div>
      {line.comment && (
        <div style={{ fontFamily: "'Nothing You Could Do', cursive" }} className="text-[14px] tracking-wide select-none whitespace-nowrap sm:pl-4 self-end text-zinc-400">
          {line.comment}
        </div>
      )}
    </div>
  );
});
MemoizedLyricLine.displayName = "MemoizedLyricLine";

const getSectionColorClass = (name: string): string => {
  if (!name) return 'border-zinc-300 text-zinc-500';
  const lower = name.toLowerCase();
  if (lower.includes('verse')) return 'border-[#71cbf4] text-[#4db3df] bg-[#eefaff]'; // Light Blue
  if (lower.includes('chorus')) return 'border-[#fcbca0] text-[#ea9772] bg-[#fff5f0]'; // Orange
  if (lower.includes('pre')) return 'border-[#fbd277] text-[#e0a82e] bg-[#fffbf0]'; // Yellow
  if (lower.includes('bridge')) return 'border-[#d0a7f1] text-[#aa73d7] bg-[#fbf5ff]'; // Purple
  if (lower.includes('intro') || lower.includes('outro')) return 'border-[#a7f1d0] text-[#69c79e] bg-[#f0fdf6]'; // Green
  return 'border-zinc-300 text-zinc-500 bg-zinc-50'; // Default Gray
};

// ✅ SURGICAL ADDITION: Web Audio API Engine for Zero-Latency Playback
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
  
  // Schedules it on the hardware timeline (0 means instantly)
  source.start(time); 
};

const playGuideCue = (rawSectionName: string) => {
  if (!rawSectionName) return;
  const cleanName = normalizeSectionNameToAudioFile(rawSectionName);
  if (cleanName) {
    playZeroLatencyAudio(cleanName, 0.85);
  }
};

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

const chordToRomanBase = (bassStr: string, activeKey: string): string => {
  const match = bassStr.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return bassStr;
  const chordRoot = match[1];
  const keyBase = activeKey.replace(/m$/, '');
  const rootIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(keyBase));
  const chordIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(chordRoot));
  if (rootIdx === -1 || chordIdx === -1) return bassStr;
  const diff = (chordIdx - rootIdx + 12) % 12;
  const romanBases = ["I", "♭II", "II", "♭III", "III", "IV", "♭V", "V", "♭VI", "VI", "♭VII", "VII"];
  return romanBases[diff] + match[2];
};

const chordToRoman = (chordStr: string, activeKey: string): string => {
  // Recursively handle slash chords (e.g., G/B -> I/III)
  if (chordStr.includes('/')) {
    const [main, bass] = chordStr.split('/');
    return `${chordToRoman(main, activeKey)}/${chordToRomanBase(bass, activeKey)}`;
  }

  const match = chordStr.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return chordStr;

  const chordRoot = match[1];
  let suffix = match[2];

  const keyBase = activeKey.replace(/m$/, '');
  const rootIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(keyBase));
  const chordIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(chordRoot));

  if (rootIdx === -1 || chordIdx === -1) return chordStr;

  const diff = (chordIdx - rootIdx + 12) % 12;
  const romanBases = ["I", "♭II", "II", "♭III", "III", "IV", "♭V", "V", "♭VI", "VI", "♭VII", "VII"];
  let roman = romanBases[diff];

  // Detect Minor or Diminished qualities and cast to lowercase
  if (suffix.match(/^m(?!aj)/)) {
    roman = roman.toLowerCase();
    suffix = suffix.replace(/^m/, '');
  } else if (suffix.startsWith('-')) {
    roman = roman.toLowerCase();
    suffix = suffix.replace(/^-/, '');
  } else if (suffix.startsWith('dim') || suffix.startsWith('°')) {
    roman = roman.toLowerCase();
  }

  return `${roman}${suffix}`;
};


export default function SetlistPerformanceRoomPage() {
  const router = useRouter();
  const params = useParams();
  const setlistId = params?.id as string;

  // Consume active profile states from your context simulation layer
  const { simulatedUserId, simulatedRole } = useEngine();

  const { isSynced, getGlobalTime } = useTimesync();
  

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

  // ✅ SURGICAL ADDITION: Dynamic Title Overflow Detection
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleTextRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const checkTitleOverflow = () => {
      if (titleContainerRef.current && titleTextRef.current) {
        const container = titleContainerRef.current;
        const textElement = titleTextRef.current;
        
        // Temporarily force the text to NOT truncate so we can measure its true physical width
        textElement.classList.remove("truncate");
        textElement.style.whiteSpace = "nowrap";

        const containerWidth = container.clientWidth;
        const textWidth = textElement.scrollWidth;
        
        const isOverflowing = textWidth > containerWidth;
        setIsTitleOverflowing(isOverflowing);
        
        if (isOverflowing) {
          // Pass the exact visible width to our CSS animation so it knows exactly how far to slide
          container.style.setProperty('--marquee-container-width', `${containerWidth}px`);
        } else {
          // If it fits, put truncate back just in case
          textElement.classList.add("truncate");
        }
      }
    };

    // Run measurement slightly after render to ensure fonts are fully painted
    const timer = setTimeout(checkTitleOverflow, 100);
    window.addEventListener('resize', checkTitleOverflow);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkTitleOverflow);
    };
  }, [activeSong?.title]);
  
  // Accessibility & Layout Preference Configurations
  const [lyricsFontSize, setLyricsFontSize] = useState<number>(16);
  const [showChords, setShowChords] = useState<boolean>(true); 
  const [chordFormat, setChordFormat] = useState<"Key" | "Numbers">("Key");
  const [isMetronomeSoundEnabled, setIsMetronomeSoundEnabled] = useState<boolean>(false); // ✅ Metronome Toggle State

  const [isSimplifiedMode, setIsSimplifiedMode] = useState<boolean>(false);
  const simplifiedProgressBarRef = useRef<HTMLDivElement | null>(null);

  const isMetronomeSoundEnabledRef = useRef<boolean>(false);
  useEffect(() => {
    isMetronomeSoundEnabledRef.current = isMetronomeSoundEnabled;
  }, [isMetronomeSoundEnabled]);

  // ✅ SURGICAL ADDITION: Latency Offset & Test Engine States
  const [audioLatencyOffsetMs, setAudioLatencyOffsetMs] = useState<number>(0);
  const [isTestingSync, setIsTestingSync] = useState<boolean>(false);
  const [testVisualBeat, setTestVisualBeat] = useState<number>(1);
  
  // ✅ SURGICAL FIX: Split the clock engine so audio and visuals can run on different timelines!
  const lastAudioBeatRef = useRef<number>(1);
  const lastVisualBeatRef = useRef<number>(1);

  

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false); 
  const [lineSpacing, setLineSpacing] = useState<number>(16); 
  const [isMdLockModalOpen, setIsMdLockModalOpen] = useState<boolean>(false); // ✅ SURGICAL FIX: Added modal state

  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState<boolean>(false);
  // ✅ SURGICAL ADDITION: Background loop for the Settings Modal Test Sync
  useEffect(() => {
    let reqId: number;
    const testAudioRef = { current: 1 };
    const testVisualRef = { current: 1 };
    
    if (isTestingSync) {
      initAudioContext();
      const startTime = performance.now();
      
      const tick = (timestamp: number) => {
        const elapsed = timestamp - startTime;
        
        // Audio runs on exact real-time (Simulating a standard 120 BPM test click)
        const audioBeat = Math.floor(elapsed / 500) % 4 + 1; 
        if (audioBeat !== testAudioRef.current) {
           testAudioRef.current = audioBeat;
           triggerMetronomeSound(audioBeat);
        }

        // Visuals run on delayed offset time
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

  // Safety: Stop the test engine immediately if the user closes the modal
  useEffect(() => {
    if (!isSettingsModalOpen) setIsTestingSync(false);
  }, [isSettingsModalOpen]);

  // ✅ SURGICAL ADDITION: Prevents the vocal cue from stuttering/repeating
  const hasPlayedCueRef = useRef<boolean>(false);

  // Presence State
  const [onlineUsers, setOnlineUsers] = useState<{ id: string; name: string; initials: string; bg: string; connectionId?: string; avatar?: string | null; isMD?: boolean; }[]>([]);
  const [localPresenceUser, setLocalPresenceUser] = useState<{ id: string; name: string; initials: string; bg: string; connectionId?: string; avatar?: string | null; isMD?: boolean; } | null>(null);
 
  // ✅ SURGICAL ADDITION: Admin Auth State
  const [isAdmin, setIsAdmin] = useState(false);


  useEffect(() => {
    async function fetchCurrentPresenceIdentity() {
      // 1. Prioritize the REAL Supabase authenticated user first
      let targetUserId = null;
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        targetUserId = user.id;
      } else if (simulatedUserId && simulatedUserId !== "00000000-0000-0000-0000-000000000000") {
        targetUserId = simulatedUserId;
      }

      if (targetUserId) {
        // ✅ SURGICAL FIX: Ask the database for the official role column!
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url, role")
          .eq("id", targetUserId)
          .maybeSingle();

        // 2. The Database is the primary source of truth. 
        // (We only let the DevSimulator override if you actively toggled it to 'admin')
        const isDbAdmin = profile?.role === "admin";
        setIsAdmin(simulatedRole === "admin" || (simulatedRole !== "member" && isDbAdmin));

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
          isMD: false
        };

        localPresenceUserRef.current = identityPayload;
        setLocalPresenceUser(identityPayload);
      }
    }
    fetchCurrentPresenceIdentity();
  }, [simulatedUserId, simulatedRole]);

  // Tracking references
  const localPresenceUserRef = useRef<any>(null);
  const isChannelSubscribedRef = useRef<boolean>(false);
  const mdSectionStartTimeRef = useRef<number | null>(null);

  // ✅ SURGICAL ADDITION: Direct DOM Pointers for the Metronome
  const metronomeRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

  // ✅ DOM Mutator: Bypasses React to instantly paint the metronome colors
  const updateMetronomeUI = (activeBeat: number, isPlaying: boolean) => {
    metronomeRefs.current.forEach((el, index) => {
      if (!el) return;
      const beatNum = index + 1;
      
      // Wipe existing color classes
      el.className = "w-6 h-6 flex items-center justify-center font-mono font-black text-[10px] rounded border transition-all duration-75 select-none";

      if (isPlaying && activeBeat === beatNum) {
        if (beatNum === 4) {
          el.classList.add("bg-[#faba37]", "text-white", "border-[#e0a22b]");
        } else {
          el.classList.add("bg-blue-600", "text-white", "border-blue-500");
        }
      } else {
        el.classList.add("bg-white", "text-zinc-200", "border-zinc-100");
      }
    });
  };

  // ✅ SURGICAL ADDITION: High-Performance Web Audio Metronome
  useEffect(() => {
    if (typeof window !== "undefined") {
      fetchAndDecodeAudio("/sound_files/metronome_blip_1.wav", "metronome_1");
      fetchAndDecodeAudio("/sound_files/metronome_blip_2.wav", "metronome_2");
    }
  }, []);

  const triggerMetronomeSound = (beatNum: number, time: number = 0) => {
  if (!isMetronomeSoundEnabledRef.current) return;
  const targetKey = beatNum === 1 ? "metronome_1" : "metronome_2";
  playZeroLatencyAudio(targetKey, 1.0, time);
};
 
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

  const pendingQuantizedJumpRef = useRef<{ trackIndex: number; sectionIndex: number; jumpTime: number } | null>(null);

  // ✅ SURGICAL REFACTOR: Smart dynamic preloader decodes directly to RAM
  useEffect(() => {
    if (typeof window === "undefined" || tracksList.length === 0) return;
    
    const uniqueRequiredFiles = new Set<string>();

    tracksList.forEach(track => {
      const structure = track.custom_structure || [];
      structure.forEach(section => {
        const fileName = normalizeSectionNameToAudioFile(section.section_name);
        if (fileName) uniqueRequiredFiles.add(fileName);
      });
    });

    uniqueRequiredFiles.forEach(fileName => {
      fetchAndDecodeAudio(`/sound_files/${fileName}.wav`, fileName);
    });
    
  }, [tracksList]);

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

  // ✅ SURGICAL ADDITION: Quick Jump Scrubber States & Engine
  const [isScrubberActive, setIsScrubberActive] = useState(false);
  const [scrubberHoverIndex, setScrubberHoverIndex] = useState<number | null>(null);

  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsScrubberActive(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleScrubberPointerMove(e);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // If the user isn't holding down, don't do anything
    if (e.buttons === 0 && e.pointerType === "mouse") {
      setIsScrubberActive(false);
      return;
    }
    
    // Find the exact HTML element currently sitting under the user's thumb
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const indexStr = element?.getAttribute("data-scrubber-index");
    
    if (indexStr !== null && indexStr !== undefined) {
      setScrubberHoverIndex(parseInt(indexStr, 10));
    }
  };

  const handleScrubberPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsScrubberActive(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    // ✅ SURGICAL FIX: Scroll the view to the section instead of changing the active playhead!
    if (scrubberHoverIndex !== null) {
      const targetSection = sections[scrubberHoverIndex];
      if (targetSection) {
        const targetElement = sectionRefs.current[targetSection.id];
        if (targetElement) {
          // Pause the auto-scroll engine briefly so it doesn't fight the user
          isAutoScrollingRef.current = true;
          if ((window as any)._autoScrollTimeout) clearTimeout((window as any)._autoScrollTimeout);

          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
          setShowSyncBack(true); // Pop up the Sync Back button

          (window as any)._autoScrollTimeout = setTimeout(() => {
            isAutoScrollingRef.current = false;
          }, 1500); // Give them 1.5 seconds to look at it before the engine is allowed to snap back
        }
      }
      setScrubberHoverIndex(null);
    }
  };

  // ✅ SURGICAL ADDITION: Broadcast playmode state to the global Sidebar to hide it
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: isPlayingFlow }));
    }
  }, [isPlayingFlow]);

  // ✅ SURGICAL ADDITION: Screen Wake Lock Engine
  // Prevents iPads and phones from going to sleep while on stage
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        // Only request if the browser natively supports it
        if ("wakeLock" in navigator) {
          wakeLock = await (navigator as any).wakeLock.request("screen");
          console.log("Wake Lock active: Screen will not sleep.");
          
          wakeLock.addEventListener("release", () => {
            console.log("Wake Lock released (Tab hidden or battery critical).");
          });
        }
      } catch (err: any) {
        console.warn(`Wake lock failed (likely low battery mode): ${err.message}`);
      }
    };

    requestWakeLock();

    // FAILSAFE: Mobile OS's aggressively kill the wake lock if the user swipes down the 
    // control center or minimizes the browser. We MUST re-acquire it when they come back.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Clean up and release the OS hardware lock when they leave the live page
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLock !== null) {
        wakeLock.release().catch(console.error);
      }
    };
  }, []);

  // Failsafe: Ensure nav comes back if user unmounts/leaves the page while playing
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("onpraise-playmode", { detail: false }));
      }
    };
  }, []);

  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [currentBeat, setCurrentBeat] = useState<number>(1);
  
  // ✅ SURGICAL ADDITION: Line-by-Line Tracking States
  const [activeLineIndex, setActiveLineIndex] = useState<number>(0);
  const activeLineIndexRef = useRef<number>(0);

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
  
  // Need to cache AST tree so clock execution can read line counts without triggering hooks
  const astTreeRef = useRef<CompiledSectionToken[]>([]);

  // Layout Container Sizing Style References
  const backdropProgressRef = useRef<HTMLDivElement | null>(null);
  const accentProgressBarRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const currentTrackIndexRef = useRef<number>(0);

  useEffect(() => { activeSongRef.current = activeSong; }, [activeSong]);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  useEffect(() => { tracksListRef.current = tracksList; }, [tracksList]);
  
  useEffect(() => { playingTrackIndexRef.current = playingTrackIndex; }, [playingTrackIndex]);
  useEffect(() => { queuedTrackIndexRef.current = queuedTrackIndex; }, [queuedTrackIndex]);
  useEffect(() => { queuedSectionIndexRef.current = queuedSectionIndex; }, [queuedSectionIndex]);
  useEffect(() => { currentTrackIndexRef.current = currentTrackIndex; }, [currentTrackIndex]);

  useEffect(() => {
    async function fetchCurrentPresenceIdentity() {
      let targetUserId = simulatedUserId;

      if (!targetUserId || targetUserId === "00000000-0000-0000-0000-000000000000") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) targetUserId = user.id;
      }

      if (targetUserId) {
              // ✅ SURGICAL FIX: Added 'role' to the select query
              const { data: profile } = await supabase
                .from("profiles")
                .select("full_name, avatar_url, role") 
                .eq("id", targetUserId)
                .maybeSingle();

              // Fallback to actual DB role if the simulator isn't currently overriding it
              if (!simulatedRole && profile?.role === "admin") {
                setIsAdmin(true);
              }

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
          isMD: false
        };

        localPresenceUserRef.current = identityPayload;
        setLocalPresenceUser(identityPayload);
      }
    }
    fetchCurrentPresenceIdentity();
  }, [simulatedUserId]);

  useEffect(() => {
    if (!setlistId || !localPresenceUser) return; 

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
        if (payload.action === "START") {
          const targetTrackIdx = payload.trackIndex !== undefined ? payload.trackIndex : currentTrackIndex;
          isPlayingRef.current = true;
          setIsPlayingFlow(true);
          executeJumpNow(targetTrackIdx, payload.sectionIndex, payload.mdSectionStartTime);
        } 
        else if (payload.action === "STOP") {
          executeLocalResetSequence();
        } 
        else if (payload.action === "JUMP") {
          const jumpTime = payload.mdSectionStartTime || getGlobalTime();
          const timeUntilJump = jumpTime - getGlobalTime();
          
          // ✅ SURGICAL FIX: If the MD broadcasted a quantized future jump, queue it up!
          if (isPlayingRef.current && timeUntilJump > 50) {
            pendingQuantizedJumpRef.current = { trackIndex: payload.trackIndex ?? currentTrackIndexRef.current, sectionIndex: payload.sectionIndex, jumpTime };
            
            // Show the purple visual queue badge so the musicians know what's coming
            setQueuedTrackIndex(payload.trackIndex ?? currentTrackIndexRef.current);
            setQueuedSectionIndex(payload.sectionIndex);
            queuedTrackIndexRef.current = payload.trackIndex ?? currentTrackIndexRef.current;
            queuedSectionIndexRef.current = payload.sectionIndex;
          } else {
            // Immediate retroactive jump
            executeJumpNow(payload.trackIndex ?? currentTrackIndexRef.current, payload.sectionIndex, jumpTime);
          }
        }
        else if (payload.action === "TRACK_CHANGE") {
          mountTargetSetlistTrackIndex(payload.trackIndex, tracksListRef.current, true, true);
        }
        else if (payload.action === "QUEUE") {
          setQueuedTrackIndex(payload.trackIndex);
          setQueuedSectionIndex(payload.sectionIndex);
        }
        // ✅ SURGICAL FIX: Catch takeover events and force the old MD to step down!
        else if (payload.action === "MD_TAKEOVER") {
          if (localPresenceUserRef.current?.isMD && localPresenceUserRef.current.id !== payload.newMdId) {
            // We were the MD, but someone else just claimed it. Step down immediately.
            const downgradedPayload = { ...localPresenceUserRef.current, isMD: false };
            setLocalPresenceUser(downgradedPayload);
            localPresenceUserRef.current = downgradedPayload;
            
            // Update our presence in the lobby to remove our crown
            if (isChannelSubscribedRef.current) {
              lobbyChannel.track(downgradedPayload);
            }
            
            // Optional: Stop local playback so the new MD has a clean slate
            executeLocalResetSequence();
            alert("Music Director control was taken by another user.");
          }
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          isChannelSubscribedRef.current = true; 
          lobbyChannel.track(localPresenceUser);
        }
      });

    realtimeChannelRef.current = lobbyChannel;

    return () => {
      if (lobbyChannel) supabase.removeChannel(lobbyChannel);
    };
  }, [setlistId, localPresenceUser]);

  // ✅ SURGICAL REFACTOR: A unified engine to seamlessly execute jumps without freezing the clock
  const executeJumpNow = (targetTrackIdx: number, targetSectionIdx: number, jumpTime: number) => {
    // 1. Handle Track Change if necessary
    if (targetTrackIdx !== undefined && targetTrackIdx !== playingTrackIndexRef.current) {
      mountTargetSetlistTrackIndex(targetTrackIdx, tracksListRef.current, false, true);
    }

    // 2. Set the exact global time anchor
    if (jumpTime) mdSectionStartTimeRef.current = jumpTime;

    // 3. Update Section Pointers
    currentSectionIndexRef.current = targetSectionIdx;
    setCurrentSectionIndex(targetSectionIdx);
    
    // 4. Reset Clock Math
    lastBeatRef.current = 0;
    lastAudioBeatRef.current = 0; 
    lastVisualBeatRef.current = 0; 
    updateMetronomeUI(1, true); 
    activeLineIndexRef.current = 0;
    setActiveLineIndex(0);

    // 5. Clear ALL Queues
    setQueuedTrackIndex(null);
    setQueuedSectionIndex(null);
    queuedTrackIndexRef.current = null;
    queuedSectionIndexRef.current = null;
    pendingQuantizedJumpRef.current = null;
    
    // ✅ SURGICAL FIX: Reset the cue lock so the NEXT section gets its 4-beat warning!
    hasPlayedCueRef.current = false; 

    // 6. Reset UI Progress Bars
    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
    
    // 7. Voice Cues & Sync Math
    if (isPlayingRef.current) {
      // ✅ SURGICAL FIX: Removed playGuideCue from here to stop the echo effect!
      // The cue will now properly play only in the last 4 beats of the preceding section via the animation loop.

      const apparentLatency = getGlobalTime() - jumpTime;
      if (Math.abs(apparentLatency) < 2000) {
        sectionStartTimeRef.current = performance.now() - apparentLatency;
      } else {
        sectionStartTimeRef.current = performance.now();
      }
    }
  };

  function executeLocalResetSequence() {
    isPlayingRef.current = false;
    setIsPlayingFlow(false);
    hasPlayedCueRef.current = false;
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    currentSectionIndexRef.current = 0;
    lastBeatRef.current = 0;
    activeLineIndexRef.current = 0;
    
    setCurrentSectionIndex(0);
    updateMetronomeUI(1, false); // ✅ FAST DOM MUTATION
    setActiveLineIndex(0);
    setQueuedTrackIndex(null);
    setQueuedSectionIndex(null);

    if (backdropProgressRef.current) backdropProgressRef.current.style.transform = "scaleX(0)";
    if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = "scaleX(0)";
  }

  useEffect(() => {
    let isCurrentActiveMount = true;

    async function initializePerformanceEnvironment() {
      if (!setlistId) {
        setLoadingStatus("Waiting for Next.js route parameters to hydrate...");
        return;
      }

      try {
        const { data: setlistRow, error: setlistError } = await supabase
          .from("setlists")
          .select("name")
          .eq("id", setlistId)
          .maybeSingle();
        
        if (setlistRow?.name) setNewSetlistName(setlistRow.name);

        const primaryResponse = await supabase
          .from("setlist_songs")
          .select("id, sequence_order, start_time, custom_key, custom_structure, songs (*)")
          .eq("setlist_id", setlistId)
          .order("sequence_order", { ascending: true });

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
        setLoadingStatus(`Critical Crash: ${err?.message || "Check connection parameters"}`);
      }
    }

    initializePerformanceEnvironment();

    return () => {
      isCurrentActiveMount = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [setlistId]);

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
      // ✅ SURGICAL FIX: Only the active MD can broadcast track changes to the band
      if (localPresenceUser?.isMD && realtimeChannelRef.current) {
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
      
      // ✅ SURGICAL FIX: Only MD broadcasts the automatic track advancement
      if (localPresenceUserRef.current?.isMD && realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: "broadcast",
          event: "lobby_sync",
          payload: { action: "TRACK_CHANGE", trackIndex: nextTrackIndex }
        });
      }
      setTimeout(() => {
        isPlayingRef.current = true;
        setIsPlayingFlow(true);
        if (localPresenceUserRef.current?.isMD) {
          mdSectionStartTimeRef.current = getGlobalTime();
        }
      }, 120);
    } else {
      handleResetFlowTrigger();
    }
  }

  // ✅ SURGICAL REFACTOR: Now anchors directly to the active *line* if playing, or the section if not playing
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

    if (sections.length === 0 || !sections[currentSectionIndex]) return;

    // Target the specific lyrics line if playing, otherwise fallback to the section container
    const lineElementId = `line-${currentSectionIndex}-${activeLineIndex}`;
    const targetElement = isPlayingRef.current 
      ? document.getElementById(lineElementId) || sectionRefs.current[sections[currentSectionIndex].id]
      : sectionRefs.current[sections[currentSectionIndex].id];

    if (targetElement) {
      isAutoScrollingRef.current = true; 
      
      // ✅ Lock the element directly to the center of the screen
      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });

      setShowSyncBack(false); 
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 550);
    }
  };

  // ✅ AUTO-SCROLL EFFECT FIRES WHEN LINE CHANGES
  useEffect(() => {
    if (isPlayingFlow && !showSyncBack) {
      const activeLineId = `line-${currentSectionIndex}-${activeLineIndex}`;
      const targetLine = document.getElementById(activeLineId);
      
      if (targetLine) {
        // ✅ SURGICAL FIX: Clear pending scroll locks so rapid section transitions are never ignored!
        if ((window as any)._autoScrollTimeout) clearTimeout((window as any)._autoScrollTimeout);
        isAutoScrollingRef.current = true;
        
        targetLine.scrollIntoView({ behavior: "smooth", block: "center" });
        
        (window as any)._autoScrollTimeout = setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 550); 
      }
    }
  }, [activeLineIndex, currentSectionIndex, isPlayingFlow]);

  // ✅ SURGICAL PERFORMANCE FIX: Hardware-Accelerated IntersectionObserver
  useEffect(() => {
    const containerNode = scrollContainerRef.current;
    if (!containerNode || !isPlayingFlow) return;

    if (currentTrackIndex !== playingTrackIndexRef.current) {
      setShowSyncBack(true);
      return;
    }

    const activeLineId = `line-${currentSectionIndex}-${activeLineIndex}`;
    const targetElement = document.getElementById(activeLineId);

    if (!targetElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        
        // Ignore the trigger if the engine itself is auto-scrolling
        if (isAutoScrollingRef.current) return;

        // If the line leaves the 60% boundary, it is no longer intersecting
        if (!entry.isIntersecting) {
          setShowSyncBack(true);
        } else {
          setShowSyncBack(false);
        }
      },
      {
        root: containerNode,
        // ✅ The Magic Box: Shrinks the detection zone by 20% on top and bottom
        rootMargin: "-20% 0px -20% 0px", 
        threshold: 0 // Triggers the exact millisecond it crosses the line
      }
    );

    observer.observe(targetElement);

    return () => {
      observer.disconnect();
    };
  }, [isPlayingFlow, currentSectionIndex, activeLineIndex, currentTrackIndex]);

  // ==========================================================
  // --- COMPOSER ENGINE HARDWARE ANIMATION TIMELINE LOOP -----
  // ==========================================================
  useEffect(() => {
    // ✅ SURGICAL FIX 1: Use Refs here so the engine doesn't rely on state variables
    if (!isPlayingFlow || !activeSongRef.current || sectionsRef.current.length === 0) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    // Only set the initial start time when the user physically clicks "Play"
    if (pauseOffsetMsRef.current > 0) {
      sectionStartTimeRef.current = performance.now() - pauseOffsetMsRef.current;
    } else {
      sectionStartTimeRef.current = performance.now();
    }
    lastBeatRef.current = 0;

    const clockExecutionTick = (timestamp: number) => {
      if (!isPlayingRef.current || !activeSongRef.current || sectionsRef.current.length === 0) return;
      
      if (pendingQuantizedJumpRef.current) {
        const { trackIndex, sectionIndex, jumpTime } = pendingQuantizedJumpRef.current;
        if (getGlobalTime() >= jumpTime) {
          executeJumpNow(trackIndex, sectionIndex, jumpTime);
          // Let the rest of the loop continue normally! It will calculate using the brand new section data.
        }
      }
      // ✅ SURGICAL FIX 2: Check MD status via Ref every frame so we don't need it in the dependency array
      const isCurrentlyMD = localPresenceUserRef.current?.isMD === true;

      const song = playingSongRef.current || activeSongRef.current; 
      const secs = playingSectionsRef.current;
      const idx = currentSectionIndexRef.current;

      const currentSection = secs[idx];
      if (!currentSection) {
        handleAdvanceToNextSetlistTrack();
        return;
      }

      // ==========================================
      // 1. CALCULATE TRUE SECTION & LOOP TIMINGS
      // ==========================================
      const beatSpeedMsCurrent = (60 / (song.tempo || 75)) * 1000;
      const timings = song.section_timings?.[currentSection.section_name] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
      
      const sectionMultiplier = (timings.repeats || 0) + 1; // e.g., repeats: 4 means play 5 times total

      // ✅ SURGICAL FIX: Extract head and tail bounds (converting measures to beats)
      const headBeats = (timings.head_m || 0) * 4;
      const tailBeats = (timings.tail_m || 0) * 4;

      let totalBeats = (timings.measures * 4) + (timings.beats || 0);
      let loopBeats = totalBeats / sectionMultiplier;

      const lineTimingsObj = timings.line_timings;
      const parsedLinesCount = astTreeRef.current[idx]?.lines.length || 1;

      // Check if we have specific custom line timings mapped out
      let calculatedLoopBeats = 0;
      const lineBeatsArray: number[] = [];
      
      if (lineTimingsObj && Object.keys(lineTimingsObj).length > 0) {
        for (let i = 0; i < parsedLinesCount; i++) {
          const t = lineTimingsObj[String(i)] || { measures: 0, beats: 0 };
          const base = (t.measures * 4) + (t.beats || 0); // Base length of this specific line
          lineBeatsArray.push(base);
          calculatedLoopBeats += base;
        }
        if (calculatedLoopBeats > 0) {
          loopBeats = calculatedLoopBeats;
          totalBeats = loopBeats * sectionMultiplier; 
        }
      }

      // ✅ SURGICAL FIX: Add the head and tail padding to the absolute section duration
      totalBeats += headBeats + tailBeats;
      const totalDurationMs = totalBeats * beatSpeedMsCurrent;
      
      // ==========================================
      // 2. ABSOLUTE CLOCK ELAPSED MATH & LOOKAHEAD
      // ==========================================
      
      if (!mdSectionStartTimeRef.current) return;

      // ✅ SURGICAL FIX 1: Pure Network Sync. No clock drift!
      let elapsedMs = getGlobalTime() - mdSectionStartTimeRef.current;
      
      // If elapsed is negative, it means the MD broadcasted a future start time 
      // and we are just waiting for that exact physical millisecond to arrive.
      if (elapsedMs < 0) {
        animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
        return; 
      }
      
      // Split Audio (Real) Time and Visual (Delayed) Time
      const trueElapsedMs = elapsedMs;
      const visualElapsedMs = Math.max(0, elapsedMs - audioLatencyOffsetMs);
      
      // 1. PROGRESS BAR (Visual Time)
      const progressRatio = Math.min(1, visualElapsedMs / totalDurationMs);
      if (backdropProgressRef.current) backdropProgressRef.current.style.transform = `scaleX(${progressRatio})`;
      if (accentProgressBarRef.current) accentProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;

      // ✅ SURGICAL ADDITION: Drive the new Musician Stack progress bar
      if (simplifiedProgressBarRef.current) simplifiedProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;

      // ✅ SURGICAL FIX 2: THE HARDWARE LOOKAHEAD SCHEDULER (Immune to React lag)
      const lookaheadMs = 150; 
      const timeToNextBeatMs = beatSpeedMsCurrent - (trueElapsedMs % beatSpeedMsCurrent);

      // If the next beat is going to happen within our 150ms lookahead window...
      if (timeToNextBeatMs <= lookaheadMs) {
        const absoluteBeatIndex = Math.floor(trueElapsedMs / beatSpeedMsCurrent) + 1;
        
        if (absoluteBeatIndex > lastAudioBeatRef.current) {
          lastAudioBeatRef.current = absoluteBeatIndex;
          const nextBeatPulse = (absoluteBeatIndex % 4) + 1;
          
          // Calculate the exact hardware time it should play, and hand it off to the Web Audio API!
          const audioContextTimeDelay = timeToNextBeatMs / 1000;
          const scheduleTime = (globalAudioContext?.currentTime || 0) + audioContextTimeDelay;
          
          triggerMetronomeSound(nextBeatPulse, scheduleTime);
        }
      }

      // 3. VISUAL METRONOME UI (Runs on delayed Visual Time)
      const currentVisualBeatPulse = Math.floor(visualElapsedMs / beatSpeedMsCurrent) % 4 + 1;
      if (currentVisualBeatPulse !== lastVisualBeatRef.current) {
        lastVisualBeatRef.current = currentVisualBeatPulse;
        updateMetronomeUI(currentVisualBeatPulse, true); 
      }
      
      // Guide Cues trigger based on True Time
      const remainingBeats = (totalDurationMs - trueElapsedMs) / beatSpeedMsCurrent;
      
      // If we are in the last 4 beats, and haven't played the cue yet
      if (remainingBeats <= 4.05 && remainingBeats > 0 && !hasPlayedCueRef.current) {
        hasPlayedCueRef.current = true; // Lock it so it only plays once
        
        let nextSectionName = "";
        
        if (queuedSectionIndexRef.current !== null && queuedTrackIndexRef.current !== null) {
          const queuedTrack = tracksListRef.current[queuedTrackIndexRef.current];
          if (queuedTrack && queuedTrack.custom_structure) {
             nextSectionName = queuedTrack.custom_structure[queuedSectionIndexRef.current]?.section_name;
          }
        } else {
          // Scenario 1: Normal playback flow
          const nextSectionIdx = currentSectionIndexRef.current + 1;
          if (nextSectionIdx < secs.length) {
             nextSectionName = secs[nextSectionIdx].section_name;
          } else {
             // ✅ SURGICAL FIX: We are holding at the end of the song, so cue the CURRENT section to loop!
             nextSectionName = secs[currentSectionIndexRef.current].section_name;
          }
        }
        
        if (nextSectionName) playGuideCue(nextSectionName);
      }

      // ==========================================
      // 3. WRAP-AROUND TELEPROMPTER CURSOR
      // ==========================================
      const safeDuration = Math.max(1, totalDurationMs);
      const cappedElapsedMs = Math.max(0, Math.min(elapsedMs, safeDuration - 1));
      const sectionAbsoluteBeat = Math.floor(cappedElapsedMs / beatSpeedMsCurrent);
      
      // ✅ SURGICAL FIX: Offset the cursor to hold during Head, loop normally, and hold during Tail
      const coreAbsoluteBeat = Math.max(0, sectionAbsoluteBeat - headBeats);
      const maxCoreBeats = loopBeats * sectionMultiplier;
      const cappedCoreBeat = Math.min(coreAbsoluteBeat, Math.max(0, maxCoreBeats - 1));

      let targetLineIdx = 0;

      if (calculatedLoopBeats > 0) {
        const beatWithinCurrentLoop = cappedCoreBeat % loopBeats;
        
        let beatAccumulator = 0;
        for (let i = 0; i < parsedLinesCount; i++) {
          beatAccumulator += lineBeatsArray[i];
          if (beatWithinCurrentLoop < beatAccumulator) {
            targetLineIdx = i;
            break;
          }
          targetLineIdx = i; // Fallback so it holds on the last line
        }
      } else {
        const beatsPerLine = loopBeats / parsedLinesCount;
        const beatWithinCurrentLoop = cappedCoreBeat % loopBeats;
        targetLineIdx = Math.floor(beatWithinCurrentLoop / beatsPerLine);
        if (targetLineIdx >= parsedLinesCount) targetLineIdx = parsedLinesCount - 1;
      }

      if (activeLineIndexRef.current !== targetLineIdx) {
        activeLineIndexRef.current = targetLineIdx;
        setActiveLineIndex(targetLineIdx);
      }

      // ==========================================
      // 4. NEXT SECTION TRANSITION HANDLING
      // ==========================================
      if (elapsedMs >= totalDurationMs) {
        const harmsActiveQueue = queuedSectionIndexRef.current !== null && queuedTrackIndexRef.current !== null;
        let nextTrackIdx = playingTrackIndexRef.current;
        let nextSectionIdx = idx + 1;

        if (harmsActiveQueue) {
          nextTrackIdx = queuedTrackIndexRef.current as number;
          nextSectionIdx = queuedSectionIndexRef.current as number;
        } else if (nextSectionIdx >= secs.length) {
          // ✅ SURGICAL FIX: Loop the last section infinitely!
          nextSectionIdx = idx; 
        }

        const jumpTime = mdSectionStartTimeRef.current + totalDurationMs;
        executeJumpNow(nextTrackIdx, nextSectionIdx, jumpTime);

        if (isCurrentlyMD && realtimeChannelRef.current) {
          realtimeChannelRef.current.send({
            type: "broadcast", event: "lobby_sync",
            payload: { action: "JUMP", trackIndex: nextTrackIdx, sectionIndex: nextSectionIdx, mdSectionStartTime: jumpTime }
          });
        }
      }

      animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
    };

     

    animationFrameRef.current = requestAnimationFrame(clockExecutionTick);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  // ✅ SURGICAL FIX 3: Stripped out all state variables! The engine never tears itself down during a song now.
  }, [isPlayingFlow]);

  function handleToggleFlowPlaybackState() {
    initAudioContext();
    if (!localPresenceUser?.isMD) {
      setIsMdLockModalOpen(true);
      return;
    }
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

      const startTimestamp = getGlobalTime() + 150; 
      mdSectionStartTimeRef.current = startTimestamp;

      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: "broadcast",
          event: "lobby_sync",
          payload: { 
            action: "START", 
            trackIndex: currentTrackIndex, 
            sectionIndex: currentSectionIndex,
            mdSectionStartTime: startTimestamp 
          }
        });
      }
    }
  }

  function handleResetFlowTrigger() {
    executeLocalResetSequence();
    // ✅ SURGICAL FIX: Only MD can broadcast the STOP command
    if (localPresenceUser?.isMD && realtimeChannelRef.current) {
      realtimeChannelRef.current.send({
        type: "broadcast",
        event: "lobby_sync",
        payload: { action: "STOP" }
      });
    }
  }

  function handleSectionInteractiveSelection(index: number) {
    if (isReadOnlyMode) return; 
    if (!isPlayingFlow) {
      const jumpTime = getGlobalTime() + 150;
      executeJumpNow(currentTrackIndex, index, jumpTime);
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: "broadcast", event: "lobby_sync",
          payload: { action: "JUMP", trackIndex: currentTrackIndex, sectionIndex: index, mdSectionStartTime: jumpTime }
        });
      }
      return;
    }

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      
      // ✅ SURGICAL FIX: Restored the Double-Click Queue Logic!
      setQueuedTrackIndex(currentTrackIndex);
      setQueuedSectionIndex(index);
      queuedTrackIndexRef.current = currentTrackIndex;
      queuedSectionIndexRef.current = index;
      
      // Cancel the pending quantized jump since we upgraded to a full section queue
      pendingQuantizedJumpRef.current = null;

      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: "broadcast", event: "lobby_sync",
          payload: { action: "QUEUE", trackIndex: currentTrackIndex, sectionIndex: index }
        });
      }
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        
        let jumpTime = getGlobalTime() + 150;
        const targetTrackIdx = currentTrackIndex;

        // Quantize the jump to the next measure!
        if (mdSectionStartTimeRef.current && activeSongRef.current && isPlayingRef.current) {
          const beatSpeedMs = (60 / (activeSongRef.current.tempo || 75)) * 1000;
          const measureDurationMs = beatSpeedMs * 4; 
          const elapsed = getGlobalTime() - mdSectionStartTimeRef.current;
          
          const timeToNextMeasure = measureDurationMs - (elapsed % measureDurationMs);
          jumpTime = getGlobalTime() + timeToNextMeasure;

          // Push the jump to the pending engine
          pendingQuantizedJumpRef.current = { trackIndex: targetTrackIdx, sectionIndex: index, jumpTime };
          
          // Show the purple queue visual immediately for the MD
          setQueuedTrackIndex(targetTrackIdx);
          setQueuedSectionIndex(index);
          queuedTrackIndexRef.current = targetTrackIdx;
          queuedSectionIndexRef.current = index;

          // ✅ SURGICAL FIX: Trigger the vocal cue instantly on single-click, since the jump happens within 1 measure!
          const targetSec = sectionsRef.current[index];
          if (targetSec) playGuideCue(targetSec.section_name);
          hasPlayedCueRef.current = true; // Lock it so the natural loop doesn't double-fire

        } else {
          executeJumpNow(targetTrackIdx, index, jumpTime);
        }

        if (realtimeChannelRef.current) {
          realtimeChannelRef.current.send({
            type: "broadcast", event: "lobby_sync",
            payload: { action: "JUMP", trackIndex: targetTrackIdx, sectionIndex: index, mdSectionStartTime: jumpTime }
          });
        }
      }, 250);
    }
  }

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
    
    lastBeatRef.current = 0;
    updateMetronomeUI(1, isPlayingRef.current); // ✅ FAST DOM MUTATION
    
    activeLineIndexRef.current = 0;
    setActiveLineIndex(0);

    // ✅ Reset the cue lock so the end of this new section can trigger the next cue
    hasPlayedCueRef.current = false; 

    if (isPlayingRef.current && activeSong) {
      // ✅ SCENARIO 2: Immediate fast-jump playback cue
      const targetSec = sections[index] || sectionsRef.current[index];
      if (targetSec) playGuideCue(targetSec.section_name);

      sectionStartTimeRef.current = performance.now();
      const activeSection = sections[index];
      if (activeSection) {
        const timings = activeSong.section_timings?.[activeSection.section_name] || { measures: 4, beats: 0, head_m: 0, tail_m: 0 };
        totalBeatsRef.current = (timings.measures * 4) + (timings.beats || 0) + ((timings.head_m || 0) * 4) + ((timings.tail_m || 0) * 4);
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

  async function handleModalAppendNewSectionItem(sectionName: string) {
    if (!activeSong) return;

    // 1. Try to find the content in the current active timeline first
    let sectionContent = sections.find(s => s.section_name === sectionName)?.content;

    // 2. If it was completely removed from the timeline, fetch the original lyrics from the master database!
    if (!sectionContent || sectionContent.trim() === "") {
      const { data } = await supabase
        .from("song_sections")
        .select("content")
        .eq("song_id", activeSong.id)
        .eq("section_name", sectionName)
        .maybeSingle();
        
      if (data && data.content) {
        sectionContent = data.content;
      }
    }

    const newBlock: ArrangementSection = {
      id: `local-override-${Date.now()}-${Math.random()}`,
      section_name: sectionName,
      content: sectionContent || " "
    };

    const workingBlocks = [...sections, newBlock];
    setSections(workingBlocks);
    saveMutatedStructurePayload(workingBlocks);
    handleResetFlowTrigger();
  }
  // ✅ SURGICAL ADDITION: Dynamic context-aware section catalog
  const availableSectionNames = useMemo(() => {
    const names = new Set<string>();
    
    // Pull every section officially defined in the master timing dictionary
    if (activeSong?.section_timings) {
      Object.keys(activeSong.section_timings).forEach(k => names.add(k));
    }
    // Fallback: Also include anything currently in the timeline
    sections.forEach(s => names.add(s.section_name));
    
    const presetOrder = ["Intro", "Verse 1", "Verse 2", "Verse 3", "Verse 4", "Pre-Chorus", "Chorus", "Chorus 1", "Chorus 2", "Bridge", "Instrumental", "Interlude", "Tag", "Outro"];
    
    return Array.from(names).sort((a, b) => {
      const idxA = presetOrder.indexOf(a);
      const idxB = presetOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [activeSong, sections]);

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
            // ✅ SURGICAL PERFORMANCE FIX: Transpose here ONCE in memory, not 8x a second in the UI!
            const rawChord = match[1];
            const finalChord = runtimeSemitoneDelta !== 0 ? transposeBracketContent(rawChord, runtimeSemitoneDelta) : rawChord;
            chordsList.push(finalChord);
          }
          const wordText = chunk.replace(/\[[^\]]+\]/g, "");
          return { chords: chordsList, word: wordText };
        });

        return { words: wordsTokens, comment: commentText };
      });

      return { id: section.id, section_name: section.section_name, lines: linesArray };
    });
  }, [sections, runtimeSemitoneDelta]); // ✅ Added runtime dependency
  
  // ✅ Update AST cache dependency
  useEffect(() => {
    astTreeRef.current = memoizedSongAstTree;
  }, [memoizedSongAstTree]);

  const displayedOnlineUsers = useMemo(() => {
    const usersMap = new Map();
    onlineUsers.forEach((user) => { if (user.id) usersMap.set(user.id, user); });
    if (localPresenceUser) { usersMap.set(localPresenceUser.id, localPresenceUser); }
    return Array.from(usersMap.values());
  }, [onlineUsers, localPresenceUser]);

  if (loading) {
  return <GlobalLoader message="LOADING SETLIST..." />;
}

  const highlightedTargetSectionName = sections[currentSectionIndex]?.section_name || "FLOW";
  const upcomingTrackItem = tracksList[currentTrackIndex + 1] || null;

  const isCurrentlyMD = localPresenceUser?.isMD === true;
  const activeMDConnection = onlineUsers.find(u => u.isMD && u.id !== localPresenceUser?.id);
  const isReadOnlyMode = !isCurrentlyMD && (activeMDConnection !== undefined);

  const handleToggleMusicDirectorMode = () => {
    if (!localPresenceUser) return;

    const alternateMD = onlineUsers.find(u => u.isMD && u.id !== localPresenceUser.id);
    const isTakingOver = !localPresenceUser.isMD; // Are we turning it ON?

    if (alternateMD && isTakingOver) {
      // ✅ Allow them to steal it, but warn them first
      const confirmSteal = confirm(`${alternateMD.name} is currently driving. Do you want to force takeover as Music Director?`);
      if (!confirmSteal) return;
    }

    // 1. Update our local UI instantly
    const updatedPresencePayload = { ...localPresenceUser, isMD: isTakingOver };
    setLocalPresenceUser(updatedPresencePayload);
    localPresenceUserRef.current = updatedPresencePayload;

    if (realtimeChannelRef.current && isChannelSubscribedRef.current) {
      // 2. Tell the lobby we changed our state
      realtimeChannelRef.current.track(updatedPresencePayload);

      // 3. ✅ SURGICAL FIX: If we are claiming the MD role, yell at the old MD to step down!
      if (isTakingOver) {
        realtimeChannelRef.current.send({
          type: "broadcast",
          event: "lobby_sync",
          payload: { action: "MD_TAKEOVER", newMdId: localPresenceUser.id }
        });
      }
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-[#f8f9fa] overflow-hidden select-none">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');
        /* ✅ SURGICAL ADDITION: Import tall condensed font for lyrics/chords */
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;500;700&display=swap');
        
        /* ✅ SURGICAL FIX: Unidirectional loop for Tab Titles */
        @keyframes marquee-alt {
          0%, 15% { transform: translateX(0); } /* Hold at start */
          80%, 100% { transform: translateX(calc(-100% + 65px)); } /* Slide and hold at end */
        }
        .animate-marquee-alt {
          display: inline-block;
          /* Removed "alternate", both set to exactly 9s to perfectly sync! */
          animation: marquee-alt 9s ease-in-out infinite; 
        }
        
        /* ✅ SURGICAL FIX: Unidirectional loop for Header Title */
        @keyframes marquee-dynamic {
          0%, 15% { transform: translateX(0); } /* Hold at start */
          80%, 100% { transform: translateX(calc(-100% + var(--marquee-container-width, 100%))); } /* Slide and hold at end */
        }
        .animate-marquee-dynamic {
          display: inline-block;
          white-space: nowrap;
          /* Removed "alternate", both set to exactly 9s to perfectly sync! */
          animation: marquee-dynamic 9s ease-in-out infinite; 
        }
      `}} />
      {/* FULL-WIDTH CONSOLE NAVBAR HEADER */}
      <div id="fixed-live-header" className="w-full bg-white border-b border-zinc-200 flex-shrink-0 z-50 shadow-sm px-4 md:px-8 py-3.5 relative overflow-hidden">
        <div 
          ref={backdropProgressRef}
          className="absolute inset-y-0 left-0 bg-blue-500/5 pointer-events-none z-0 origin-left w-full"
        />
        <div 
          ref={accentProgressBarRef}
          className="absolute bottom-0 left-0 h-[3px] bg-blue-600 pointer-events-none z-35 origin-left w-full"
        />

        <div className="max-w-5xl mx-auto flex flex-col gap-2 relative z-10">
          
          {/* ROW 1: System Badges */}
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

          {/* ROW 2: Title & Core Controls */}
          <div className="flex items-center justify-between gap-2 w-full">
            <div 
              ref={titleContainerRef} 
              className="flex-1 min-w-0 overflow-hidden relative flex items-center h-10" // ✅ Locked height prevents jumping
              style={{ 
                maskImage: isTitleOverflowing ? "linear-gradient(to right, black 85%, transparent 100%)" : "none", 
                WebkitMaskImage: isTitleOverflowing ? "linear-gradient(to right, black 85%, transparent 100%)" : "none" 
              }}
            >
              <h1 
                ref={titleTextRef}
                className={`text-2xl md:text-3xl font-black tracking-tight text-zinc-950 leading-none ${
                  isTitleOverflowing ? 'animate-marquee-dynamic pr-8' : 'truncate'
                }`}
              >
                {activeSong?.title || "Loading..."}
              </h1>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              <div className="flex items-center gap-1 bg-zinc-50 p-1 rounded-lg border border-zinc-200 shadow-inner shrink-0 mr-1">
                {[1, 2, 3, 4].map((beatNum) => (
                  <div
                    key={beatNum}
                    ref={(el) => { metronomeRefs.current[beatNum - 1] = el; }}
                    className={`w-6 h-6 flex items-center justify-center font-mono font-black text-[10px] rounded border transition-all duration-75 select-none ${
                      isPlayingFlow && currentBeat === beatNum
                        ? beatNum === 4 ? "bg-[#faba37] text-white border-[#e0a22b]" : "bg-blue-600 text-white border-blue-500"
                        : "bg-white text-zinc-200 border-zinc-100"
                    }`}
                  >
                    {beatNum}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(true)}
                className="h-8 w-8 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-600 font-extrabold text-xs flex items-center justify-center shadow-sm cursor-pointer hover:bg-zinc-100"
              >
                <img src="/assets/settings.svg" alt="Settings" className="w-3 h-3 opacity-60" /> 
              </button>

              <button
                type="button"
                onClick={handleToggleFlowPlaybackState}
                className={`h-8 px-5 rounded-lg border text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  !localPresenceUser?.isMD
                    ? "bg-zinc-100 border-zinc-200 text-zinc-500 cursor-pointer shadow-inner"
                    : isPlayingFlow 
                      ? "bg-red-600 border-red-500 text-white ring-2 ring-red-500/20 cursor-pointer shadow-md" 
                      : "bg-blue-600 border-blue-500 text-white shadow-sm cursor-pointer"
                }`}
              >
                {!localPresenceUser?.isMD ? (
                  <>
                    <img src="/assets/lock.svg" alt="Locked" className="w-3 h-3 opacity-60" /> 
                    <span>Locked</span>
                  </>
                ) : isPlayingFlow ? (
                  "⏹"
                ) : (
                  "▶"
                )}
              </button>
            </div>
          </div>

          {/* ROW 3: Active Presence Lobby */}
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

          {/* TRACK LIST TRAY WITH SCROLLING MARQUEE */}
          <div className="w-full border-t border-zinc-100 pt-2.5 mt-1 flex items-center overflow-x-auto overflow-y-hidden flex-nowrap gap-1.5 scrollbar-none select-none pb-0.5 scroll-smooth">
            {tracksList.map((track, trackIdx) => {
              const title = track.songs?.title || "Song";
              const needsScroll = title.length > 10;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={(e) => handleSongTabNavigationClick(e, trackIdx)}
                  className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 border transition-all cursor-pointer flex items-center gap-1 ${
                    currentTrackIndex === trackIdx
                      ? "bg-blue-600 border-blue-500 text-white shadow-sm"
                      : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  <div className="overflow-hidden w-[65px] relative flex items-center">
                    <span className={`whitespace-nowrap ${needsScroll ? "animate-marquee-alt" : "truncate"}`}>
                      {title}
                    </span>
                  </div>
                  <span className="font-mono opacity-50 font-bold ml-0.5 shrink-0">({track.custom_key || track.songs?.original_key})</span>
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {/* ======================================================================= */}
      {/* --- SHEET CANVAS PANE VIEW (STANDARD OR SIMPLIFIED) ------------------- */}
      {/* ======================================================================= */}
      
      {/* ======================================================================= */}
      {/* --- SHEET CANVAS PANE VIEW (STANDARD OR SIMPLIFIED) ------------------- */}
      {/* ======================================================================= */}
      
      {(() => {
        // ✅ SURGICAL ADDITION: Centralized Duration Calculator for both views
        const getSectionDurationString = (sectionName: string) => {
          const timings = activeSong?.section_timings?.[sectionName] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
          const sectionMultiplier = (timings.repeats || 0) + 1;
          const headBeats = (timings.head_m || 0) * 4;
          const tailBeats = (timings.tail_m || 0) * 4;
          const baseBeats = ((timings.measures || 0) * 4) + (timings.beats || 0);

          let totalBeats = (baseBeats * sectionMultiplier) + headBeats + tailBeats;
          if (totalBeats <= 0) totalBeats = 32;

          const tempo = activeSong?.tempo || 75;
          const msPerBeat = 60000 / tempo;
          const totalSeconds = Math.round((totalBeats * msPerBeat) / 1000);
          
          const mins = Math.floor(totalSeconds / 60);
          const secs = (totalSeconds % 60).toString().padStart(2, '0');
          return `${mins}:${secs}`;
        };

        return (
          <>
            {isSimplifiedMode && (
              // ✅ SURGICAL FIX: The 3-Stack Musician Teleprompter View with Half-In Badges
              <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 bg-[#f8f9fa] overflow-hidden relative z-0">
                {(() => {
                  const getSecData = (idx: number) => {
                    const ast = memoizedSongAstTree[idx];
                    if (!ast) return null;
                    const duration = getSectionDurationString(ast.section_name);
                    return { ast, duration };
                  };

                  const prevSec = getSecData(currentSectionIndex - 1);
                  const currSec = getSecData(currentSectionIndex);
                  
                  const nextIdx = (queuedSectionIndex !== null && queuedTrackIndex === currentTrackIndex) 
                    ? queuedSectionIndex 
                    : currentSectionIndex + 1;
                  const nextSec = getSecData(nextIdx);

                  // ✅ SURGICAL FIX: Ensure massive stack chords also respect Nashville Numbers
                  const getChords = (ast: any, lineIdx: number) => {
                    if (!ast || !ast.lines[lineIdx]) return [];
                    const rawChords = ast.lines[lineIdx].words.flatMap((w: any) => w.chords);
                    return chordFormat === "Numbers" 
                      ? rawChords.map((ch: string) => chordToRoman(ch, activeDisplayKey))
                      : rawChords;
                  };

                  return (
                    <div className="w-full max-w-4xl flex flex-col gap-6 md:gap-8 items-center mt-[-8vh]">
                      
                      {/* 1. TOP STACK (PREVIOUS) */}
                      <div className="w-11/12 max-w-3xl h-16 md:h-20 bg-zinc-100 border border-zinc-200 rounded-2xl flex items-center justify-center px-6 opacity-50 shadow-inner relative mt-4">
                        <div className="absolute -top-3.5 left-6 flex items-center bg-zinc-100 border border-zinc-200 rounded-full p-0.5 pr-2.5 shadow-sm z-10">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black mr-1.5 shadow-inner bg-zinc-200 text-zinc-500">
                             {prevSec ? getSectionAbbreviation(prevSec.ast.section_name) : "S"}
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            {prevSec ? prevSec.ast.section_name : "START"}
                          </span>
                        </div>
                        
                        <div className="absolute -top-3.5 right-6 flex items-center bg-zinc-100 border border-zinc-200 rounded-full px-2.5 py-1 shadow-sm z-10">
                          <span className="text-[10px] font-mono font-bold text-zinc-400">⏱ {prevSec ? prevSec.duration : "0:00"}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          {prevSec && getChords(prevSec.ast, prevSec.ast.lines.length - 1).map((ch: string, i: number) => (
                            <span key={i} className="font-mono font-bold text-zinc-400 text-sm md:text-base">{ch}</span>
                          ))}
                        </div>
                      </div>

                      {/* 2. MIDDLE STACK (CURRENT LINE) */}
                      <div className="w-full h-32 md:h-44 bg-white border-2 border-blue-500 rounded-3xl flex flex-col justify-center px-6 md:px-10 shadow-2xl relative ring-8 ring-blue-500/10">
                        {/* ✅ SURGICAL FIX: Isolated progress bar wrapper prevents absolute badges from clipping */}
                        <div className="absolute inset-0 rounded-[1.35rem] overflow-hidden pointer-events-none">
                          <div ref={simplifiedProgressBarRef} className="absolute bottom-0 left-0 h-2 md:h-3 bg-blue-500 origin-left scale-x-0 w-full z-0" style={{ willChange: 'transform' }} />
                        </div>
                        
                        <div className="absolute -top-4 left-6 flex items-center bg-white border-2 border-blue-500 rounded-full p-0.5 pr-3 shadow-sm select-none z-10">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black mr-2 shadow-inner bg-blue-600 text-white">
                             {currSec ? getSectionAbbreviation(currSec.ast.section_name) : "F"}
                          </div>
                          <span className="text-xs font-black uppercase tracking-wider text-blue-700">
                            {currSec ? currSec.ast.section_name : "FLOW"}
                          </span>
                        </div>

                        <div className="absolute -top-3.5 right-6 flex items-center bg-white border-2 border-blue-500 rounded-full px-3 py-1 shadow-sm select-none z-10">
                          <span className="text-[11px] font-mono font-bold text-blue-600">⏱ {currSec ? currSec.duration : "0:00"}</span>
                        </div>

                        <div className="relative z-10 flex items-center justify-center w-full h-full">
                          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 px-4">
                            {currSec && getChords(currSec.ast, activeLineIndex).length > 0 ? (
                              getChords(currSec.ast, activeLineIndex).map((ch: string, i: number) => (
                                <span key={i} className="font-mono font-black text-blue-600 text-4xl md:text-6xl drop-shadow-sm">{ch}</span>
                              ))
                            ) : (
                              <span className="font-mono font-bold text-zinc-300 text-xl md:text-2xl italic">---</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 3. BOTTOM STACK (NEXT QUEUED) */}
                      <div className="w-11/12 max-w-3xl h-16 md:h-20 bg-white border border-zinc-200 rounded-2xl flex items-center justify-center px-6 opacity-90 shadow-sm relative mt-2">
                        {(queuedSectionIndex !== null && queuedTrackIndex === currentTrackIndex) && (
                          <div className="absolute -top-3 right-20 bg-purple-600 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm z-20 animate-pulse">⚡ QUEUED</div>
                        )}
                        
                        <div className="absolute -top-3.5 left-6 flex items-center bg-white border border-zinc-200 rounded-full p-0.5 pr-2.5 shadow-sm z-10">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black mr-1.5 shadow-inner bg-zinc-100 text-zinc-500">
                             {nextSec ? getSectionAbbreviation(nextSec.ast.section_name) : "N"}
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
                            {nextSec ? nextSec.ast.section_name : (upcomingTrackItem ? `NEXT: ${upcomingTrackItem.songs?.title}` : "END")}
                          </span>
                        </div>

                        <div className="absolute -top-3.5 right-6 flex items-center bg-white border border-zinc-200 rounded-full px-2.5 py-1 shadow-sm z-10">
                          <span className="text-[10px] font-mono font-bold text-zinc-400">⏱ {nextSec ? nextSec.duration : "--:--"}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          {nextSec && getChords(nextSec.ast, 0).map((ch: string, i: number) => (
                            <span key={i} className="font-mono font-bold text-zinc-600 text-sm md:text-base">{ch}</span>
                          ))}
                        </div>
                      </div>

                    </div>
                  );
                })()}
              </div>
            )}

            {!isSimplifiedMode && (
              // =========================================================
              // ORIGINAL STANDARD SHEET VIEW
              // =========================================================
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 pt-6 custom-scrollbar pb-64">
                <div className="max-w-5xl w-full mx-auto space-y-6 md:space-y-7 pt-2">
                  
                  {memoizedSongAstTree.map((section, idx) => {
                    const isThisSectionActivePlayback = isPlayingFlow && playingTrackIndex === currentTrackIndex && currentSectionIndex === idx;
                    const isThisSectionQueuedNext = queuedTrackIndex === currentTrackIndex && queuedSectionIndex === idx;
                    const isStagedUnstartedTarget = !isPlayingFlow && currentSectionIndex === idx;
                    
                    const formattedDuration = getSectionDurationString(section.section_name);

                    return (
                      <div
                        key={section.id}
                        ref={(el) => { sectionRefs.current[section.id] = el; }}
                        onClick={() => handleSectionInteractiveSelection(idx)}
                        className={`bg-white border rounded-xl md:rounded-2xl px-4 pb-3 pt-5 md:px-5 md:pb-4 md:pt-6 shadow-sm transition-all duration-300 relative ${
                          isThisSectionActivePlayback 
                            ? "border-blue-500 ring-4 ring-blue-500/10 shadow-md z-10 cursor-pointer" 
                            : isThisSectionQueuedNext
                            ? "border-purple-500 ring-4 ring-purple-500/10 scale-[1.001] shadow-md z-10 cursor-pointer" 
                            : `border-zinc-200 opacity-95 cursor-pointer hover:border-blue-400 hover:bg-zinc-50/30`
                          }`}
                        style={isStagedUnstartedTarget && !isThisSectionQueuedNext ? { borderColor: '#fbbf24', boxShadow: '0 0 0 4px rgba(251, 191, 36, 0.1)' } : {}}
                      >
                        
                        <div className={`absolute -top-3.5 left-4 flex items-center bg-white border rounded-full p-0.5 pr-3 shadow-sm select-none z-10 transition-colors ${
                          isThisSectionActivePlayback ? "border-blue-400" : isStagedUnstartedTarget ? "border-amber-400" : "border-blue-200/60"
                        }`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black mr-2 shadow-inner ${
                            isThisSectionActivePlayback ? "bg-blue-600 text-white" : isStagedUnstartedTarget ? "bg-amber-500 text-white" : "bg-blue-50 text-blue-500"
                          }`}>
                            {getSectionAbbreviation(section.section_name)}
                          </div>
                          <span className={`text-[11px] font-black uppercase tracking-wider ${
                            isThisSectionActivePlayback ? "text-blue-700" : isStagedUnstartedTarget ? "text-amber-600" : "text-blue-500"
                          }`}>
                            {section.section_name}
                          </span>
                          {isThisSectionQueuedNext && (
                            <span className="ml-2 text-[8px] font-black bg-purple-600 text-white uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm">⚡ QUEUED</span>
                          )}
                        </div>
                        
                        {/* ✅ SURGICAL FIX: Perfectly anchored on the top-right border, matching the left badge styling */}
                        <div className="absolute -top-3.5 right-4 flex items-center bg-white border border-zinc-200 rounded-full px-2.5 py-1 shadow-sm select-none z-10 transition-colors">
                          <span className="text-[10px] font-mono font-bold text-zinc-400">⏱ {formattedDuration}</span>
                        </div>

                        <div className="pl-0.5 select-text selection:bg-blue-50 text-zinc-800 space-y-0.5 mt-2">
                          {section.lines.length === 0 ? <div className="h-4" /> : section.lines.map((line: ParsedLineToken, lIdx: number) => {
                            const isCurrentlyPlayingLine = isThisSectionActivePlayback && activeLineIndex === lIdx;
                            
                            return (
                              <MemoizedLyricLine 
                                key={lIdx}
                                line={line}
                                sectionIndex={idx}
                                lineIndex={lIdx}
                                isCurrentlyPlayingLine={isCurrentlyPlayingLine}
                                showChords={showChords}
                                lyricsFontSize={lyricsFontSize}
                                lineSpacing={lineSpacing}
                                chordFormat={chordFormat}
                                activeDisplayKey={activeDisplayKey}
                              />
                            );
                          })}
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
            )}
          </>
        );
      })()}
      {/* Closes the !isSimplifiedMode block */}

      {showSyncBack && (
        <button
          type="button"
          onClick={handleScrollToActiveSectionAnchor}
          // ✅ SURGICAL FIX: Lowered z-index so the bottom sheet sits above it
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100000] bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-full shadow-2xl flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-3 duration-200 cursor-pointer active:scale-95 transition-all border border-blue-500/20"
        >
          🎯 Sync Back
        </button>
      )}

      {/* ======================================================================= */}
      {/* ✅ SURGICAL REFACTOR: CLEAN FULL-WIDTH BOTTOM SHEET SETTINGS           */}
      {/* ======================================================================= */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[200000] flex items-end sm:items-center justify-center select-none animate-in fade-in duration-200">
          
          {/* Invisible overlay click-to-close */}
          <div className="absolute inset-0" onClick={() => setIsSettingsModalOpen(false)} />

          <div className="bg-white w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col relative animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            
            {/* CLEAN HEADER: Close left, Title center */}
            <div className="flex-shrink-0 relative flex items-center justify-center pt-5 pb-4 px-4 border-b border-zinc-100">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-200 rounded-full sm:hidden" />
              <button 
                type="button" 
                onClick={() => setIsSettingsModalOpen(false)} 
                className="absolute left-5 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 text-sm font-bold flex items-center justify-center hover:bg-zinc-200 transition-colors"
              >
                ✕
              </button>
              <h3 className="text-base font-bold text-zinc-900 tracking-tight">Preferences</h3>
            </div>

            {/* SCROLLABLE BODY */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-7 custom-scrollbar pb-12">
              
              {/* SECTION: PERFORMANCE */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-900 block">Performance Authorization</label>
                <div className="bg-zinc-50/50 border border-zinc-100 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={handleToggleMusicDirectorMode}
                    className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${isCurrentlyMD ? "bg-blue-100 text-blue-600" : activeMDConnection ? "bg-zinc-200 text-zinc-500" : "bg-zinc-100 text-zinc-600"}`}>
                        {isCurrentlyMD ? "👑" : activeMDConnection ? "🔒" : "🎧"}
                      </span>
                      <span className="text-sm font-bold text-zinc-700">
                        {isCurrentlyMD ? "You are Music Director" : activeMDConnection ? `MD Mode Active (${activeMDConnection.name})` : "Take MD Control"}
                      </span>
                    </div>
                    {/* iOS-style toggle switch indicator */}
                    <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${isCurrentlyMD ? 'bg-blue-500' : 'bg-zinc-200'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isCurrentlyMD ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </button>
                </div>
              </div>

              {/* SECTION: DISPLAY OPTIONS */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-900 block">Display Options</label>
                
                {/* 3-Column Grid to fit the new format toggle */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-zinc-500">Chord Notation</span>
                    <div className="flex bg-zinc-100 p-1 rounded-xl">
                      <button onClick={() => setShowChords(true)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${showChords ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Show</button>
                      <button onClick={() => setShowChords(false)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${!showChords ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Hide</button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-zinc-500">Chord Format</span>
                    <div className="flex bg-zinc-100 p-1 rounded-xl">
                      <button onClick={() => setChordFormat("Key")} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${chordFormat === "Key" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Key</button>
                      <button onClick={() => setChordFormat("Numbers")} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${chordFormat === "Numbers" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Numbers</button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-zinc-500">View Mode</span>
                    <div className="flex bg-zinc-100 p-1 rounded-xl">
                      <button onClick={() => setIsSimplifiedMode(false)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${!isSimplifiedMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Sheet</button>
                      <button onClick={() => setIsSimplifiedMode(true)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${isSimplifiedMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Stack</button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-zinc-500">Line Spacing</span>
                  <div className="flex bg-zinc-100 p-1 rounded-xl">
                    {([ { label: "Compact", spacing: 16 }, { label: "Comfort", spacing: 24 }, { label: "Spacious", spacing: 32 } ]).map((preset) => (
                      <button key={preset.label} onClick={() => setLineSpacing(preset.spacing)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${lineSpacing === preset.spacing ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION: AUDIO & SYNC */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-900 block">Metronome & Audio</label>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  <button onClick={() => setIsMetronomeSoundEnabled(true)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${isMetronomeSoundEnabled ? "bg-blue-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Click ON</button>
                  <button onClick={() => setIsMetronomeSoundEnabled(false)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!isMetronomeSoundEnabled ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Click OFF</button>
                </div>

                {isMetronomeSoundEnabled && (
                  <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 animate-in slide-in-from-top-2">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold text-zinc-600">Bluetooth Sync Offset</span>
                      <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg px-2 py-1 shadow-sm">
                        <input type="number" min={0} max={2000} value={audioLatencyOffsetMs} onChange={(e) => setAudioLatencyOffsetMs(parseInt(e.target.value) || 0)} className="w-10 bg-transparent text-center font-bold text-xs text-zinc-900 outline-none" />
                        <span className="text-[10px] font-bold text-zinc-400">ms</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-zinc-200 shadow-inner flex-1 justify-center">
                        {[1, 2, 3, 4].map((beatNum) => (
                          <div key={`test-${beatNum}`} className={`w-6 h-6 flex items-center justify-center font-mono font-black text-[10px] rounded border transition-all duration-75 select-none ${isTestingSync && testVisualBeat === beatNum ? (beatNum === 4 ? "bg-amber-400 text-white border-amber-500" : "bg-blue-500 text-white border-blue-600") : "bg-zinc-50 text-zinc-300 border-transparent"}`}>
                            {beatNum}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setIsTestingSync(!isTestingSync)} className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all w-24 ${isTestingSync ? "bg-red-50 text-red-600 border border-red-200" : "bg-white border border-zinc-200 text-zinc-700 shadow-sm hover:bg-zinc-50"}`}>
                        {isTestingSync ? "STOP" : "TEST SYNC"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: ACTIONS */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-900 block">Actions</label>
                <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-zinc-50">
                  
                  {/* ✅ SURGICAL ADDITION: Admin Only - Edit Song Redirect */}
                  {isAdmin && activeSong && (
                    <button 
                      type="button"
                      disabled={isPlayingFlow} 
                      onClick={() => { 
                        setIsSettingsModalOpen(false); 
                        router.push(`/songs/${activeSong.id}/edit`); 
                      }} 
                      className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors disabled:opacity-40"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-blue-500">📝</span>
                        <span className="text-sm font-bold text-zinc-700">Edit Song</span>
                      </div>
                      <span className="text-zinc-300 font-bold">›</span>
                    </button>
                  )}

                  <button disabled={isPlayingFlow} onClick={() => { setIsSettingsModalOpen(false); handleOpenTransposerModal(); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors disabled:opacity-40">
                    <div className="flex items-center gap-3">
                      <span className="text-blue-500">🎹</span>
                      <span className="text-sm font-bold text-zinc-700">Transpose Key</span>
                    </div>
                    <span className="text-zinc-300 font-bold">›</span>
                  </button>
                  <button disabled={isPlayingFlow} onClick={() => { setIsSettingsModalOpen(false); setIsStructureModalOpen(true); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors disabled:opacity-40">
                    <div className="flex items-center gap-3">
                      <span className="text-blue-500">🧱</span>
                      <span className="text-sm font-bold text-zinc-700">Edit Structure</span>
                    </div>
                    <span className="text-zinc-300 font-bold">›</span>
                  </button>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* ✅ SURGICAL REFACTOR: EDIT STRUCTURE BOTTOM SHEET                       */}
      {/* ======================================================================= */}
      {isStructureModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[250000] flex items-end sm:items-center justify-center select-none animate-in fade-in duration-200">
          
          <div className="absolute inset-0" onClick={() => setIsStructureModalOpen(false)} />

          <div className="bg-[#f8f9fa] w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col relative animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
            
            {/* Header */}
            <div className="flex-shrink-0 relative flex items-center justify-center pt-5 pb-4 px-4 border-b border-zinc-100 bg-white rounded-t-3xl sm:rounded-t-3xl z-10">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-200 rounded-full sm:hidden" />
              <button type="button" onClick={() => setIsStructureModalOpen(false)} className="absolute left-5 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 text-sm font-bold flex items-center justify-center hover:bg-zinc-200 transition-colors cursor-pointer">✕</button>
              <h3 className="text-base font-bold text-zinc-900 tracking-tight">Edit Structure</h3>
              {isSavingStructure && <span className="absolute right-5 text-[10px] bg-blue-50 font-black text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full animate-pulse">Saving...</span>}
            </div>

            {/* Draggable List Body */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 custom-scrollbar pb-10">
              {sections.map((sec, sIdx) => {
                const isBeingDragged = draggedSectionIndex === sIdx;
                const isHoveredTarget = dragOverIndex === sIdx;
                const abbr = getSectionAbbreviation(sec.section_name);
                const colorClass = getSectionColorClass(sec.section_name);
                
                return (
                  <div
                    key={sec.id}
                    draggable
                    onDragStart={() => handleModalSectionDragStart(sIdx)}
                    onDragOver={(e) => { e.preventDefault(); if (dragOverIndex !== sIdx) setDragOverIndex(sIdx); }}
                    onDragLeave={() => { if (dragOverIndex === sIdx) setDragOverIndex(null); }}
                    onDragEnd={() => { setDraggedSectionIndex(null); setDragOverIndex(null); }}
                    onDrop={() => handleModalSectionDrop(sIdx)}
                    className={`flex items-center justify-between p-3.5 bg-white rounded-xl transition-all duration-150 ${
                      isBeingDragged ? "opacity-30 shadow-none border border-dashed border-zinc-400" : isHoveredTarget ? "border border-blue-500 scale-[1.02] shadow-md z-10" : "border border-transparent hover:border-zinc-200 shadow-sm"
                    }`}
                  >
                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                      {/* Drag Handle SVG */}
                      <div className="cursor-grab active:cursor-grabbing text-zinc-300 pl-1 hover:text-zinc-500 transition-colors">
                        <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor"><path d="M4.5 4a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-5 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-5 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
                      </div>
                      
                      {/* Colored Abbreviation Badge */}
                      <div className={`w-9 h-9 rounded-full border-[1.5px] flex items-center justify-center text-xs font-black ${colorClass}`}>
                        {abbr}
                      </div>
                      
                      <span className="text-[15px] font-bold text-zinc-800">{sec.section_name}</span>
                    </div>

                    <button type="button" onClick={() => handleModalSectionRemoveItem(sIdx)} className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-red-500 transition-colors rounded-full hover:bg-red-50 cursor-pointer">✕</button>
                  </div>
                );
              })}

              <button 
                type="button" 
                onClick={() => setIsAddBlockModalOpen(true)} 
                className="w-full flex items-center gap-3 p-4 mt-2 text-blue-500 hover:text-blue-600 font-bold hover:bg-blue-50/50 rounded-xl transition-colors cursor-pointer"
              >
                <span className="text-2xl leading-none font-light mb-1">+</span> 
                <span className="text-[15px]">Add New Structures</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* ✅ SURGICAL ADDITION: ADD BLOCK SUB-MODAL                               */}
      {/* ======================================================================= */}
      {isAddBlockModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[260000] flex items-end sm:items-center justify-center select-none animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setIsAddBlockModalOpen(false)} />
          
          <div className="bg-white w-full sm:max-w-sm max-h-[80vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col relative animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="flex-shrink-0 relative flex items-center justify-center pt-5 pb-4 px-4 border-b border-zinc-100">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-200 rounded-full sm:hidden" />
              <button type="button" onClick={() => setIsAddBlockModalOpen(false)} className="absolute left-5 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 text-sm font-bold flex items-center justify-center hover:bg-zinc-200 transition-colors cursor-pointer">✕</button>
              <h3 className="text-base font-bold text-zinc-900 tracking-tight">Add Block Element</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar pb-10">
              <div className="grid grid-cols-1 gap-2">
                {/* ✅ SURGICAL FIX: Driven by the dynamic context-aware catalog */}
                {availableSectionNames.map((sectionName) => (
                  <button
                    key={sectionName}
                    type="button"
                    onClick={() => {
                      handleModalAppendNewSectionItem(sectionName);
                      setIsAddBlockModalOpen(false);
                    }}
                    className="w-full text-left p-4 bg-zinc-50 hover:bg-blue-50 border border-zinc-100 hover:border-blue-200 rounded-xl text-sm font-bold text-zinc-700 flex justify-between items-center transition-all cursor-pointer group"
                  >
                    <span>{sectionName}</span>
                    <span className="text-zinc-300 group-hover:text-blue-500 font-black text-xl leading-none transition-colors">+</span>
                  </button>
                ))}
                
                {availableSectionNames.length === 0 && (
                  <div className="text-center p-6 text-xs font-bold text-zinc-400">
                    No sections available for this song.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY KEY REMODAL TRANSPOSER INTERFACE */}
      {isTransposerOpen && (
        // ✅ SURGICAL FIX: Bumped z-index to z-[210000] so it stacks flawlessly ON TOP of the bottom sheet
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[210000] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-100 select-none">
          <form onSubmit={handleCommitTranspositionSave} className="bg-[#f8f9fa] border border-zinc-200 rounded-[2.5rem] shadow-2xl max-w-xl w-full p-7 px-8 space-y-6 animate-in zoom-in-95 duration-150 relative text-left">
            <button type="button" onClick={() => setIsTransposerOpen(false)} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white hover:bg-zinc-100 border text-zinc-400 text-xs font-bold flex items-center justify-center shadow-sm cursor-pointer transition-colors">✕</button>
            <div className="space-y-1"><h3 className="text-2xl font-black text-zinc-900 tracking-tight">Setlist Transposer</h3><p className="text-xs font-black text-blue-500">Original Song Base {activeSong?.original_key || "--"}</p></div>
            <div className="grid grid-cols-7 gap-2 bg-white p-2 rounded-2xl border shadow-inner">{BASE_LETTER_ROOTS.map((letter) => <button key={letter} type="button" onClick={() => setModalRoot(letter)} className={`aspect-square rounded-xl text-center text-sm font-black transition-all flex items-center justify-center cursor-pointer ${modalRoot === letter ? "bg-blue-600 text-white shadow-md scale-105" : "bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100"}`}>{letter}</button>)}</div>
            <div className="grid grid-cols-2 divide-x bg-white rounded-2xl border overflow-hidden shadow-inner h-12"><button type="button" onClick={() => setModalAccidental(modalAccidental === "b" ? "" : "b")} className={`text-center text-base font-black transition-colors flex items-center justify-center h-full cursor-pointer ${modalAccidental === "b" ? "bg-blue-50/80 text-blue-600 font-extrabold" : "text-zinc-600 hover:bg-zinc-50/50"}`}>♭</button><button type="button" onClick={() => setModalAccidental(modalAccidental === "#" ? "" : "#")} className={`text-center text-sm font-black transition-colors flex items-center justify-center h-full cursor-pointer ${modalAccidental === "#" ? "bg-blue-50/80 text-blue-600 font-extrabold" : "text-zinc-600 hover:bg-zinc-50/50"}`}>#</button></div>
            <div className="pt-2"><button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-md text-center cursor-pointer">Apply Rehearsal Override</button></div>
          </form>
        </div>
      )}

      {isMdLockModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[300000] flex items-center justify-center p-4 select-none animate-in fade-in duration-100">
          <div className="bg-white border border-zinc-200 rounded-[1rem] shadow-2xl p-6 md:p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-100 text-center relative">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mt-2 mb-4 shadow-inner">
              <span className="text-3xl">🔒</span>
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-zinc-900 tracking-tight">Playback Locked</h3>
              <p className="text-xs font-bold text-zinc-400">Only the Music Director can start the setlist.</p>
            </div>

            {activeMDConnection ? (
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-left shadow-inner">
                 <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2.5">Current Music Director:</p>
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full shadow-sm shrink-0 flex items-center justify-center overflow-hidden bg-zinc-200 relative">
                     {activeMDConnection.avatar ? (
                       <img src={activeMDConnection.avatar} alt="" className="w-full h-full object-cover" />
                     ) : (
                       <div className={`w-full h-full ${activeMDConnection.bg || 'bg-blue-600'} text-white font-mono font-black text-sm flex items-center justify-center`}>
                         {activeMDConnection.initials}
                       </div>
                     )}
                   </div>
                   <div className="flex flex-col min-w-0">
                     <span className="text-sm font-black text-zinc-900 truncate">{activeMDConnection.name}</span>
                     <span className="text-[10px] font-bold text-green-600 flex items-center gap-1">
                       <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Has Control
                     </span>
                   </div>
                 </div>
              </div>
            ) : (
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 shadow-inner">
                <p className="text-[11px] font-bold text-zinc-500 leading-relaxed">
                  No one is currently driving. Click the <strong className="text-zinc-800">settings gear (⚙️)</strong> in the top header and select <strong className="text-zinc-800">"Take Music Director Control"</strong> to unlock playback.
                </p>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsMdLockModalOpen(false)}
                className="w-full py-3.5 bg-zinc-950 hover:bg-zinc-800 text-white font-black text-xs uppercase tracking-widest rounded-xl text-center shadow-md cursor-pointer transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ======================================================= */}
      {/* ✅ SURGICAL FIX: QUICK JUMP SCRUBBER OVERLAY              */}
      {/* ======================================================= */}
      {sections.length > 0 && (
        <div
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={isScrubberActive ? handleScrubberPointerMove : undefined}
          onPointerUp={handleScrubberPointerUp}
          onPointerCancel={handleScrubberPointerUp}
          // 1. Replaced percentage bounds with hard pixel bounds (top-[140px]) to completely clear the header.
          // 2. Added overflow-y-auto so if the list is massive, it can safely scroll if needed.
          className={`fixed right-0 top-[140px] bottom-24 z-40 flex flex-col overflow-y-auto custom-scrollbar pl-12 pr-1 md:pr-3 touch-none transition-all duration-300 select-none ${
            isScrubberActive ? "w-48" : "w-10"
          }`}
        >
          {/* 3. Replaced parent 'justify-center' with 'my-auto' here.
                 This centers short lists perfectly, but prevents tall lists from bleeding upward! 
                 4. Shrunk the vertical gap slightly (gap-2) to fit more sections on mobile screens. */}
          <div className="relative z-10 flex flex-col items-end gap-2 md:gap-3 py-4 my-auto transition-all duration-300 w-full min-h-min">
            {sections.map((sec, idx) => {
              const isHovered = scrubberHoverIndex === idx;
              const isActive = currentSectionIndex === idx;
              
              // ✅ SURGICAL ADDITION: Next and Queued State Logic
              const isQueued = queuedTrackIndex === currentTrackIndex && queuedSectionIndex === idx;
              const isNext = isPlayingFlow && !isQueued && (queuedTrackIndex === null || queuedTrackIndex !== currentTrackIndex) && (idx === currentSectionIndex + 1);
              
              const abbr = getSectionAbbreviation(sec.section_name);

              return (
                <div
                  key={`scrub-${sec.id}`}
                  data-scrubber-index={idx}
                  className={`flex items-center justify-end gap-3 transition-all duration-200 w-full text-right ${
                    isHovered ? "-translate-x-1" : isScrubberActive ? "cursor-crosshair" : "cursor-pointer"
                  }`}
                >
                  {/* The Section Name Text */}
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
                  
                  {/* ✅ SURGICAL FIX: The Interactive Dot (Now shows abbreviations for Queued & Next) */}
                  <div
                    data-scrubber-index={idx}
                    className={`rounded-full transition-all duration-300 shrink-0 shadow-sm flex items-center justify-center overflow-hidden ${
                      isActive
                        ? "w-6 h-6 bg-blue-600 ring-2 ring-blue-500/20 text-white font-black text-[9px] shadow-md"
                        : isQueued
                        ? `bg-purple-500 ring-2 ring-purple-500/20 text-white font-black text-[8px] ${isHovered ? "w-6 h-6" : "w-5 h-5"}`
                        : isNext
                        ? `bg-blue-400/80 ring-2 ring-blue-400/10 text-white font-black text-[8px] ${isHovered ? "w-6 h-6" : "w-5 h-5"}`
                        : isHovered
                        ? "w-3 h-3 bg-blue-400 ring-4 ring-blue-400/20"
                        : "w-1.5 h-1.5 bg-zinc-400/80 hover:bg-zinc-500"
                    }`}
                  >
                    {(isActive || isQueued || isNext) && <span className="pt-[1px]">{abbr}</span>}
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