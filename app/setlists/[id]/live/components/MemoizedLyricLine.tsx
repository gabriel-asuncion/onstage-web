import React from "react";
import { ParsedLineToken } from "../types/setlist";
import { chordToRoman } from "../utils/music-math";

interface MemoizedLyricLineProps {
  line: ParsedLineToken;
  sectionIndex: number;
  lineIndex: number;
  isCurrentlyPlayingLine: boolean;
  showChords: boolean;
  lyricsFontSize: number;
  lineSpacing: number;
  chordFormat: "Key" | "Numbers";
  activeDisplayKey: string;
}

export const MemoizedLyricLine = React.memo(({ 
  line, sectionIndex, lineIndex, isCurrentlyPlayingLine, showChords, 
  lyricsFontSize, lineSpacing, chordFormat, activeDisplayKey 
}: MemoizedLyricLineProps) => {
  return (
    <div id={`line-${sectionIndex}-${lineIndex}`} style={{ paddingBottom: `${Math.max(2, lineSpacing - 12)}px` }} className={`flex flex-col sm:flex-row sm:items-start justify-between gap-1 border-b border-zinc-100/40 last:border-0 px-2 py-1 -mx-2 rounded-xl transition-all duration-300 ${isCurrentlyPlayingLine ? "bg-zinc-100/80 shadow-sm scale-[1.002] border-transparent z-20" : ""}`}>
      <div className="flex flex-wrap items-end gap-x-1.5 gap-y-2.5 leading-none flex-1 mt-1">
        {line.words.map((wordObj, wIdx) => (
          <div key={wIdx} className="flex flex-col items-start justify-end">
            {showChords && wordObj.chords.length > 0 && (
              <div className="w-0 overflow-visible whitespace-nowrap">
                <div className="text-[14px] md:text-[15px] font-['Roboto_Condensed'] font-bold tracking-tight pb-0.5 select-none text-blue-600 flex">
                  {wordObj.chords.map((ch, cIdx) => (
                    <span key={cIdx} className="mr-1 px-1 rounded border bg-blue-50/60 border-blue-100/40 inline-block leading-none">
                      {chordFormat === "Numbers" ? chordToRoman(ch, activeDisplayKey) : ch}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ fontSize: `${lyricsFontSize}px`, fontFamily: "'Roboto Condensed', sans-serif" }} className="font-medium tracking-tight transition-all duration-100 text-zinc-950 uppercase">
              {wordObj.word || " "}
            </div>
          </div>
        ))}
      </div>
      {line.comment && <div style={{ fontFamily: "'Nothing You Could Do', cursive" }} className="text-[14px] tracking-wide select-none whitespace-nowrap sm:pl-4 self-end text-zinc-400">{line.comment}</div>}
    </div>
  );
});
MemoizedLyricLine.displayName = "MemoizedLyricLine";