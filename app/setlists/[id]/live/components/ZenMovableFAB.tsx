"use client";

import React, { useState, useRef } from "react";

export interface ZenMovableFABProps {
  isMD: boolean;
  isPlayingFlow: boolean;
  onTogglePlay: () => void;
  onOpenSettings: () => void;
  onExitZen: () => void;
}

export function ZenMovableFAB({ 
  isMD, 
  isPlayingFlow, 
  onTogglePlay, 
  onOpenSettings, 
  onExitZen 
}: ZenMovableFABProps) {
  const [pos, setPos] = useState({ x: 20, y: 20 });
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, initialX: pos.x, initialY: pos.y };
    setIsDragging(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) setIsDragging(true);
    setPos({ x: dragRef.current.initialX + dx, y: dragRef.current.initialY + dy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) { e.preventDefault(); return; }
    setIsOpen(!isOpen);
  };

  return (
    // ✅ FIX 1: Wrapper is strictly constrained to the 56x56px button size. It will never nudge.
    <div style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} className="fixed top-0 left-0 z-[500000] w-14 h-14 touch-none">
      
      {/* Main Anchor Button */}
      <button 
        onPointerDown={handlePointerDown} 
        onPointerMove={handlePointerMove} 
        onPointerUp={handlePointerUp} 
        onClick={handleClick}
        className="relative w-14 h-14 bg-white/95 backdrop-blur-sm text-zinc-700 rounded-full shadow-xl border border-zinc-200/80 flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform active:scale-95 z-20"
      >
        <span className="text-[26px]">🧘</span>
      </button>

      {/* Expanded Menu */}
      {isOpen && (
        // ✅ FIX 2: Menu is perfectly isolated (absolute) so it drops below the button without expanding the wrapper.
        <div className="absolute top-[68px] left-1/2 -translate-x-1/2 flex flex-col gap-2 bg-white/95 backdrop-blur-xl p-2 rounded-[28px] shadow-2xl border border-zinc-200/80 animate-in zoom-in-95 slide-in-from-top-2 duration-200 z-10 w-14 items-center">
          
          {isMD && (
            <button 
              onClick={() => { onTogglePlay(); setIsOpen(false); }} 
              className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm text-sm font-black transition-colors ${isPlayingFlow ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'}`}
            >
              {isPlayingFlow ? '⏹' : '▶'}
            </button>
          )}

          <button 
            onClick={() => { onOpenSettings(); setIsOpen(false); }} 
            className="w-10 h-10 rounded-full bg-zinc-50 hover:bg-zinc-100 text-zinc-600 border border-zinc-200/50 flex items-center justify-center shadow-sm text-[15px] transition-colors"
          >
            ⚙️
          </button>
          
          <div className="w-full h-[1px] bg-zinc-100 my-0.5" />
          
          <button 
            onClick={onExitZen} 
            className="w-10 h-10 rounded-full bg-zinc-50 hover:bg-red-50 text-zinc-400 hover:text-red-500 border border-zinc-200/50 flex items-center justify-center shadow-sm text-lg transition-colors leading-none pb-0.5"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}