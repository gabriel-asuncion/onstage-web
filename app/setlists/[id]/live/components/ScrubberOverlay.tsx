import React, { useState } from "react";
import { ArrangementSection } from "../types/setlist";
import { getSectionAbbreviation } from "../utils/setlist-helpers";

interface ScrubberOverlayProps {
  sections: ArrangementSection[];
  currentSectionIndex: number;
  queuedTrackIndex: number | null;
  currentTrackIndex: number;
  queuedSectionIndex: number | null;
  isPlayingFlow: boolean;
  sectionRefs: React.MutableRefObject<{ [key: string]: HTMLDivElement | null }>;
  isAutoScrollingRef: React.MutableRefObject<boolean>;
  setShowSyncBack: (val: boolean) => void;
}

export function ScrubberOverlay({
  sections, currentSectionIndex, queuedTrackIndex, currentTrackIndex,
  queuedSectionIndex, isPlayingFlow, sectionRefs, isAutoScrollingRef, setShowSyncBack
}: ScrubberOverlayProps) {
  
  const [isScrubberActive, setIsScrubberActive] = useState(false);
  const [scrubberHoverIndex, setScrubberHoverIndex] = useState<number | null>(null);

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
      const targetSection = sections[scrubberHoverIndex];
      if (targetSection) {
        const targetElement = sectionRefs.current[targetSection.id];
        if (targetElement) {
          isAutoScrollingRef.current = true;
          if ((window as any)._autoScrollTimeout) clearTimeout((window as any)._autoScrollTimeout);
          targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
          setShowSyncBack(true); 
          (window as any)._autoScrollTimeout = setTimeout(() => {
            isAutoScrollingRef.current = false;
          }, 1500);
        }
      }
      setScrubberHoverIndex(null);
    }
  };

  if (sections.length === 0) return null;

  return (
    <div
      onPointerDown={handleScrubberPointerDown}
      onPointerMove={isScrubberActive ? handleScrubberPointerMove : undefined}
      onPointerUp={handleScrubberPointerUp}
      onPointerCancel={handleScrubberPointerUp}
      className={`fixed right-0 top-[140px] landscape:top-[80px] bottom-24 z-40 flex flex-col overflow-y-auto custom-scrollbar pl-12 pr-1 md:pr-3 touch-none transition-all duration-300 select-none ${
        isScrubberActive ? "w-48" : "w-10"
      }`}
    >
      <div className="relative z-10 flex flex-col items-end gap-2 md:gap-3 py-4 my-auto transition-all duration-300 w-full min-h-min">
        {sections.map((sec, idx) => {
          const isHovered = scrubberHoverIndex === idx;
          const isActive = currentSectionIndex === idx;
          const isQueued = queuedTrackIndex === currentTrackIndex && queuedSectionIndex === idx;
          const isNext = isPlayingFlow && !isQueued && (queuedTrackIndex === null || queuedTrackIndex !== currentTrackIndex) && (idx === currentSectionIndex + 1);
          const abbr = getSectionAbbreviation(sec.section_name);
          
          return (
            <div key={`scrub-${sec.id}`} data-scrubber-index={idx} className={`flex items-center justify-end gap-3 transition-all duration-200 w-full text-right ${isHovered ? "-translate-x-1" : isScrubberActive ? "cursor-crosshair" : "cursor-pointer"}`}>
              <span data-scrubber-index={idx} className={`font-black uppercase tracking-wider transition-all duration-200 ${!isScrubberActive ? "hidden opacity-0" : isHovered ? "text-[16px] text-black opacity-100 scale-105 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]" : "text-[12px] text-black opacity-90"}`}>
                {sec.section_name}
              </span>
              <div data-scrubber-index={idx} className={`rounded-full transition-all duration-300 shrink-0 shadow-sm flex items-center justify-center overflow-hidden ${isActive ? "w-6 h-6 bg-blue-600 ring-2 ring-blue-500/20 text-white font-black text-[9px] shadow-md" : isQueued ? `bg-purple-500 ring-2 ring-purple-500/20 text-white font-black text-[8px] ${isHovered ? "w-6 h-6" : "w-5 h-5"}` : isNext ? `bg-blue-400/80 ring-2 ring-blue-400/10 text-white font-black text-[8px] ${isHovered ? "w-6 h-6" : "w-5 h-5"}` : isHovered ? "w-3 h-3 bg-blue-400 ring-4 ring-blue-400/20" : "w-1.5 h-1.5 bg-zinc-400/80 hover:bg-zinc-500"}`}>
                {(isActive || isQueued || isNext) && <span className="pt-[1px]">{abbr}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}