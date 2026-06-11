"use client";

interface LaneTrackItem { id: string; title: string; order: number; active: boolean; songId: string; key: string; }

interface SetlistSidebarProps {
  tracks: LaneTrackItem[];
  onTrackSelect: (songId: string) => void;
  onBackToTower: () => void;
}

export default function SetlistSidebar({ tracks, onTrackSelect, onBackToTower }: SetlistSidebarProps) {
  return (
    <aside className="w-80 bg-white border-r border-zinc-200/80 flex flex-col h-full shrink-0 select-none">
      <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
        <div>
          <button 
            onClick={onBackToTower}
            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 mb-1"
          >
            ‹ Back to Command Tower
          </button>
          <h3 className="font-black text-lg text-zinc-900 tracking-tight">Setlist Order</h3>
        </div>
        <span className="bg-zinc-200 text-zinc-600 font-black text-[11px] px-2.5 py-1 rounded-full">
          {tracks.length} Tracks
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-zinc-50/20">
        {tracks.map((track) => (
          <div
            key={track.id}
            onClick={() => { if (!track.active) onTrackSelect(track.songId); }}
            className={`p-4 rounded-2xl border transition-all flex items-center justify-between cursor-pointer shadow-sm ${
              track.active 
                ? "bg-blue-600 border-blue-600 text-white font-bold scale-[1.01] shadow-md shadow-blue-500/10" 
                : "bg-white border-zinc-200/60 hover:bg-zinc-50 text-zinc-800"
            }`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <span className={`text-xs font-black w-5 shrink-0 ${track.active ? "text-blue-100" : "text-zinc-400"}`}>
                {track.order}
              </span>
              <h4 className="text-[14px] font-bold truncate tracking-tight">{track.title}</h4>
            </div>
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0 border ${
              track.active ? "bg-white/20 border-white/10 text-white" : "bg-zinc-50 text-zinc-500"
            }`}>
              {track.key}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}