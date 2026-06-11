"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";

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

interface ArrangementSection {
  id: string;
  section_name: string;
  content: string;
}

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

export default function SongLiveViewPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const songId = params?.id as string;

  // Core Data States
  const [loading, setLoading] = useState(true);
  const [song, setSong] = useState<SongRecord | null>(null);
  const [sections, setSections] = useState<ArrangementSection[]>([]);

  // Runtime Display Key Overrides (Does not touch database master records)
  const [displayKey, setDisplayKey] = useState<string>("");

  // Transposer Modal States
  const [isTransposerOpen, setIsTransposerOpen] = useState(false);
  const [modalRoot, setModalRoot] = useState("G");
  const [modalAccidental, setModalAccidental] = useState<"" | "#" | "b">("");

  // Playback Control Flags
  const [isPlayingFlow, setIsPlayingFlow] = useState(false);
  const [isPausedFlow, setIsPausedFlow] = useState(false);
  
  // High-Performance Sync States
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number>(0);
  const [currentBeat, setCurrentBeat] = useState<number>(1);
  const [smoothProgress, setSmoothProgress] = useState<number>(0);

  // Precise Engine Tracking Refs
  const isPlayingRef = useRef(false);
  const currentSectionIndexRef = useRef(0);
  const sectionStartTimeRef = useRef<number>(0);
  const pauseOffsetMsRef = useRef<number>(0);
  
  const animationFrameRef = useRef<number | null>(null);
  const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  async function loadSongLiveSheet() {
    try {
      setLoading(true);
      const { data: songRow, error: songErr } = await supabase
        .from("songs")
        .select("id, title, artist, original_key, tempo, section_timings")
        .eq("id", songId)
        .maybeSingle();

      if (songErr || !songRow) {
        console.error("Song loading exception:", songErr);
        setLoading(false);
        return;
      }
      setSong(songRow as unknown as SongRecord);
      
      // Initialize the runtime display tracker with the master record key signature
      setDisplayKey(songRow.original_key || "G");

      const { data: sectionsData } = await supabase
        .from("song_sections")
        .select("id, section_name, content")
        .eq("song_id", songId)
        .order("sequence_order", { ascending: true });

      if (sectionsData) {
        setSections(sectionsData);
      }
    } catch (err) {
      console.error("Failed to parse live view assets:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSongLiveSheet();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [songId]);

  // ==========================================================
  // --- SIDEBAR-AWARE PIXEL SNAP SCROLLER --------------------
  // ==========================================================
  useEffect(() => {
    if (sections.length === 0 || !sections[currentSectionIndex]) return;

    const targetElement = sectionRefs.current[sections[currentSectionIndex].id];
    if (targetElement) {
      const headerElement = document.getElementById("fixed-live-header");
      const headerHeight = headerElement ? headerElement.offsetHeight : 180;
      
      const elementPosition = targetElement.getBoundingClientRect().top + window.scrollY;
      const optimizedScrollPosition = elementPosition - headerHeight - 24; 

      window.scrollTo({
        top: optimizedScrollPosition,
        behavior: "smooth"
      });
    }
  }, [currentSectionIndex, sections]);

  // ==========================================================
  // --- HIGH-PRECISION DRIFT-FREE METRONOME ENGINE ----------
  // ==========================================================
  const runHighPrecisionPlaybackEngine = (timestamp: number) => {
    if (!isPlayingRef.current || !song || sections.length === 0) return;

    const beatSpeedMs = (60 / (song.tempo || 75)) * 1000;
    const activeSection = sections[currentSectionIndexRef.current];
    
    if (!activeSection) {
      handleResetFlowTrigger();
      return;
    }

    const timings = song.section_timings?.[activeSection.section_name] || { measures: 4, beats: 0 };
    const totalBeatsInSection = (timings.measures * 4) + timings.beats || 16;
    const totalSectionDurationMs = totalBeatsInSection * beatSpeedMs;

    const elapsedMs = timestamp - sectionStartTimeRef.current;
    const calculatedProgress = Math.min(100, (elapsedMs / totalSectionDurationMs) * 100);
    setSmoothProgress(calculatedProgress);

    const currentBeatPulse = Math.floor(elapsedMs / beatSpeedMs) % 4 + 1;
    setCurrentBeat(currentBeatPulse);

    if (elapsedMs >= totalSectionDurationMs) {
      const nextIndex = currentSectionIndexRef.current + 1;

      if (nextIndex < sections.length) {
        const residualOverrunMs = elapsedMs - totalSectionDurationMs;
        
        currentSectionIndexRef.current = nextIndex;
        setCurrentSectionIndex(nextIndex);
        sectionStartTimeRef.current = performance.now() - residualOverrunMs;
      } else {
        handleResetFlowTrigger();
        return;
      }
    }

    animationFrameRef.current = requestAnimationFrame(runHighPrecisionPlaybackEngine);
  };

  function handleStartFlowTrigger() {
    if (sections.length === 0 || !song) return;
    
    isPlayingRef.current = true;
    setIsPlayingFlow(true);
    setIsPausedFlow(false);

    if (isPausedFlow) {
      sectionStartTimeRef.current = performance.now() - pauseOffsetMsRef.current;
    } else {
      sectionStartTimeRef.current = performance.now();
    }

    animationFrameRef.current = requestAnimationFrame(runHighPrecisionPlaybackEngine);
  }

  function handlePauseFlowTrigger() {
    isPlayingRef.current = false;
    setIsPlayingFlow(false);
    setIsPausedFlow(true);
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    pauseOffsetMsRef.current = performance.now() - sectionStartTimeRef.current;
  }

  function handleResetFlowTrigger() {
    isPlayingRef.current = false;
    setIsPlayingFlow(false);
    setIsPausedFlow(false);
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    currentSectionIndexRef.current = 0;
    pauseOffsetMsRef.current = 0;
    
    setCurrentSectionIndex(0);
    setCurrentBeat(1);
    setSmoothProgress(0);
  }

  function handleSelectSectionDirectly(index: number) {
    if (isPlayingFlow) return; 
    
    currentSectionIndexRef.current = index;
    setCurrentSectionIndex(index);
    pauseOffsetMsRef.current = 0;
    setCurrentBeat(1);
    setSmoothProgress(0);
  }

  // ==========================================================
  // --- IN-MEMORY RUNTIME TRANSPOSITION LOGIC ----------------
  // ==========================================================
  function handleOpenTransposerModal() {
    if (!song || isPlayingFlow) return;
    
    const cleanKeyBase = displayKey.endsWith("m") ? displayKey.slice(0, -1) : displayKey;
    let baseLetter = cleanKeyBase.charAt(0);
    let accidentalSign: "" | "#" | "b" = "";
    
    if (cleanKeyBase.includes("#")) accidentalSign = "#";
    else if (cleanKeyBase.includes("b")) accidentalSign = "b";

    setModalRoot(baseLetter);
    setModalAccidental(accidentalSign);
    setIsTransposerOpen(true);
  }

  function handleCommitTranspositionSave(e: React.FormEvent) {
    e.preventDefault();
    if (!song) return;

    const isMinorSong = song.original_key.endsWith("m");
    const formattedNewKeyName = `${modalRoot}${modalAccidental}${isMinorSong ? "m" : ""}`;

    // Update local key override state (ZERO database writes)
    setDisplayKey(formattedNewKeyName);
    setIsTransposerOpen(false);
    handleResetFlowTrigger();
  }

  // Calculate runtime semitone distance between Master database Key and local Display Key
  const getRuntimeSemitoneDelta = (): number => {
    if (!song || !displayKey) return 0;
    const isMinorSong = song.original_key.endsWith("m");
    
    const oldRootNote = isMinorSong ? song.original_key.slice(0, -1) : song.original_key;
    const newRootNote = isMinorSong ? displayKey.slice(0, -1) : displayKey;

    const oldChromaticIndex = CHROMATIC_SCALE.indexOf(normalizeKeyNote(oldRootNote));
    const newChromaticIndex = CHROMATIC_SCALE.indexOf(normalizeKeyNote(newRootNote));
    
    if (oldChromaticIndex === -1 || newChromaticIndex === -1) return 0;
    return (newChromaticIndex - oldChromaticIndex + 12) % 12;
  };

  // Inline chord parsing engine with built-in runtime memory transposer overrides
  const renderLiveOrchestrationLyricsLine = (contentText: string) => {
    if (!contentText.trim()) return <div className="h-4" />;
    
    const runtimeDelta = getRuntimeSemitoneDelta();

    return contentText.split("\n").map((line, lineIdx) => {
      let lineCommentText = "";
      const wordsArray = line.replace(/\{([^\}]+)\}/g, (m, p1) => { lineCommentText = p1.trim(); return ""; }).match(/(?:\[[^\]]+\]|\S)+/g) || [];

      return (
        <div key={lineIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1">
          <div className="flex flex-wrap items-end gap-x-2.5 gap-y-4 py-1 leading-none flex-1">
            {wordsArray.map((chunk, currentWordIdx) => {
              const chordRegex = /\[([^\]]+)\]/g; 
              const extractedChordsList: string[] = []; 
              let matchResult;
              
              while ((matchResult = chordRegex.exec(chunk)) !== null) { 
                extractedChordsList.push(matchResult[1]); 
              }
              const cleanWordDisplay = chunk.replace(/\[[^\]]+\]/g, "");

              return (
                <div key={currentWordIdx} className="flex flex-col items-start min-h-[38px] justify-end">
                  {extractedChordsList.length > 0 && (
                    <div className="text-[12px] font-mono font-black text-blue-600 tracking-tight pb-0.5 select-none">
                      {extractedChordsList.map((ch, cIdx) => {
                        // Transpose chords inside the view rendering context map on the fly
                        const dynamicTransposedChord = runtimeDelta !== 0 ? transposeBracketContent(ch, runtimeDelta) : ch;
                        return (
                          <span key={cIdx} className="mr-1 bg-blue-50/60 px-1 rounded border border-blue-100/40">{dynamicTransposedChord}</span>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-[15px] font-sans font-bold text-zinc-800 tracking-tight">{cleanWordDisplay || " "}</div>
                </div>
              );
            })}
          </div>
          {lineCommentText && (
            <div style={{ fontFamily: "'Nothing You Could Do', cursive" }} className="text-[17px] text-zinc-400 tracking-wide select-none self-center whitespace-nowrap sm:pl-4">
              {lineCommentText}
            </div>
          )}
        </div>
      );
    });
  };

  if (loading) return <div className="p-8 text-center text-xs font-black uppercase text-zinc-400 tracking-widest animate-pulse">Syncing Live Sheet...</div>;
  if (!song) return <div className="p-12 text-center text-sm font-bold text-zinc-500">Track data profile matrix not found.</div>;

  const highlightedTargetSectionName = sections[currentSectionIndex]?.section_name || "FLOW";

  return (
    <div className="p-6 md:p-8 pt-36 md:pt-40 max-w-5xl w-full mx-auto space-y-6 relative">
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

      {/* ======================================================================= */}
      {/* --- SIDEBAR-AWARE VIEWPORT-FIXED CONSOLE HEADER ----------------------- */}
      {/* ======================================================================= */}
      <div id="fixed-live-header" className="fixed top-0 left-0 md:left-20 right-0 z-50 p-4 md:p-6 bg-[#f8f9fa]/90 backdrop-blur-md select-none border-b border-zinc-200/50">
        <div className="max-w-5xl mx-auto bg-white border border-zinc-200 rounded-[2rem] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden p-6">
          
          {/* PROGRESS FILL OVERLAY */}
          {(isPlayingFlow || isPausedFlow) && (
            <div 
              className="absolute inset-y-0 left-0 bg-blue-500/5 pointer-events-none z-0 mix-blend-multiply"
              style={{ width: `${smoothProgress}%` }}
            />
          )}

          {/* PROGRESS ACCENT BOTTOM FOOTPRINT BAR */}
          {(isPlayingFlow || isPausedFlow) && (
            <div 
              className="absolute bottom-0 left-0 h-1 bg-blue-600 pointer-events-none z-30 transition-all duration-75"
              style={{ width: `${smoothProgress}%` }}
            />
          )}

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5 w-full">
            
            <div className="flex items-center gap-4 min-w-0">
              <button 
                type="button" 
                onClick={() => router.push("/songs")} 
                className="w-8 h-8 rounded-full bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-500 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-sm"
              >
                ‹
              </button>
              <div className="min-w-0 leading-tight space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-zinc-950 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-md">
                    LIVE VIEW
                  </span>
                  <span className="bg-blue-50 border border-blue-100 text-blue-600 font-mono font-black text-[10px] px-2 py-0.5 rounded-md shadow-inner">
                    ⏱ {song.tempo} BPM
                  </span>
                </div>
                <h1 className="text-2xl font-black tracking-tight text-zinc-950 truncate max-w-xs md:max-w-sm">
                  {song.title}
                </h1>
              </div>
            </div>

            {/* 4-BEATS STEADY METRONOME VISUAL INDICATOR DECK */}
            <div className="flex items-center gap-1.5 bg-zinc-50 p-1.5 rounded-xl border border-zinc-200 shadow-inner self-start lg:self-center">
              {[1, 2, 3, 4].map((beatNum) => {
                const isByBeatPulsing = isPlayingFlow && currentBeat === beatNum;
                return (
                  <div
                    key={beatNum}
                    className={`w-10 h-10 flex items-center justify-center font-mono font-black text-sm rounded-lg border transition-all duration-75 select-none ${
                      isByBeatPulsing
                        ? "bg-blue-600 text-white border-blue-500 shadow-md scale-105"
                        : "bg-white text-zinc-300 border-zinc-100"
                    }`}
                  >
                    {beatNum}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2.5 self-end lg:self-center shrink-0">
              
              {/* INTERACTIVE LOCAL TRANSPOSER MODAL LINK BUTTON */}
              <button
                type="button"
                disabled={isPlayingFlow}
                onClick={handleOpenTransposerModal}
                className="bg-white border border-zinc-200 rounded-xl p-2 px-3.5 text-xs font-bold text-zinc-400 shadow-sm flex items-center gap-1 hover:border-blue-500 hover:text-blue-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                KEY <span className="text-blue-600 font-black text-sm">{displayKey}</span>
              </button>

              <div className="flex items-center bg-zinc-50 border border-zinc-200 p-1 rounded-xl shadow-inner gap-1">
                <button
                  type="button"
                  onClick={handleStartFlowTrigger}
                  disabled={sections.length === 0}
                  className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40 cursor-pointer ${
                    isPlayingFlow 
                      ? "bg-blue-600 text-white shadow-md font-bold" 
                      : "bg-white border text-zinc-800 hover:bg-zinc-50"
                  }`}
                >
                  ▶ START IN {highlightedTargetSectionName.toUpperCase()}
                </button>

                <button
                  type="button"
                  onClick={handlePauseFlowTrigger}
                  disabled={!isPlayingFlow}
                  className="px-3 py-2 bg-white border border-zinc-200/60 hover:bg-zinc-100 disabled:opacity-40 rounded-lg text-xs font-black uppercase text-zinc-700 cursor-pointer transition-colors"
                >
                  ⏸ PAUSE
                </button>

                <button
                  type="button"
                  onClick={handleResetFlowTrigger}
                  disabled={!isPlayingFlow && !isPausedFlow && currentSectionIndex === 0}
                  className="px-3 py-2 bg-white border border-zinc-200/60 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-40 rounded-lg text-xs font-black uppercase text-zinc-400 cursor-pointer transition-all"
                >
                  ⏹ RESET
                </button>
              </div>

              <button 
                type="button"
                onClick={() => router.push("/songs")}
                className="p-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-xl transition-colors cursor-pointer shadow-sm text-sm"
              >
                📝
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ARRANGEMENT VIEW CARDS ARRANGEMENT TRAY */}
      <div className="space-y-4">
        {sections.map((section, idx) => {
          const isSectionCurrentlyActive = isPlayingFlow && currentSectionIndex === idx;
          const isStagedUnstartedTarget = !isPlayingFlow && currentSectionIndex === idx;
          const centralizedTimingConfig = song.section_timings?.[section.section_name];

          return (
            <div
              key={section.id}
              ref={(el) => { sectionRefs.current[section.id] = el; }}
              onClick={() => handleSelectSectionDirectly(idx)}
              className={`bg-white border rounded-[2rem] p-6 shadow-sm transition-all duration-300 relative ${
                isSectionCurrentlyActive 
                  ? "border-blue-500 ring-4 ring-blue-500/10 scale-[1.001] shadow-md z-10" 
                  : `border-zinc-200 opacity-95 text-[#f8f9fa] cursor-pointer hover:border-blue-400 hover:bg-zinc-50/30`
                }`}
              style={isStagedUnstartedTarget ? { borderColor: '#fbbf24', boxShadow: '0 0 0 4px rgba(251, 191, 36, 0.1)' } : {}}
            >
              <div className="flex items-center justify-between border-b border-zinc-100/80 pb-2.5 mb-4 select-none">
                <div className="flex items-center gap-2">
                  <span className={`font-black text-[10px] uppercase tracking-wider px-3 py-1 rounded-full ${
                    isSectionCurrentlyActive 
                      ? "bg-blue-600 text-white shadow-sm" 
                      : isStagedUnstartedTarget
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-blue-50 text-blue-600"
                  }`}>
                    {section.section_name}
                  </span>
                  {isStagedUnstartedTarget && (
                    <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest animate-pulse"> Staged Target Point </span>
                  )}
                </div>
                
                {centralizedTimingConfig && (
                  <span className="text-[10px] text-zinc-400 font-bold bg-zinc-50 border border-zinc-150 px-2 py-0.5 rounded-lg shadow-inner">
                    ⏱ Duration: {centralizedTimingConfig.measures}m + {centralizedTimingConfig.beats}b
                  </span>
                )}
              </div>

              <div className="pl-1.5 select-text selection:bg-blue-50 text-zinc-800">
                {renderLiveOrchestrationLyricsLine(section.content)}
              </div>
            </div>
          );
        })}

        {sections.length === 0 && (
          <div className="p-16 text-center text-zinc-400 border border-dashed rounded-[2rem] bg-white space-y-2 select-none shadow-sm">
            <div className="text-3xl">🫙</div>
            <h4 className="font-black text-zinc-800 text-sm">Arrangement Workspace Is Empty</h4>
            <p className="text-xs text-zinc-400 font-medium">No structural section coordinates have been allocated to this track template library yet.</p>
          </div>
        )}
      </div>

      {/* ======================================================================= */}
      {/* --- IN-MEMORY RUNTIME CHANCE KEY MODAL OVERLAY ------------------------ */}
      {/* ======================================================================= */}
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
              <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Change Key</h3>
              <p className="text-xs font-black text-blue-500">Original Base {song.original_key}</p>
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
                      isSelected 
                        ? "bg-blue-600 text-white shadow-md scale-105" 
                        : "bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100"
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
              <button
                type="submit"
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-md transition-all active:scale-[0.99] cursor-pointer text-center"
              >
                Save
              </button>
            </div>

          </form>
        </div>
      )}

    </div>
  );
}