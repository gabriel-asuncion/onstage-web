import React from "react";
import { CompiledSectionToken, SetlistTrackItem } from "../types/setlist";
import { getSectionAbbreviation } from "../utils/setlist-helpers";
import { chordToRoman } from "../utils/music-math";

interface SimplifiedStackViewProps {
  memoizedSongAstTree: CompiledSectionToken[];
  currentSectionIndex: number;
  queuedSectionIndex: number | null;
  queuedTrackIndex: number | null;
  currentTrackIndex: number;
  activeLineIndex: number;
  chordFormat: "Key" | "Numbers";
  activeDisplayKey: string;
  getSectionDurationString: (sectionName: string, sectionIdx?: number) => string;
  simplifiedProgressBarRef: React.MutableRefObject<HTMLDivElement | null>;
  upcomingTrackItem: SetlistTrackItem | null;
}

export function SimplifiedStackView(props: SimplifiedStackViewProps) {
  const {
    memoizedSongAstTree, currentSectionIndex, queuedSectionIndex, queuedTrackIndex,
    currentTrackIndex, activeLineIndex, chordFormat, activeDisplayKey, getSectionDurationString,
    simplifiedProgressBarRef, upcomingTrackItem
  } = props;

  const getSecData = (idx: number) => {
    const ast = memoizedSongAstTree[idx];
    if (!ast) return null;
    const duration = getSectionDurationString(ast.section_name, idx);
    return { ast, duration };
  };

  const prevSec = getSecData(currentSectionIndex - 1);
  const currSec = getSecData(currentSectionIndex);
  const nextIdx = (queuedSectionIndex !== null && queuedTrackIndex === currentTrackIndex) ? queuedSectionIndex : currentSectionIndex + 1;
  const nextSec = getSecData(nextIdx);

  const getChords = (ast: any, lineIdx: number) => {
    if (!ast || !ast.lines[lineIdx]) return [];
    const rawChords = ast.lines[lineIdx].words.flatMap((w: any) => w.chords);
    return chordFormat === "Numbers" ? rawChords.map((ch: string) => chordToRoman(ch, activeDisplayKey)) : rawChords;
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 bg-[#f8f9fa] overflow-hidden relative z-0">
      <div className="w-full max-w-4xl flex flex-col gap-6 md:gap-8 items-center mt-[-8vh]">
        
        {/* TOP STACK (PREVIOUS) */}
        <div className="w-11/12 max-w-3xl h-16 md:h-20 bg-zinc-100 border border-zinc-200 rounded-2xl flex items-center justify-center px-6 opacity-50 shadow-inner relative mt-4">
          <div className="absolute -top-3.5 left-6 flex items-center bg-zinc-100 border border-zinc-200 rounded-full p-0.5 pr-2.5 shadow-sm z-10">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black mr-1.5 shadow-inner bg-zinc-200 text-zinc-500">{prevSec ? getSectionAbbreviation(prevSec.ast.section_name) : "S"}</div>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{prevSec ? prevSec.ast.section_name : "START"}</span>
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

        {/* MIDDLE STACK (CURRENT) */}
        <div className="w-full h-32 md:h-44 bg-white border-2 border-blue-500 rounded-3xl flex flex-col justify-center px-6 md:px-10 shadow-2xl relative ring-8 ring-blue-500/10">
          <div className="absolute inset-0 rounded-[1.35rem] overflow-hidden pointer-events-none">
            <div ref={simplifiedProgressBarRef} className="absolute bottom-0 left-0 h-2 md:h-3 bg-blue-500 origin-left scale-x-0 w-full z-0" style={{ willChange: 'transform' }} />
          </div>
          <div className="absolute -top-4 left-6 flex items-center bg-white border-2 border-blue-500 rounded-full p-0.5 pr-3 shadow-sm select-none z-10">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black mr-2 shadow-inner bg-blue-600 text-white">{currSec ? getSectionAbbreviation(currSec.ast.section_name) : "F"}</div>
            <span className="text-xs font-black uppercase tracking-wider text-blue-700">{currSec ? currSec.ast.section_name : "FLOW"}</span>
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

        {/* BOTTOM STACK (NEXT) */}
        <div className="w-11/12 max-w-3xl h-16 md:h-20 bg-white border border-zinc-200 rounded-2xl flex items-center justify-center px-6 opacity-90 shadow-sm relative mt-2">
          {(queuedSectionIndex !== null && queuedTrackIndex === currentTrackIndex) && (
            <div className="absolute -top-3 right-20 bg-purple-600 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm z-20 animate-pulse">⚡ QUEUED</div>
          )}
          <div className="absolute -top-3.5 left-6 flex items-center bg-white border border-zinc-200 rounded-full p-0.5 pr-2.5 shadow-sm z-10">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black mr-1.5 shadow-inner bg-zinc-100 text-zinc-500">{nextSec ? getSectionAbbreviation(nextSec.ast.section_name) : "N"}</div>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">{nextSec ? nextSec.ast.section_name : (upcomingTrackItem ? `NEXT: ${upcomingTrackItem.songs?.title}` : "END")}</span>
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
    </div>
  );
}