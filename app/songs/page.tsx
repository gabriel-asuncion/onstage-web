"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useEngine } from "../context/EngineContext";
import { getAllSongs } from "../../utils/supabase/actions";
import GlobalLoader from '../../components/GlobalLoader';


// ✅ SURGICAL FIX: Standardized Discord-Style Tokens
const KEYWORD_SUGGESTIONS_CATALOG = [
  { token: "artist:", hint: "Filter by author or band name" },
  { token: "key:", hint: "Filter by core song key signature (e.g., G, C#m)" },
  { token: "bpm:", hint: "Filter by exact tempo (e.g., 74)" },
  { token: "bpm-range:", hint: "Filter by tempo range (e.g., 70-90)" },
  { token: "theme:", hint: "Filter by set categories or preset themes" },
  { token: "lyrics:", hint: "Scan song line rows for exact phrases" }
];

export default function SongsListPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const { simulatedRole, simulatedUserId } = useEngine();

  const [loading, setLoading] = useState(true);
  const [allDatabaseSongs, setAllDatabaseSongs] = useState<any[]>([]);
  const [songSearchQuery, setSongSearchQuery] = useState("");
  const [bookmarkedSongIds, setBookmarkedSongIds] = useState<string[]>([]);

  const loadSongsData = async () => {
    try {
      const songs = await getAllSongs();
      setAllDatabaseSongs(songs || []);
    } catch (e) {
      console.error("Failed to load songs assets:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    async function syncActiveUserBookmarksMatrix() {
      if (!simulatedUserId || simulatedUserId === "00000000-0000-0000-0000-000000000000") {
        setBookmarkedSongIds([]);
        return;
      }
      
      const { data, error } = await supabase
        .from("profiles")
        .select("bookmarked_songs")
        .eq("id", simulatedUserId)
        .maybeSingle();

      if (!error && data?.bookmarked_songs) {
        setBookmarkedSongIds(data.bookmarked_songs);
      } else {
        setBookmarkedSongIds([]);
      }
    }

    syncActiveUserBookmarksMatrix();
  }, [simulatedUserId]);

  useEffect(() => {
    loadSongsData();
  }, []);

  const handleToggleBookmark = async (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    if (!simulatedUserId || simulatedUserId === "00000000-0000-0000-0000-000000000000") return;
    
    const alreadyBookmarked = bookmarkedSongIds.includes(songId);
    const updatedBookmarks = alreadyBookmarked 
      ? bookmarkedSongIds.filter(id => id !== songId) 
      : [...bookmarkedSongIds, songId];

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ bookmarked_songs: updatedBookmarks })
        .eq("id", simulatedUserId);

      if (!error) {
        setBookmarkedSongIds(updatedBookmarks);
      } else {
        alert(`Bookmark Update Failed: ${error.message}`);
      }
    } catch (err) { 
      console.error(err); 
    }
  };

  const parseColonWrappedKeywords = (rawQuery: string) => {
    const tokens = { title: "", artist: "", key: "", lyrics: "", theme: "" };
    if (!rawQuery.trim()) return tokens;

    let processedString = rawQuery;

    const isolateToken = (prefix: string) => {
      const regex = new RegExp(`${prefix}\\s*([^:]+?)(?=\\s*(?::artist:|:key:|:lyrics:|:theme:|$))`, 'i');
      const match = processedString.match(regex);
      if (match) {
        processedString = processedString.replace(match[0], "").trim();
        return match[1].trim().toLowerCase();
      }
      return "";
    };

    tokens.artist = isolateToken(":artist:");
    tokens.key = isolateToken(":key:");
    tokens.lyrics = isolateToken(":lyrics:");
    tokens.theme = isolateToken(":theme:");
    
    tokens.title = processedString.trim().toLowerCase();
    return tokens;
  };

  const searchTokens = parseColonWrappedKeywords(songSearchQuery);

  const filteredSongs = allDatabaseSongs.filter(song => {
    if (searchTokens.title && !song.title?.toLowerCase().includes(searchTokens.title)) return false;
    if (searchTokens.artist && !song.artist?.toLowerCase().includes(searchTokens.artist)) return false;
    if (searchTokens.key && !song.original_key?.toLowerCase().includes(searchTokens.key)) return false;
    if (searchTokens.theme && !song.themes?.toLowerCase().includes(searchTokens.theme)) return false;
    if (searchTokens.lyrics && !song.chordpro_content?.toLowerCase().includes(searchTokens.lyrics)) return false;
    return true;
  });

  const typingWordsArray = songSearchQuery.split(/\s+/);
  const currentActiveWordFragment = typingWordsArray[typingWordsArray.length - 1] || "";
  const shouldShowHintsDropdown = currentActiveWordFragment.startsWith(":");
  const filteredKeywordSuggestions = KEYWORD_SUGGESTIONS_CATALOG.filter(item =>
    item.token.toLowerCase().includes(currentActiveWordFragment.toLowerCase())
  );

  const handleSelectKeywordSuggestion = (token: string) => {
    const tokensList = [...typingWordsArray];
    tokensList[tokensList.length - 1] = token + " "; 
    setSongSearchQuery(tokensList.join(" "));
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const handleClearSpecificTokenChip = (tokenPrefix: string, tokenValue: string) => {
    const targetMatchPattern = new RegExp(`${tokenPrefix}\\s*${tokenValue.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'i');
    setSongSearchQuery(prev => prev.replace(targetMatchPattern, "").trim());
  };

  if (loading) {
  return <GlobalLoader message="LOADING SONGS LIBRARY..." />;
}

  return (
  /* SURGICAL DE-CONTAINERIZATION: Bounding cards, rounded frame parameters, and absolute centrations removed */
  <div className="h-screen w-full overflow-hidden bg-[#f8f9fa] flex flex-col relative animate-in fade-in duration-200">
    <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

    {/* ========================================= */}
    {/* 1. STICKY HEADER & SEARCH BAR BLOCK       */}
    {/* ========================================= */}
    <header className="sticky top-0 z-[100] flex-shrink-0 w-full bg-[#ffffff] px-4 md:px-8 pt-4 md:pt-8 pb-4 space-y-4 border-b border-zinc-200 shadow-sm">
      {/* Title Row */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => router.push("/songs/new/edit")}
          className="w-11 h-11 rounded-2xl bg-[#2563eb] hover:bg-blue-700 text-white flex items-center justify-center font-black text-xl shadow-md transition-transform active:scale-95 shrink-0"
        >
          ＋
        </button>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#111827]" style={{ fontFamily: "Georgia, serif" }}>
          Songs Database
        </h2>
      </div>
      
      {/* FULL SEARCH BAR CONTAINER */}
      <div className="w-full max-w-xl flex flex-col relative overflow-visible">
        <div className="w-full flex flex-wrap items-center gap-2 bg-[#f3f4f6] rounded-full px-5 py-3 border border-zinc-200 shadow-inner focus-within:bg-white focus-within:border-blue-500 transition-all">
          
          {searchTokens.artist && (
            <div className="inline-flex items-center gap-1 bg-white border text-zinc-800 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-in zoom-in-95">
              <span className="opacity-40 font-mono text-[9px]">:artist:</span>
              <span className="max-w-[70px] truncate">{searchTokens.artist}</span>
              <button type="button" onClick={() => handleClearSpecificTokenChip(":artist:", searchTokens.artist)} className="text-[10px] ml-0.5 font-bold text-zinc-400 hover:text-red-500">✕</button>
            </div>
          )}

          {searchTokens.key && (
            <div className="inline-flex items-center gap-1 bg-white border text-zinc-800 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-in zoom-in-95">
              <span className="opacity-40 font-mono text-[9px]">:key:</span>
              <span className="uppercase">{searchTokens.key}</span>
              <button type="button" onClick={() => handleClearSpecificTokenChip(":key:", searchTokens.key)} className="text-[10px] ml-0.5 font-bold text-zinc-400 hover:text-red-500">✕</button>
            </div>
          )}

          {searchTokens.lyrics && (
            <div className="inline-flex items-center gap-1 bg-white border text-zinc-800 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-in zoom-in-95">
              <span className="opacity-40 font-mono text-[9px]">:lyrics:</span>
              <span className="max-w-[70px] truncate">"{searchTokens.lyrics}"</span>
              <button type="button" onClick={() => handleClearSpecificTokenChip(":lyrics:", searchTokens.lyrics)} className="text-[10px] ml-0.5 font-bold text-zinc-400 hover:text-red-500">✕</button>
            </div>
          )}

          {searchTokens.theme && (
            <div className="inline-flex items-center gap-1 bg-white border text-zinc-800 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-in zoom-in-95">
              <span className="opacity-40 font-mono text-[9px]">:theme:</span>
              <span className="capitalize max-w-[70px] truncate">{searchTokens.theme}</span>
              <button type="button" onClick={() => handleClearSpecificTokenChip(":theme:", searchTokens.theme)} className="text-[10px] ml-0.5 font-bold text-zinc-400 hover:text-red-500">✕</button>
            </div>
          )}

          <input 
            ref={searchInputRef}
            type="text" 
            placeholder="Search library parameters..." 
            value={songSearchQuery} 
            onChange={e => setSongSearchQuery(e.target.value)} 
            className="flex-1 text-xs font-semibold text-zinc-800 bg-transparent outline-none placeholder-zinc-400" 
          />
        </div>

        {shouldShowHintsDropdown && filteredKeywordSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-2xl shadow-2xl p-2 z-[99999] flex flex-col gap-0.5 max-h-48 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2 duration-150">
            {filteredKeywordSuggestions.map((item) => (
              <button
                key={item.token}
                type="button"
                onClick={() => handleSelectKeywordSuggestion(item.token)}
                className="w-full flex items-center justify-between text-left p-2 rounded-xl hover:bg-blue-50/60 transition-colors cursor-pointer group"
              >
                <span className="text-xs font-mono font-black text-blue-600 bg-blue-50/50 border border-blue-200/40 px-1.5 py-0.5 rounded-lg">{item.token}</span>
                <span className="text-[10px] font-bold text-zinc-400 text-right group-hover:text-zinc-600">{item.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>

    {/* ========================================= */}
    {/* 2. SCROLLING GRID CONTENT                 */}
    {/* ========================================= */}
    <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start w-full">
        {filteredSongs.map(song => {
          const isBookmarked = bookmarkedSongIds.includes(song.id);
          return (
            <div 
              key={song.id} 
              onClick={() => router.push(`/songs/${song.id}/edit`)} 
              className="p-5 rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50/50 transition-all cursor-pointer flex flex-col justify-between min-h-[145px] relative group shadow-sm overflow-hidden"
            >
              <div className="space-y-1 pr-10">
                <h4 className="font-bold text-[16px] text-zinc-900 tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
                  {song.title}
                </h4>
                <p className="text-[11px] font-bold text-indigo-600/90 flex items-center gap-1">
                  <span className="text-xs">👤</span> {song.artist || "Unknown Artist"}
                </p>
              </div>
              
              <button 
                type="button" 
                onClick={(e) => handleToggleBookmark(e, song.id)} 
                className="absolute top-5 right-5 w-5 h-5 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 z-20 cursor-pointer"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  fill={isBookmarked ? "#111827" : "none"} 
                  viewBox="0 0 24 24" 
                  strokeWidth={1.5} 
                  stroke="currentColor" 
                  className="w-5 h-5 text-zinc-800"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                </svg>
              </button>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
                <span className="px-2 py-0.5 rounded border border-zinc-200 bg-white text-[10px] font-mono font-bold text-zinc-500 shadow-inner">
                  {song.original_key || "G"}
                </span>
                <span className="text-[10px] font-mono font-black text-zinc-400 tracking-wider">
                  {song.tempo || "74"} BPM
                </span>
              </div>
            </div>
          );
        })}

        {filteredSongs.length === 0 && (
          <div className="col-span-full py-16 text-center text-xs font-semibold italic text-zinc-400 select-none border border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50 w-full">
            No arrangements found matching the current criteria tracking parameters.
          </div>
        )}
      </div>
    </main>

  </div>
);
}