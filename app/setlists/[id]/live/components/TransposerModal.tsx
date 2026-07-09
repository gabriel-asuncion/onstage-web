import React from "react";
import { SongRecord } from "../types/setlist";
import { BASE_LETTER_ROOTS } from "../utils/music-math";

interface TransposerModalProps {
  isTransposerOpen: boolean;
  setIsTransposerOpen: (val: boolean) => void;
  activeSong: SongRecord | null;
  modalRoot: string;
  setModalRoot: (val: string) => void;
  modalAccidental: "" | "#" | "b";
  setModalAccidental: (val: "" | "#" | "b") => void;
  handleCommitTranspositionSave: (e: React.FormEvent) => void;
}

export function TransposerModal({
  isTransposerOpen, setIsTransposerOpen, activeSong,
  modalRoot, setModalRoot, modalAccidental, setModalAccidental,
  handleCommitTranspositionSave
}: TransposerModalProps) {
  if (!isTransposerOpen) return null;

  return (
    <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[210000] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-100 select-none">
      <form onSubmit={handleCommitTranspositionSave} className="bg-[#f8f9fa] border border-zinc-200 rounded-[2.5rem] shadow-2xl max-w-xl w-full p-7 px-8 space-y-6 animate-in zoom-in-95 duration-150 relative text-left">
        <button type="button" onClick={() => setIsTransposerOpen(false)} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white hover:bg-zinc-100 border text-zinc-400 text-xs font-bold flex items-center justify-center shadow-sm cursor-pointer transition-colors">✕</button>
        <div className="space-y-1">
          <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Setlist Transposer</h3>
          <p className="text-xs font-black text-blue-500">Original Song Base {activeSong?.original_key || "--"}</p>
        </div>
        
        <div className="grid grid-cols-7 gap-2 bg-white p-2 rounded-2xl border shadow-inner">
          {BASE_LETTER_ROOTS.map((letter) => (
            <button key={letter} type="button" onClick={() => setModalRoot(letter)} className={`aspect-square rounded-xl text-center text-sm font-black transition-all flex items-center justify-center cursor-pointer ${modalRoot === letter ? "bg-blue-600 text-white shadow-md scale-105" : "bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100"}`}>
              {letter}
            </button>
          ))}
        </div>
        
        <div className="grid grid-cols-2 divide-x bg-white rounded-2xl border overflow-hidden shadow-inner h-12">
          <button type="button" onClick={() => setModalAccidental(modalAccidental === "b" ? "" : "b")} className={`text-center text-base font-black transition-colors flex items-center justify-center h-full cursor-pointer ${modalAccidental === "b" ? "bg-blue-50/80 text-blue-600 font-extrabold" : "text-zinc-600 hover:bg-zinc-50/50"}`}>♭</button>
          <button type="button" onClick={() => setModalAccidental(modalAccidental === "#" ? "" : "#")} className={`text-center text-sm font-black transition-colors flex items-center justify-center h-full cursor-pointer ${modalAccidental === "#" ? "bg-blue-50/80 text-blue-600 font-extrabold" : "text-zinc-600 hover:bg-zinc-50/50"}`}>#</button>
        </div>
        
        <div className="pt-2">
          <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-md text-center cursor-pointer">
            Apply Rehearsal Override
          </button>
        </div>
      </form>
    </div>
  );
}