import React from "react";

interface AddBlockModalProps {
  isAddBlockModalOpen: boolean;
  setIsAddBlockModalOpen: (val: boolean) => void;
  availableSectionNames: string[];
  handleModalAppendNewSectionItem: (name: string) => void;
}

export function AddBlockModal({
  isAddBlockModalOpen, setIsAddBlockModalOpen, availableSectionNames, handleModalAppendNewSectionItem
}: AddBlockModalProps) {
  if (!isAddBlockModalOpen) return null;

  return (
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
  );
}