"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";

interface SongRecord {
  id: string;
  title: string;
  artist: string;
  original_key: string;
  tempo: number;
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

export default function MasterSongProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const songId = params?.id as string;

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

  async function loadMasterSongProfile() {
    try {
      setLoading(true);
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

  // Symmetrical CSS evaluation mappings for responsive view parameters
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

  if (loading) return <div className="p-8 text-center text-xs font-black uppercase tracking-widest text-zinc-400 animate-pulse">Syncing Master Sheet Engine...</div>;
  if (!song) return <div className="p-12 text-center text-sm font-bold text-zinc-500">Song master record profile missing or deleted.</div>;

  return (
    <div className="absolute inset-0 flex flex-col bg-[#f8f9fa] overflow-hidden select-none">
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

      {/* ======================================================================= */}
      {/* --- RE-ARCHITECTED FULL-WIDTH STICKY COCKPIT HEADER ------------------ */}
      {/* ======================================================================= */}
      {/* YELLOW RE-DESIGN FIX: Removed container background card, extending directly across screen layouts */}
      <div id="fixed-live-header" className="w-full bg-white border-b border-zinc-200 px-6 py-4 flex-shrink-0 z-50 shadow-sm select-none">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-6 w-full relative">
          
          {/* LEFT METADATA COLUMN SEGMENT */}
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <button 
              type="button" 
              onClick={() => router.back()} 
              className="w-8 h-8 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-500 font-bold text-xs flex items-center justify-center shrink-0 shadow-sm"
            >
              ‹
            </button>
            <div className="min-w-0 leading-tight space-y-0.5">
              
              {/* YELLOW RE-DESIGN FIX: Removed master catalog label, moving BPM chip up cleanly to the crown header position */}
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

          {/* RIGHT ACTION CONTROLS SEGMENT */}
          {/* YELLOW RE-DESIGN FIX: Combined transposer button and preferences engine controls into a single streamlined metadata block row */}
          <div className="flex items-center gap-2 shrink-0">
            
            {/* REHEARSAL KEY MODIFIER TRANSPOSER */}
            <button
              type="button"
              onClick={handleOpenTransposerModal}
              className="bg-white border border-zinc-200 rounded-xl p-2.5 px-3.5 text-xs font-bold text-zinc-400 shadow-sm flex items-center gap-1 hover:border-blue-500 hover:text-blue-600 transition-colors cursor-pointer h-10"
            >
              KEY <span className="text-blue-600 font-black text-sm">{activeDisplayKey}</span>
            </button>

            {/* Preferences Overlay Toggle Trigger */}
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
          
          {memoizedSongAstTree.map((section) => (
            <div
              key={section.id}
              className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm relative transition-all"
            >
              <div className="flex items-center justify-between border-b border-zinc-100/80 pb-2.5 mb-4 select-none">
                <span className="font-black text-[10px] uppercase tracking-wider px-3 py-1 bg-blue-50 text-blue-600 rounded-full">
                  {section.section_name}
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
          ))}

          {sections.length === 0 && (
            <div className="bg-white border border-dashed text-center text-zinc-400 p-16 rounded-2xl font-bold select-none text-sm">
              This master profile template is completely blank. Instantiation coordinates have no loaded lyrics.
            </div>
          )}
        </div>
      </div>

      {/* ======================================================================= */}
      {/* --- UNIFIED CONSOLE PREFERENCES INTERACTIVE OVERLAY (image_4a1fe0.png) - */}
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

            {/* PREF BLOCK 1: Chord Notation Display Layout Toggle */}
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

            {/* PREF BLOCK 2: Re-Designed Lyrics Font Display Size Segmented Row */}
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

            {/* PREF BLOCK 3: Line Spacing Padding Segmented Row */}
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

    </div>
  );
}