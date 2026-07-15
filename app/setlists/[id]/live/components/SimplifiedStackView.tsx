import React, { useEffect, useRef, useState } from "react";
import { CompiledSectionToken, SetlistTrackItem } from "../types/setlist";
import { getSectionAbbreviation } from "../utils/setlist-helpers";
import { MemoizedLyricLine } from "./MemoizedLyricLine";

interface SimplifiedStackViewProps {
  setlistAst?: any[]; 
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
  
  handleSectionInteractiveSelection: (idx: number) => void;
  handleUserSelectTrackBadge: (trackIdx: number) => void;
  showChords: boolean;
  lyricsFontSize: number;
  lineSpacing: number;
}

export function SimplifiedStackView(props: SimplifiedStackViewProps) {
  const {
    setlistAst = [], currentSectionIndex, queuedSectionIndex, queuedTrackIndex, currentTrackIndex,
    activeLineIndex, chordFormat, getSectionDurationString, simplifiedProgressBarRef,
    handleSectionInteractiveSelection, handleUserSelectTrackBadge, showChords, lyricsFontSize, lineSpacing
  } = props;

  const [overflowingTitles, setOverflowingTitles] = useState<{ [key: string]: boolean }>({});
  const titleRefs = useRef<{ [key: string]: HTMLHeadingElement | null }>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef(0);

  // ✅ FIX 3: Robust Spy Scroll Engine ensures Scrubber stays synced!
  const handleScroll = () => {
    const now = Date.now();
    if (now - lastScrollTime.current < 50) return; // 50ms throttle keeps it buttery smooth
    lastScrollTime.current = now;

    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const containerTop = container.getBoundingClientRect().top;

    let activeIdx = currentTrackIndex;
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;
    
    if (isAtBottom) {
      activeIdx = setlistAst[setlistAst.length - 1].trackIndex;
    } else {
      setlistAst.forEach(song => {
        const el = document.getElementById(`stack-song-${song.trackIndex}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const relativeTop = rect.top - containerTop;
          // If the song hits the upper quadrant of the screen, mark it active!
          if (relativeTop <= 200) {
            activeIdx = song.trackIndex;
          }
        }
      });
    }

    if (activeIdx !== currentTrackIndex) {
      handleUserSelectTrackBadge(activeIdx);
    }
  };

  useEffect(() => {
    const checkOverflows = () => {
      const newOverflows: { [key: string]: boolean } = {};
      Object.keys(titleRefs.current).forEach(key => {
        const el = titleRefs.current[key];
        if (el && el.parentElement) {
          el.classList.remove("truncate");
          el.style.whiteSpace = "nowrap";
          const isOverflowing = el.scrollWidth > el.parentElement.clientWidth;
          newOverflows[key] = isOverflowing;
          if (isOverflowing) el.parentElement.style.setProperty('--marquee-container-width', `${el.parentElement.clientWidth}px`);
          else el.classList.add("truncate");
        }
      });
      setOverflowingTitles(newOverflows);
    };
    const timer = setTimeout(checkOverflows, 100);
    window.addEventListener('resize', checkOverflows);
    return () => { clearTimeout(timer); window.removeEventListener('resize', checkOverflows); };
  }, [setlistAst]);

  if (!setlistAst || setlistAst.length === 0) return null;

  return (
    <div 
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto custom-scrollbar bg-[#f8f9fa] relative z-0 scroll-smooth pb-[50vh]"
    >
      <style>{`
        @keyframes marquee-dynamic {
          0%, 15% { transform: translateX(0); }
          85%, 100% { transform: translateX(calc(var(--marquee-container-width) - 100%)); }
        }
        .animate-marquee-dynamic {
          display: inline-block;
          animation: marquee-dynamic 7s ease-in-out infinite alternate;
        }
      `}</style>

      {/* ======================================================= */}
      {/* ✅ FIX 1: THE SINGLE DYNAMIC SLOT-MACHINE HEADER          */}
      {/* ======================================================= */}
      <div className="sticky top-0 z-40 bg-[#f8f9fa]/95 backdrop-blur-md border-b border-zinc-200 shadow-sm w-full h-[76px] overflow-hidden">
        <div className="w-full max-w-5xl mx-auto h-full relative">
          {setlistAst.map((song, idx) => {
            const isActive = idx === currentTrackIndex;
            const isPast = idx < currentTrackIndex;
            
            return (
              <div 
                key={song.trackId}
                className={`absolute inset-0 flex items-center gap-3 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] px-4 md:px-8 ${
                  isActive ? "translate-y-0 opacity-100 pointer-events-auto scale-100" :
                  isPast ? "-translate-y-full opacity-0 pointer-events-none scale-95" :
                  "translate-y-full opacity-0 pointer-events-none scale-95"
                }`}
              >
                <span className="text-blue-600 font-black text-xl md:text-2xl opacity-40 shrink-0">#{song.trackIndex + 1}</span>
                
                <div className="flex-1 min-w-0 overflow-hidden relative flex items-center h-8" style={{ maskImage: overflowingTitles[song.trackId] ? "linear-gradient(to right, black 85%, transparent 100%)" : "none", WebkitMaskImage: overflowingTitles[song.trackId] ? "linear-gradient(to right, black 85%, transparent 100%)" : "none" }}>
                  <h2 
                    ref={(el) => { titleRefs.current[song.trackId] = el; }} 
                    className={`text-2xl md:text-3xl font-black text-zinc-900 tracking-tight leading-none ${overflowingTitles[song.trackId] ? 'animate-marquee-dynamic pr-8' : 'truncate'}`}
                  >
                    {song.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2 ml-auto shrink-0 hidden sm:block">
                  <span className="bg-zinc-200 text-zinc-600 text-[10px] font-black uppercase px-2 py-1 rounded-md shadow-inner">
                    {song.tempo} BPM
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto flex flex-col pt-8">
        {setlistAst.map((song) => {
           const isCurrentSong = song.trackIndex === currentTrackIndex;

           return (
             <div key={song.trackId} className={`flex flex-col relative pb-16 md:pb-24`} id={`stack-song-${song.trackIndex}`}>
               
               {/* ======================================================= */}
               {/* SONG SECTIONS TIMELINE                                  */}
               {/* ======================================================= */}
               <div className="flex flex-col gap-6 md:gap-7 px-4 md:px-8">
                 {song.ast.map((sec: any, secIdx: number) => {
                   const isActive = isCurrentSong && currentSectionIndex === secIdx;
                   const isQueued = queuedTrackIndex === song.trackIndex && queuedSectionIndex === secIdx;

                   return (
                     <div
                       key={sec.id}
                       id={`stack-sec-${song.trackIndex}-${secIdx}`}
                       onClick={() => {
                         if (!isCurrentSong) {
                           handleUserSelectTrackBadge(song.trackIndex);
                           setTimeout(() => handleSectionInteractiveSelection(secIdx), 150);
                         } else {
                           handleSectionInteractiveSelection(secIdx);
                         }
                       }}
                       // ✅ FIX 2: Removed `overflow-hidden` so Badges & Pills pop out flawlessly!
                       className={`bg-white border rounded-xl md:rounded-2xl px-4 pb-3 pt-5 md:px-5 md:pb-4 md:pt-6 shadow-sm transition-all duration-300 relative cursor-pointer ${
                         isActive 
                           ? "border-blue-500 ring-4 ring-blue-500/10 shadow-md z-20 scale-[1.02]" 
                           : isQueued
                           ? "border-purple-500 ring-4 ring-purple-500/10 scale-[1.001] shadow-md z-10"
                           : "border-zinc-200 opacity-60 hover:opacity-100 hover:border-blue-400 hover:bg-zinc-50/30"
                       }`}
                     >
                       
                       {/* The Progress Bar Tracker (Safely wrapped in its own hidden container) */}
                       {isActive && (
                         <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl md:rounded-2xl">
                           <div ref={simplifiedProgressBarRef} className="absolute bottom-0 left-0 h-1.5 md:h-2 bg-blue-500 origin-left scale-x-0 w-full z-0" style={{ willChange: 'transform' }} />
                         </div>
                       )}

                       {/* The Pop-Out Section Badge */}
                       <div className={`absolute -top-3.5 left-4 flex items-center bg-white border rounded-full p-0.5 pr-3 shadow-sm select-none z-10 transition-colors ${isActive ? "border-blue-400" : "border-blue-200/60"}`}>
                         <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black mr-2 shadow-inner ${isActive ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-500"}`}>
                           {getSectionAbbreviation(sec.section_name)}
                         </div>
                         <span className={`text-[11px] font-black uppercase tracking-wider ${isActive ? "text-blue-700" : "text-blue-500"}`}>
                           {sec.section_name}
                         </span>
                         {isQueued && (<span className="ml-2 text-[8px] font-black bg-purple-600 text-white uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm">⚡ QUEUED</span>)}
                       </div>

                       {/* The Pop-Out Duration Pill */}
                       <div className="absolute -top-3.5 right-4 flex items-center bg-white border border-zinc-200 rounded-full px-2.5 py-1 shadow-sm select-none z-10 transition-colors">
                         <span className="text-[10px] font-mono font-bold text-zinc-400">
                           ⏱ {getSectionDurationString(sec.section_name, isCurrentSong ? secIdx : undefined)}
                         </span>
                       </div>

                       <div className="pl-0.5 select-text selection:bg-blue-50 text-zinc-800 space-y-0.5 mt-2 relative z-10">
                         {sec.lines.length === 0 ? <div className="h-4" /> : sec.lines.map((line: any, lIdx: number) => {
                           const isLineActive = isActive && activeLineIndex === lIdx;

                           return (
                             <div 
                               key={lIdx} 
                               className={`transition-all duration-300 ${isLineActive ? "opacity-100" : isActive ? "opacity-30" : "opacity-100"}`}
                             >
                               <MemoizedLyricLine 
                                 line={line} 
                                 sectionIndex={isCurrentSong ? secIdx : 9999 + secIdx} 
                                 lineIndex={lIdx} 
                                 isCurrentlyPlayingLine={isLineActive}
                                 showChords={showChords} 
                                 lyricsFontSize={lyricsFontSize} 
                                 lineSpacing={lineSpacing} 
                                 chordFormat={chordFormat} 
                                 activeDisplayKey={song.displayKey}
                               />
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   );
                 })}
               </div>
               
             </div>
           );
        })}
      </div>
    </div>
  );
}