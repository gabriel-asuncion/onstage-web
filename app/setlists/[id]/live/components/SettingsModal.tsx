import React from "react";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SongRecord } from "../types/setlist";

interface SettingsModalProps {
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (val: boolean) => void;
  localPresenceUser: any;
  onlineUsers: any[];
  handleToggleMusicDirectorMode: () => void;
  showChords: boolean;
  setShowChords: (val: boolean) => void;
  chordFormat: "Key" | "Numbers";
  setChordFormat: (val: "Key" | "Numbers") => void;
  isSimplifiedMode: boolean;
  setIsSimplifiedMode: (val: boolean) => void;

  // ✅ Added Zen Mode Props
  isZenMode: boolean;
  setIsZenMode: (val: boolean) => void;

  lineSpacing: number;
  setLineSpacing: (val: number) => void;
  lyricsFontSize: number;
  setLyricsFontSize: (val: number) => void;
  isMetronomeSoundEnabled: boolean;
  setIsMetronomeSoundEnabled: (val: boolean) => void;
  isDoubleMetronomeEnabled: boolean;
  setIsDoubleMetronomeEnabled: (val: boolean) => void;
  localClickVolume: number;
  setLocalClickVolume: (val: number) => void;
  audioLatencyOffsetMs: number;
  setAudioLatencyOffsetMs: (val: number) => void;
  isTestingSync: boolean;
  setIsTestingSync: (val: boolean) => void;
  testVisualBeat: number;
  activeSong: SongRecord | null;
  isYoutubeSyncEnabled: boolean;
  setIsYoutubeSyncEnabled: (val: boolean) => void;
  youtubeVolume: number;
  setYoutubeVolume: (val: number) => void;
  isAdmin: boolean;
  isPlayingFlow: boolean;
  router: AppRouterInstance;
  handleOpenTransposerModal: () => void;
  setIsStructureModalOpen: (val: boolean) => void;
}

export function SettingsModal(props: SettingsModalProps) {
  if (!props.isSettingsModalOpen) return null;

  const {
    isSettingsModalOpen, setIsSettingsModalOpen, localPresenceUser, onlineUsers, handleToggleMusicDirectorMode,
    showChords, setShowChords, chordFormat, setChordFormat, isSimplifiedMode, setIsSimplifiedMode,
    isZenMode, setIsZenMode, // ✅ Destructured Zen Props
    lineSpacing, setLineSpacing, lyricsFontSize, setLyricsFontSize,
    isMetronomeSoundEnabled, setIsMetronomeSoundEnabled, isDoubleMetronomeEnabled, setIsDoubleMetronomeEnabled,
    localClickVolume, setLocalClickVolume, audioLatencyOffsetMs, setAudioLatencyOffsetMs,
    isTestingSync, setIsTestingSync, testVisualBeat, activeSong, isYoutubeSyncEnabled, setIsYoutubeSyncEnabled,
    youtubeVolume, setYoutubeVolume, isAdmin, isPlayingFlow, router, handleOpenTransposerModal, setIsStructureModalOpen
  } = props;

  const alternateMD = onlineUsers.find(u => u.isMD && u.id !== localPresenceUser?.id);

  return (
    <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[200000] flex items-end sm:items-center justify-center select-none animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={() => setIsSettingsModalOpen(false)} />
      <div className="bg-white w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col relative animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        
        <div className="flex-shrink-0 relative flex items-center justify-center pt-5 pb-4 px-4 border-b border-zinc-100">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-zinc-200 rounded-full sm:hidden" />
          <button type="button" onClick={() => setIsSettingsModalOpen(false)} className="absolute left-5 w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 text-sm font-bold flex items-center justify-center hover:bg-zinc-200 transition-colors">✕</button>
          <h3 className="text-base font-bold text-zinc-900 tracking-tight">Preferences</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-7 custom-scrollbar pb-12">
          
          {/* Performance Authorization */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-900 block">Performance Authorization</label>
            <div className="bg-zinc-50/50 border border-zinc-100 rounded-2xl overflow-hidden">
              <button type="button" onClick={handleToggleMusicDirectorMode} className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${localPresenceUser?.isMD ? "bg-blue-100 text-blue-600" : alternateMD ? "bg-zinc-200 text-zinc-500" : "bg-zinc-100 text-zinc-600"}`}>
                    {localPresenceUser?.isMD ? "👑" : alternateMD ? "🔒" : "🎧"}
                  </span>
                  <span className="text-sm font-bold text-zinc-700">
                    {localPresenceUser?.isMD ? "You are Music Director" : alternateMD ? `MD Mode Active (${alternateMD?.name})` : "Take MD Control"}
                  </span>
                </div>
                <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${localPresenceUser?.isMD ? 'bg-blue-500' : 'bg-zinc-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${localPresenceUser?.isMD ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </button>
            </div>
          </div>

          {/* Display Options */}
          <div className="space-y-4">
            <label className="text-xs font-bold text-zinc-900 block">Display Options</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-500">Chord Notation</span>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  <button onClick={() => setShowChords(true)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${showChords ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Show</button>
                  <button onClick={() => setShowChords(false)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${!showChords ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Hide</button>
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-500">Chord Format</span>
                <span className="bg-blue-50 text-blue-600 font-mono font-black text-[8px] px-1.5 py-0.5 rounded ml-1">Experimental</span>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  <button onClick={() => setChordFormat("Key")} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${chordFormat === "Key" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Key</button>
                  <button onClick={() => setChordFormat("Numbers")} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${chordFormat === "Numbers" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Numbers</button>
                </div>
              </div>
              
              {/* ✅ SURGICAL FIX: Integrated 3-Way Zen Mode Toggle */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-500">View Mode</span>
                <span className="bg-blue-50 text-blue-600 font-mono font-black text-[8px] px-1.5 py-0.5 rounded ml-1">Experimental</span>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  <button 
                    onClick={() => { setIsZenMode(false); setIsSimplifiedMode(false); }} 
                    className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${!isSimplifiedMode && !isZenMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                  >
                    Sheet
                  </button>
                  <button 
                    onClick={() => { setIsZenMode(false); setIsSimplifiedMode(true); }} 
                    className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${isSimplifiedMode && !isZenMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                  >
                    Stack
                  </button>
                  <button 
                    onClick={() => { setIsZenMode(true); setIsSettingsModalOpen(false); }} 
                    className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${isZenMode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                  >
                    Zen
                  </button>
                </div>
              </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-500">Line Spacing</span>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  {([ { label: "Compact", spacing: 16 }, { label: "Comfort", spacing: 24 }, { label: "Spacious", spacing: 32 } ]).map((preset) => (
                    <button key={preset.label} onClick={() => setLineSpacing(preset.spacing)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${lineSpacing === preset.spacing ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-zinc-500">Lyrics Size</span>
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  {([ { label: "Small", size: 14 }, { label: "Medium", size: 16 }, { label: "Large", size: 20 }, { label: "Huge", size: 24 } ]).map((preset) => (
                    <button key={preset.label} onClick={() => setLyricsFontSize(preset.size)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg transition-all ${lyricsFontSize === preset.size ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Metronome & Audio */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-900 block">Metronome & Audio
              <span className="bg-blue-50 text-blue-600 font-mono font-black text-[8px] px-1.5 py-0.5 rounded ml-1">Experimental</span>
            </label>
            <div className="flex bg-zinc-100 p-1 rounded-xl">
              <button onClick={() => setIsMetronomeSoundEnabled(true)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${isMetronomeSoundEnabled ? "bg-blue-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Click ON</button>
              <button onClick={() => setIsMetronomeSoundEnabled(false)} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!isMetronomeSoundEnabled ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>Click OFF</button>
            </div>

            {isMetronomeSoundEnabled && (
              <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 animate-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-4 border-b border-zinc-200/60 pb-4">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-zinc-600">Double Metronome</span>
                    <span className="text-[9px] font-bold text-zinc-400">Play 8th-note subdivisions</span>
                  </div>
                  <button type="button" onClick={() => setIsDoubleMetronomeEnabled(!isDoubleMetronomeEnabled)} className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors shadow-inner ${isDoubleMetronomeEnabled ? 'bg-blue-500' : 'bg-zinc-200'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isDoubleMetronomeEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between mb-4 border-b border-zinc-200/60 pb-4">
                  <span className="text-[11px] font-bold text-zinc-600">Local Click Volume</span>
                  <input type="range" min="0" max="1" step="0.05" value={localClickVolume} onChange={(e) => setLocalClickVolume(parseFloat(e.target.value))} className="w-24 accent-blue-600" />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold text-zinc-600">Bluetooth Sync Offset</span>
                  <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg px-2 py-1 shadow-sm">
                    <input type="number" min={0} max={2000} value={audioLatencyOffsetMs} onChange={(e) => setAudioLatencyOffsetMs(parseInt(e.target.value) || 0)} className="w-10 bg-transparent text-center font-bold text-xs text-zinc-900 outline-none" />
                    <span className="text-[10px] font-bold text-zinc-400">ms</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-zinc-200 shadow-inner flex-1 justify-center">
                    {[1, 2, 3, 4].map((beatNum) => (
                      <div key={`test-${beatNum}`} className={`w-6 h-6 flex items-center justify-center font-mono font-black text-[10px] rounded border transition-all duration-75 select-none ${isTestingSync && testVisualBeat === beatNum ? (beatNum === 4 ? "bg-amber-400 text-white border-amber-500" : "bg-blue-500 text-white border-blue-600") : "bg-zinc-50 text-zinc-300 border-transparent"}`}>{beatNum}</div>
                    ))}
                  </div>
                  <button onClick={() => setIsTestingSync(!isTestingSync)} className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all w-24 ${isTestingSync ? "bg-red-50 text-red-600 border border-red-200" : "bg-white border border-zinc-200 text-zinc-700 shadow-sm hover:bg-zinc-50"}`}>
                    {isTestingSync ? "STOP" : "TEST SYNC"}
                  </button>
                </div>
              </div>
            )}
            
            {activeSong?.youtube_url && activeSong?.youtube_sync_offset_ms !== undefined && (
              <div className="mt-5 border-t border-zinc-200/60 pt-4 animate-in fade-in space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-zinc-800 flex items-center gap-1.5"><span className="text-red-600 text-sm">▶</span> YouTube Sync Engine</span>
                    <span className="text-[9px] font-bold text-zinc-400 mt-0.5">Lock stage metronome to the backing track</span>
                  </div>
                  <button type="button" onClick={() => setIsYoutubeSyncEnabled(!isYoutubeSyncEnabled)} className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors shadow-inner ${isYoutubeSyncEnabled ? 'bg-red-500' : 'bg-zinc-200'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isYoutubeSyncEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {isYoutubeSyncEnabled && (
                  <div className="flex items-center justify-between bg-red-50/50 border border-red-100 rounded-xl p-3 animate-in slide-in-from-top-1">
                    <span className="text-[11px] font-bold text-red-800">Track Mix Volume</span>
                    <input type="range" min="0" max="1" step="0.05" value={youtubeVolume} onChange={(e) => setYoutubeVolume(parseFloat(e.target.value))} className="w-24 accent-red-600" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-900 block">Actions</label>
            <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-zinc-50">
              {isAdmin && activeSong && (
                <button type="button" disabled={isPlayingFlow} onClick={() => { setIsSettingsModalOpen(false); router.push(`/songs/${activeSong.id}/edit`); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors disabled:opacity-40">
                  <div className="flex items-center gap-3"><span className="text-blue-500">📝</span><span className="text-sm font-bold text-zinc-700">Edit Song</span></div><span className="text-zinc-300 font-bold">›</span>
                </button>
              )}
              <button disabled={isPlayingFlow} onClick={() => { setIsSettingsModalOpen(false); handleOpenTransposerModal(); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors disabled:opacity-40">
                <div className="flex items-center gap-3"><span className="text-blue-500">🎹</span><span className="text-sm font-bold text-zinc-700">Transpose Key</span></div><span className="text-zinc-300 font-bold">›</span>
              </button>
              <button disabled={isPlayingFlow} onClick={() => { setIsSettingsModalOpen(false); setIsStructureModalOpen(true); }} className="w-full py-4 px-4 flex justify-between items-center hover:bg-zinc-50 transition-colors disabled:opacity-40">
                <div className="flex items-center gap-3"><span className="text-blue-500">🧱</span><span className="text-sm font-bold text-zinc-700">Edit Structure</span></div><span className="text-zinc-300 font-bold">›</span>
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}