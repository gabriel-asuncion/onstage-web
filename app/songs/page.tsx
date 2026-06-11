"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useEngine } from "../context/EngineContext";
import { getAllSongs, getSongChordChart } from "../../utils/supabase/actions";

interface SongSectionBlock {
  id: string;
  type: string;     
  label: string;    
  content: string;  
  repetitions: number;
}

interface SectionTimingMap {
  [sectionType: string]: {
    measures: number;
    beats: number;
  };
}

const AVAILABLE_STRUCTURE_TEMPLATES = [
  { id: "IN", type: "Intro 1", label: "Intro" },
  { id: "V1", type: "Verse 1", label: "Verse 1" },
  { id: "V2", type: "Verse 2", label: "Verse 2" },
  { id: "V3", type: "Verse 3", label: "Verse 3" },
  { id: "V4", type: "Verse 4", label: "Verse 4" },
  { id: "P",  type: "Pre-Chorus 1", label: "Pre-Chorus" },
  { id: "C1", type: "Chorus 1", label: "Chorus 1" },
  { id: "C2", type: "Chorus 2", label: "Chorus 2" },
  { id: "R",  type: "Refrain 1", label: "Refrain" },
  { id: "PC", type: "Post-Chorus 1", label: "Post-Chorus" },
  { id: "B",  type: "Bridge 1", label: "Bridge" },
  { id: "I",  type: "Instrumental 1", label: "Instrumental" },
  { id: "O",  type: "Outro 1", label: "Outro" },
  { id: "AD", type: "Ad Lib 1", label: "Ad Lib" }
];

const ENCLOSURE_POPUP_CATALOG = [
  { id: "IN", baseType: "Intro", display: "Intro" },
  { id: "V1", baseType: "Verse", display: "Verse 1" },
  { id: "P",  baseType: "Pre-Chorus", display: "Pre-Chorus" },
  { id: "C1", baseType: "Chorus", display: "Chorus 1" },
  { id: "R",  baseType: "Refrain", display: "Refrain" },
  { id: "PC", baseType: "Post-Chorus", display: "Post-Chorus" },
  { id: "B",  baseType: "Bridge", display: "Bridge" },
  { id: "I",  baseType: "Instrumental", display: "Instrumental" },
  { id: "O",  baseType: "Outro", display: "Outro" },
  { id: "AD", baseType: "Ad Lib", display: "Ad Lib" }
];

const CHRISTIAN_THEMES_PRESETS = [
  "Praise", "Worship", "Thanksgiving", "Grace", "Faith", "Love", "Hope", "Joy", 
  "Peace", "Salvation", "Redemption", "Resurrection", "The Cross", "Holy Spirit", 
  "God's Faithfulness", "Sovereignty", "Healing", "Deliverance", "Mercy", "Hymn", 
  "Gospel", "Contemporary Christian", "Prophetic", "Adoration", "Victory", "Brokenness"
];

const KEYWORD_SUGGESTIONS_CATALOG = [
  { token: ":artist:", hint: "Filter by author or band name" },
  { token: ":key:", hint: "Filter by core song key signature" },
  { token: ":lyrics:", hint: "Scan song line rows for exact phrases" },
  { token: ":theme:", hint: "Filter by set categories or presets themes" }
];

const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BASE_LETTER_ROOTS = ["C", "D", "E", "F", "G", "A", "B"];

const normalizeKeyNote = (note: string): string => {
  const flatMap: { [key: string]: string } = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
  return flatMap[note] || note;
};

const transposeBracketContent = (contentStr: string, semitones: number): string => {
  return contentStr.replace(/([A-G][#b]?\S*)/g, (match) => {
    if (match.includes("/")) {
      return match.split("/").map(part => {
        const m = part.match(/^([A-G][#b]?)(.*)$/);
        return m ? `${transposeSingleNote(m[1], semitones)}${m[2]}` : part;
      }).join("/");
    }
    const matchResult = match.match(/^([A-G][#b]?)(.*)$/);
    if (!matchResult) return match;
    return `${transposeSingleNote(matchResult[1], semitones)}${matchResult[2]}`;
  });
};

const transposeSingleNote = (note: string, semitones: number): string => {
  const normalized = normalizeKeyNote(note);
  const idx = CHROMATIC_SCALE.indexOf(normalized);
  if (idx === -1) return note;
  return CHROMATIC_SCALE[(idx + semitones + 12) % 12];
};

export default function SongsPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const { simulatedRole, simulatedUserId } = useEngine();

  const [loading, setLoading] = useState(true);
  const [allDatabaseSongs, setAllDatabaseSongs] = useState<any[]>([]);
  const [songSearchQuery, setSongSearchQuery] = useState("");
  const [bookmarkedSongIds, setBookmarkedSongIds] = useState<string[]>([]);
  
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSongId, setEditingSongId] = useState<string | null>(null); 
  const [editorActiveTab, setEditorActiveTab] = useState<"details" | "content" | "structure">("details");
  
  const [formTitle, setFormTitle] = useState("");
  const [formTempo, setFormTempo] = useState("");
  const [formKey, setFormKey] = useState("G");
  const [formArtist, setFormArtist] = useState("");
  const [formThemes, setFormThemes] = useState<string[]>([]);
  const [themeInputSearchValue, setThemeInputSearchValue] = useState("");
  const [isArtistDropdownFocused, setIsArtistDropdownFocused] = useState(false);
  const [isThemeDropdownFocused, setIsThemeDropdownFocused] = useState(false);
  const [formSections, setFormSections] = useState<SongSectionBlock[]>([]);
  const [sectionTimings, setSectionTimings] = useState<SectionTimingMap>({});
  
  // New Symmetrical Transposer States inside editor popups
  const [isKeyPopupOpen, setIsKeyPopupOpen] = useState(false);
  const [modalKeyRoot, setModalKeyRoot] = useState("G");
  const [modalKeyAccidental, setModalKeyAccidental] = useState<"" | "#" | "b">("");

  const [isSectionSelectorOpen, setIsSectionSelectorOpen] = useState(false);
  const [isRealtimePreviewActive, setIsRealtimePreviewActive] = useState(false);
  const [sectionSearchTerm, setSectionSearchTerm] = useState("");

  const [isAddChordsModeActive, setIsAddChordsModeActive] = useState(false);
  const [isAddNotesModeActive, setIsAddNotesModeActive] = useState(false); 
  const [chordTargetCoordinate, setChordTargetCoordinate] = useState<{ sectionType: string; lineIdx: number; wordIdx: number } | null>(null);
  const [notesTargetCoordinate, setNotesTargetCoordinate] = useState<{ sectionType: string; lineIdx: number } | null>(null); 

  const [selectedChordRoot, setSelectedChordRoot] = useState("G");
  const [customChordInputValue, setCustomChordInputValue] = useState("G");
  const [customCommentInputValue, setCustomCommentInputValue] = useState("");

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pastedRawLyricsText, setPastedRawLyricsText] = useState("");
  const [activeReassignSectionId, setActiveReassignSectionId] = useState<string | null>(null);
  const [draggedStructureIndex, setDraggedStructureIndex] = useState<number | null>(null);

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

  const handleOpenAddSongModal = () => {
    setEditingSongId(null); setFormTitle(""); setFormTempo(""); setFormKey("G"); setFormArtist(""); setFormThemes([]); setSectionTimings({}); setFormSections([{ id: "sec-1", type: "Verse 1", label: "Verse 1", content: "", repetitions: 1 }]);
    setIsAddChordsModeActive(false); setChordTargetCoordinate(null); setEditorActiveTab("details"); setIsEditorOpen(true);
  };

  const handleOpenEditSongModal = async (song: any) => {
    setEditingSongId(song.id); setFormTitle(song.title || ""); setFormTempo(song.tempo || ""); setFormKey(song.original_key || "G"); setFormArtist(song.artist || ""); setFormThemes(song.themes ? song.themes.split(",").map((t: string) => t.trim()).filter(Boolean) : []);
    setSectionTimings(song.section_timings || {});

    const sectionsRaw = await getSongChordChart(song.id);
    if (sectionsRaw && sectionsRaw.length > 0) {
      setFormSections(sectionsRaw.map((s: any, idx: number) => ({ 
        id: s.id || `sec-${idx}`, 
        type: s.section_name || "Verse 1", 
        label: s.section_name || "Verse 1", 
        content: s.content || "", 
        repetitions: 1
      })));
    } else { setFormSections([{ id: "sec-1", type: "Verse 1", label: "Verse 1", content: "", repetitions: 1 }]); }
    setIsAddChordsModeActive(false); setChordTargetCoordinate(null); setEditorActiveTab("details"); setIsEditorOpen(true);
  };

  const handleOpenKeySelectionPopup = () => {
    const cleanKeyBase = formKey.endsWith("m") ? formKey.slice(0, -1) : formKey;
    let baseLetter = cleanKeyBase.charAt(0);
    let accidentalSign: "" | "#" | "b" = "";
    
    if (cleanKeyBase.includes("#")) accidentalSign = "#";
    else if (cleanKeyBase.includes("b")) accidentalSign = "b";

    setModalKeyRoot(baseLetter);
    setModalKeyAccidental(accidentalSign);
    setIsKeyPopupOpen(true);
  };

  const handleSaveModalKeySelection = (e: React.FormEvent) => {
    e.preventDefault();
    const isMinorSong = formKey.endsWith("m");
    const nextKeyComputedName = `${modalKeyRoot}${modalKeyAccidental}${isMinorSong ? "m" : ""}`;
    
    handleSelectNewKeySignature(nextKeyComputedName);
  };

  const handleCommitSongChangesToDB = async () => {
    if (!formTitle.trim()) return;
    setLoading(true);
    const songPayload = {
      title: formTitle,
      tempo: formTempo ? parseInt(formTempo, 10) : 75, 
      original_key: formKey, 
      artist: formArtist.trim() || "Various Artists",
      themes: formThemes.join(", "),
      chordpro_content: formSections.map(s => `[${s.type}]\n${s.content}`).join("\n\n"),
      section_timings: sectionTimings 
    };

    try {
      let targetId = editingSongId;
      if (editingSongId) {
        await supabase.from("songs").update(songPayload).eq('id', editingSongId);
      } else {
        const { data } = await supabase.from("songs").insert(songPayload).select("id").single();
        targetId = data?.id || null;
      }

      if (targetId) {
        await supabase.from("song_sections").delete().eq("song_id", targetId);
        for (let i = 0; i < formSections.length; i++) {
          const sec = formSections[i];
          await supabase.from("song_sections").insert({
            song_id: targetId,
            section_name: sec.type,
            content: sec.content,
            sequence_order: i + 1
          });
        }
      }
      await loadSongsData();
      setIsEditorOpen(false);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const executeChordInjectionAtIndex = (injectedTokenStr: string) => {
    if (!chordTargetCoordinate) return;
    const { sectionType, lineIdx, wordIdx = 0 } = chordTargetCoordinate;
    const cleanInput = injectedTokenStr.trim();
    let bracketedTag = cleanInput !== "" ? ((cleanInput.startsWith("[") && cleanInput.endsWith("]")) ? cleanInput : `[${cleanInput}]`) : "";

    setFormSections(prev => prev.map(sec => {
      if (sec.type !== sectionType) return sec;
      const lines = sec.content.split("\n");
      let realWordCounter = 0;
      lines[lineIdx] = (lines[lineIdx] || "").replace(/(?:\[[^\]]+\]|\{[^\}]+\}|\S)+/g, (match) => {
        if (realWordCounter === wordIdx) { realWordCounter++; return `${bracketedTag}${match.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "")}`; }
        realWordCounter++; return match;
      });
      return { ...sec, content: lines.join("\n") };
    }));
    setChordTargetCoordinate(null); setCustomChordInputValue("");
  };

  const executeLineCommentInjection = (injectedCommentStr: string) => {
    if (!notesTargetCoordinate) return;
    const { sectionType, lineIdx } = notesTargetCoordinate;
    const cleanInput = injectedCommentStr.trim();
    let taggedComment = cleanInput !== "" ? ((cleanInput.startsWith("{") && cleanInput.endsWith("}")) ? cleanInput : `{${cleanInput}}`) : "";

    setFormSections(prev => prev.map(sec => {
      if (sec.type !== sectionType) return sec;
      const lines = sec.content.split("\n");
      lines[lineIdx] = (lines[lineIdx] || "").replace(/\{[^\}]+\}/g, "").trim() + (taggedComment ? ` ${taggedComment}` : "");
      return { ...sec, content: lines.join("\n") };
    }));
    setNotesTargetCoordinate(null); setCustomCommentInputValue("");
  };

  const activeScaleDiatonicDeck = DIATONIC_MODES_MAP[formKey] || DIATONIC_MODES_MAP["G"];

  useEffect(() => {
    const handleNashvilleNumberKeyInjections = (e: KeyboardEvent) => {
      if (!isAddChordsModeActive || !chordTargetCoordinate || document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (["1", "2", "3", "4", "5", "6", "7"].includes(e.key)) {
        e.preventDefault();
        const targetedScaleChord = activeScaleDiatonicDeck[parseInt(e.key, 10) - 1];
        if (targetedScaleChord) {
          const formattedFullChordStr = `${targetedScaleChord.root}${targetedScaleChord.suffix}`;
          const { sectionType, lineIdx, wordIdx = 0 } = chordTargetCoordinate;
          setFormSections(prev => prev.map(sec => {
            if (sec.type !== sectionType) return sec;
            const lines = sec.content.split("\n");
            let realWordCounter = 0;
            lines[lineIdx] = (lines[lineIdx] || "").replace(/(?:\[[^\]]+\]|\{[^\}]+\}|\S)+/g, (match) => {
              if (realWordCounter === wordIdx) { realWordCounter++; return `[${formattedFullChordStr}]${match.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "")}`; }
              realWordCounter++; return match;
            });
            return { ...sec, content: lines.join("\n") };
          }));
          setChordTargetCoordinate(null);
        }
      }
    };
    window.addEventListener("keydown", handleNashvilleNumberKeyInjections);
    return () => window.removeEventListener("keydown", handleNashvilleNumberKeyInjections);
  }, [isAddChordsModeActive, chordTargetCoordinate, activeScaleDiatonicDeck]);

  const handleSelectNewKeySignature = (newKey: string) => {
    if (newKey === formKey) return;
    const oldIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(formKey.endsWith("m") ? formKey.slice(0, -1) : formKey));
    const newIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(newKey.endsWith("m") ? newKey.slice(0, -1) : newKey));
    if (oldIdx !== -1 && newIdx !== -1) {
      const semitoneDelta = (newIdx - oldIdx + 12) % 12;
      if (semitoneDelta !== 0) {
        setFormSections(prev => prev.map(sec => ({ ...sec, content: sec.content.replace(/\[([^\]]+)\]/g, (m, inner) => `[${transposeBracketContent(inner, semitoneDelta)}]`) })));
      }
    }
    setFormKey(newKey); setIsKeyPopupOpen(false);
  };

  const renderSymmetricalLivePreviewLine = (sectionType: string, contentText: string) => {
    if (!contentText.trim()) return <p className="text-zinc-400 italic text-xs font-semibold py-1">Empty line segment...</p>;
    return contentText.split("\n").map((line, lineIdx) => {
      let lineCommentText = "";
      const wordsArray = line.replace(/\{([^\}]+)\}/g, (m, p1) => { lineCommentText = p1.trim(); return ""; }).match(/(?:\[[^\]]+\]|\S)+/g) || [];
      const isLineNotesTargeted = notesTargetCoordinate?.sectionType === sectionType && notesTargetCoordinate?.lineIdx === lineIdx;

      return (
        <div key={lineIdx} onClick={() => { if (isAddNotesModeActive) { setNotesTargetCoordinate({ sectionType, lineIdx }); setCustomCommentInputValue(lineCommentText); } }} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2 px-2.5 rounded-2xl transition-all duration-150 relative ${isAddNotesModeActive ? `cursor-pointer border-2 border-dashed border-transparent hover:border-purple-400 hover:bg-purple-50/20 shadow-sm ${isLineNotesTargeted ? '!border-purple-600 !bg-purple-50/30' : ''}` : 'border border-transparent'}`}>
          <div className="flex flex-wrap items-end gap-x-1.5 gap-y-3 py-1.5 leading-none flex-1">
            {wordsArray.map((chunk, currentWordIdx) => {
              const chordRegex = /\[([^\]]+)\]/g; const extractedChordsList: string[] = []; let matchResult;
              while ((matchResult = chordRegex.exec(chunk)) !== null) { extractedChordsList.push(matchResult[1]); }
              const cleanWordDisplay = chunk.replace(/\[[^\]]+\]/g, "");
              const isTargetedCoordinate = chordTargetCoordinate?.sectionType === sectionType && chordTargetCoordinate?.lineIdx === lineIdx && chordTargetCoordinate?.wordIdx === currentWordIdx;
              const hasNotation = extractedChordsList.length > 0;

              return (
                <div key={currentWordIdx} onClick={(e) => { if (isAddChordsModeActive) { e.stopPropagation(); setChordTargetCoordinate({ sectionType, lineIdx, wordIdx: currentWordIdx }); if (hasNotation) { setCustomChordInputValue(extractedChordsList[0]); } } }} className={`flex flex-col items-start relative select-none rounded-[14px] px-2.5 py-1 transition-all duration-150 ${isAddChordsModeActive ? `cursor-pointer border shadow-sm ${hasNotation ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-400/20 font-semibold' : 'border-zinc-200 bg-white hover:bg-zinc-50'}` : 'border border-transparent'} ${isTargetedCoordinate ? '!bg-blue-600 !text-white ring-4 ring-blue-500/30 font-bold scale-105 z-10 border-blue-600' : ''}`}>
                  {hasNotation && (
                    <div className="min-h-[1.25rem] text-[11px] font-mono font-black tracking-tight flex flex-wrap gap-1 mb-0.5 leading-none select-none">
                      {extractedChordsList.map((ch, cIndex) => (
                        <span key={cIndex} className="flex items-center gap-1">{ch.split(/\s+/).map((subCh, subIdx) => <span key={subIdx} className={`px-1 rounded border font-bold ${subCh === "~" || subCh === "-" || subCh === "->" ? "text-zinc-400 bg-transparent border-transparent font-sans normal-case" : "text-blue-600 bg-blue-50/80 border-blue-200/40"}`}>{subCh}</span>)}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-[14px] font-sans font-bold leading-tight">{cleanWordDisplay || " "}</div>
                </div>
              );
            })}
          </div>
          {lineCommentText && <div style={{ fontFamily: "'Nothing You Could Do', cursive" }} className="text-[16px] text-zinc-500 tracking-wide select-none whitespace-nowrap shrink-0 sm:text-right sm:pl-4 self-center pb-0.5">{lineCommentText}</div>}
        </div>
      );
    });
  };

  const handleStructureDragStart = (idx: number) => {
    setDraggedStructureIndex(idx);
  };

  const handleStructureDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedStructureIndex !== null && draggedStructureIndex !== targetIdx) {
      const reordered = [...formSections]; const [removed] = reordered.splice(draggedStructureIndex, 1); reordered.splice(targetIdx, 0, removed);
      setFormSections(reordered); setDraggedStructureIndex(null);
    }
  };

  const executeRawLyricsImportAction = () => {
    if (!pastedRawLyricsText.trim()) return;
    const cleanLines = pastedRawLyricsText.split(/\r?\n/).map(l => l.trim());
    let currentSectionType = "";
    let currentBuffer: string[] = [];
    const parsedBlocks: SongSectionBlock[] = [];
    let unassignedCounter = 1;

    const flushBuffer = () => {
      if (currentBuffer.length === 0) return;
      let finalType = currentSectionType;
      if (!finalType) {
        finalType = `Unassigned ${unassignedCounter}`;
        unassignedCounter++;
      }
      parsedBlocks.push({
        id: `sec-imp-${Date.now()}-${Math.random()}`,
        type: finalType,
        label: finalType,
        content: currentBuffer.join("\n"),
        repetitions: 1
      });
      currentBuffer = [];
      currentSectionType = "";
    };

    cleanLines.forEach(line => {
      const match = line.match(/^\[([^\]]+)\]$/);
      if (match) {
        flushBuffer();
        currentSectionType = match[1];
      } else if (line === "") {
        flushBuffer();
      } else {
        currentBuffer.push(line);
      }
    });

    flushBuffer();

    setFormSections(parsedBlocks.length > 0 ? parsedBlocks : formSections);
    setIsImportModalOpen(false); 
    setPastedRawLyricsText("");
    setEditorActiveTab("content");
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

  const getCentralizedMetricsTuple = (sectionType: string) => {
    return sectionTimings[sectionType] || { measures: 0, beats: 0 };
  };

  const handleUpdateCentralizedMetrics = (sectionType: string, field: "measures" | "beats", value: number) => {
    setSectionTimings(prev => {
      const currentTuple = prev[sectionType] || { measures: 0, beats: 0 };
      return {
        ...prev,
        [sectionType]: {
          ...currentTuple,
          [field]: value
        }
      };
    });
  };

  const filteredEnclosurePopupCatalog = ENCLOSURE_POPUP_CATALOG.filter(item => item.display.toLowerCase().includes(sectionSearchTerm.toLowerCase()));
  const uniqueContentSectionsList = formSections.reduce((acc: SongSectionBlock[], curr) => { if (!acc.some(item => item.type === curr.type)) acc.push(curr); return acc; }, []);
  const existingCachedDatabaseArtists = Array.from(new Set(allDatabaseSongs.map(s => s.artist).filter(Boolean))) as string[];
  const filteredArtistSuggestions = existingCachedDatabaseArtists.filter(art => art.toLowerCase().includes(formArtist.toLowerCase()) && art.toLowerCase() !== formArtist.toLowerCase().trim());
  const filteredThemeCatalogSuggestions = CHRISTIAN_THEMES_PRESETS.filter(th => th.toLowerCase().includes(themeInputSearchValue.toLowerCase()) && !formThemes.includes(th));
  const isChordInputBlank = customChordInputValue.trim() === ""; const isCommentInputBlank = customCommentInputValue.trim() === "";

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

  if (loading && allDatabaseSongs.length === 0) return <div className="p-8 text-center text-xs font-black uppercase text-zinc-400 tracking-widest animate-pulse">Loading Songs...</div>;

  return (
    <div className="p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6 animate-in fade-in duration-200">
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

      <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-zinc-100 pb-4 mb-6 gap-4">
          <div className="flex items-center gap-4">
            {simulatedRole === "admin" && (
              <button onClick={handleOpenAddSongModal} className="w-12 h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center font-black text-xl shadow-md transition-transform active:scale-95">＋</button>
            )}
            <div>
              <h3 className="text-xl font-bold text-zinc-950 tracking-tight">Songs Database</h3>
              <p className="text-[10px] text-zinc-400 font-bold tracking-normal mt-0.5">Type <span className="font-mono text-blue-600 bg-zinc-50 px-1.5 border rounded">:</span> to prompt Discord-style advanced keyword parameters search engines filters.</p>
            </div>
          </div>
          
          <div className="flex-1 max-w-xl flex flex-col gap-1.5 relative overflow-visible">
            <div className="w-full flex flex-wrap items-center gap-2 bg-zinc-50 rounded-2xl px-4 py-3 border border-zinc-200 shadow-inner focus-within:bg-white focus-within:border-blue-500 transition-all">
              
              {searchTokens.artist && (
                <div className="inline-flex items-center gap-1.5 bg-white border border-zinc-250 text-zinc-800 text-[11px] font-black px-2.5 py-1 rounded-xl shadow-sm animate-in zoom-in-95">
                  <span className="opacity-40 font-mono text-[10px] bg-zinc-50 px-1 rounded border">:artist:</span>
                  <span className="max-w-[80px] truncate">{searchTokens.artist}</span>
                  <button type="button" onClick={() => handleClearSpecificTokenChip(":artist:", searchTokens.artist)} className="text-[11px] ml-1 font-bold text-zinc-400 hover:text-red-500 transition-colors">✕</button>
                </div>
              )}

              {searchTokens.key && (
                <div className="inline-flex items-center gap-1.5 bg-white border border-zinc-250 text-zinc-800 text-[11px] font-black px-2.5 py-1 rounded-xl shadow-sm animate-in zoom-in-95">
                  <span className="opacity-40 font-mono text-[10px] bg-zinc-50 px-1 rounded border">:key:</span>
                  <span className="uppercase">{searchTokens.key}</span>
                  <button type="button" onClick={() => handleClearSpecificTokenChip(":key:", searchTokens.key)} className="text-[11px] ml-1 font-bold text-zinc-400 hover:text-red-500 transition-colors">✕</button>
                </div>
              )}

              {searchTokens.lyrics && (
                <div className="inline-flex items-center gap-1.5 bg-white border border-zinc-250 text-zinc-800 text-[11px] font-black px-2.5 py-1 rounded-xl shadow-sm animate-in zoom-in-95">
                  <span className="opacity-40 font-mono text-[10px] bg-zinc-50 px-1 rounded border">:lyrics:</span>
                  <span className="max-w-[80px] truncate">"{searchTokens.lyrics}"</span>
                  <button type="button" onClick={() => handleClearSpecificTokenChip(":lyrics:", searchTokens.lyrics)} className="text-[11px] ml-1 font-bold text-zinc-400 hover:text-red-500 transition-colors">✕</button>
                </div>
              )}

              {searchTokens.theme && (
                <div className="inline-flex items-center gap-1.5 bg-white border border-zinc-250 text-zinc-800 text-[11px] font-black px-2.5 py-1 rounded-xl shadow-sm animate-in zoom-in-95">
                  <span className="opacity-40 font-mono text-[10px] bg-zinc-50 px-1 rounded border">:theme:</span>
                  <span className="capitalize max-w-[80px] truncate">{searchTokens.theme}</span>
                  <button type="button" onClick={() => handleClearSpecificTokenChip(":theme:", searchTokens.theme)} className="text-[11px] ml-1 font-bold text-zinc-400 hover:text-red-500 transition-colors">✕</button>
                </div>
              )}

              <input 
                ref={searchInputRef}
                type="text" 
                placeholder={songSearchQuery.trim() === "" ? "Search library tracking parameters..." : ""} 
                value={songSearchQuery} 
                onChange={e => setSongSearchQuery(e.target.value)} 
                className="flex-1 min-w-[120px] text-xs font-semibold text-zinc-800 bg-transparent outline-none placeholder-zinc-400" 
              />
            </div>

            {shouldShowHintsDropdown && filteredKeywordSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200/90 rounded-2xl shadow-2xl p-2.5 z-[999999] flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 text-[9px] font-black uppercase text-zinc-400 tracking-wider border-b select-none">Search Context Operators Suggestions</div>
                {filteredKeywordSuggestions.map((item) => (
                  <button
                    key={item.token}
                    type="button"
                    onClick={() => handleSelectKeywordSuggestion(item.token)}
                    className="w-full flex items-center justify-between text-left p-2.5 px-3 rounded-xl hover:bg-blue-50/60 transition-colors cursor-pointer group"
                  >
                    <span className="text-xs font-mono font-black text-blue-600 bg-blue-50/50 border border-blue-200/40 px-1.5 py-0.5 rounded-lg group-hover:bg-blue-100 transition-colors">{item.token}</span>
                    <span className="text-[11px] font-bold text-zinc-400 text-right group-hover:text-zinc-600 transition-colors">{item.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
          {filteredSongs.map(song => {
            const isBookmarked = bookmarkedSongIds.includes(song.id);
            return (
              <div key={song.id} onClick={() => handleOpenEditSongModal(song)} className="p-5 rounded-2xl border border-zinc-200 bg-white hover:bg-blue-50/20 hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between min-h-[125px] group select-none shadow-sm relative overflow-hidden">
                <div className="space-y-1.5 pr-8">
                  <h4 className="font-extrabold text-[15px] tracking-tight group-hover:text-blue-600 line-clamp-2">{song.title}</h4>
                  <p className="text-[11px] font-bold text-zinc-400 truncate">👤 {song.artist || "Unknown Artist"}</p>
                </div>
                
                <button 
                  type="button" 
                  onClick={(e) => handleToggleBookmark(e, song.id)} 
                  className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 z-20 cursor-pointer"
                >
                  <img src={isBookmarked ? "/assets/bookmark-active.svg" : "/assets/bookmark.svg"} alt="" className="w-full h-full object-contain" />
                </button>

                <div className="flex items-center justify-between mt-4 pt-2 border-t border-zinc-100/60"><span className="px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-[10px] font-black uppercase text-zinc-500 shadow-inner">{song.original_key || "G"}</span><span className="text-[11px] font-bold text-zinc-400">{song.tempo || "74"} BPM</span></div>
              </div>
            );
          })}

          {filteredSongs.length === 0 && (
            <div className="col-span-full py-12 text-center text-xs font-semibold italic text-zinc-400 select-none border border-dashed rounded-2xl bg-zinc-50/50">No catalog songs records found matching current keyword context parameters tokens.</div>
          )}
        </div>
      </div>

      {isEditorOpen && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 md:p-6 animate-in fade-in">
          <div className="bg-[#f8f9fa] rounded-[2.5rem] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden border border-zinc-200 relative pb-20 animate-in zoom-in-95">
            <div className="bg-white border-b border-zinc-200 px-8 py-5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setIsEditorOpen(false)} className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold text-sm flex items-center justify-center">‹</button>
                <h3 className="font-black text-lg text-zinc-900 tracking-tight">{editingSongId ? "Modify Worship Arrangement" : "Create Studio Track Node"}</h3>
              </div>
              <div className="flex items-center gap-2.5 select-none">
                {editorActiveTab === "content" && (
                  <>
                    <button type="button" onClick={() => setIsImportModalOpen(true)} className="px-4 py-2 text-xs font-black text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl block shadow-sm">📥 Import Raw Lyrics</button>
                    <button type="button" onClick={() => { const nextState = !isRealtimePreviewActive; setIsRealtimePreviewActive(nextState); if (!nextState) { setIsAddChordsModeActive(false); setIsAddNotesModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); } }} className={`px-4 py-2 text-xs font-black rounded-xl border transition-all ${isRealtimePreviewActive ? 'bg-blue-600 border-blue-500 text-white shadow-md' : 'bg-white border-zinc-200'}`}> {isRealtimePreviewActive ? "👁️ Hide Live Preview" : "👁️ Show Live Preview"} </button>
                    <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddChordsModeActive(!isAddChordsModeActive); setIsAddNotesModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); }} className={`px-4 py-2 text-xs font-black rounded-xl border transition-all disabled:opacity-40 ${isAddChordsModeActive ? 'bg-amber-500 border-amber-400 text-white' : 'bg-white border-zinc-200'}`}> {isAddChordsModeActive ? "🎸 Locking..." : "🎸 Add Notation"} </button>
                    <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddNotesModeActive(!isAddNotesModeActive); setIsAddChordsModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); }} className={`px-4 py-2 text-xs font-black rounded-xl border transition-all disabled:opacity-40 ${isAddNotesModeActive ? 'bg-purple-600 border-purple-500 text-white shadow-md' : 'bg-white border-zinc-200'}`}> 📝 Add Notes </button>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white px-8 py-0 flex gap-6 border-b border-zinc-100 text-sm font-bold flex-shrink-0 select-none">
              {(["details", "content", "structure"] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setEditorActiveTab(tab)} className={`py-3.5 capitalize tracking-wide transition-all border-b-2 font-black ${editorActiveTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>{tab}</button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-8 pb-24 custom-scrollbar relative">
              {editorActiveTab === "details" && (
                <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in">
                  <div className="bg-white p-8 rounded-3xl border border-zinc-200 space-y-6">
                    <div><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1.5">Track Title Signature *</label><input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-3.5 text-sm font-bold text-zinc-800 bg-zinc-50/50 outline-none" /></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1.5">BPM Tempo Count</label><input type="number" value={formTempo} onChange={e => setFormTempo(e.target.value)} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-3.5 text-sm outline-none" /></div>
                      
                      {/* RED DIRECTIVE ROUTE: Connected directly to the target open transposer action click */}
                      <div>
                        <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1.5">Original Target Key Signature *</label>
                        <button 
                          type="button" 
                          onClick={handleOpenKeySelectionPopup} 
                          className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-3.5 text-sm font-bold text-zinc-800 bg-zinc-50/50 text-left flex justify-between items-center outline-none"
                        >
                          <span>{formKey ? `Key of ${formKey}` : "Select Key"}</span>
                          <span className="text-xs text-zinc-400">▼</span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="relative">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1.5">Artist / Author Label Signature *</label><input type="text" value={formArtist} onFocus={() => setIsArtistDropdownFocused(true)} onBlur={() => setTimeout(() => setIsArtistDropdownFocused(false), 200)} onChange={e => setFormArtist(e.target.value)} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-3.5 text-sm outline-none" />
                      {isArtistDropdownFocused && filteredArtistSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl max-h-40 overflow-y-auto z-[3000] shadow-xl">{filteredArtistSuggestions.map(art => <button key={art} type="button" onClick={() => setFormArtist(art)} className="w-full px-4 py-2.5 text-left text-xs font-bold border-b last:border-0 block">👤 {art}</button>)}</div>
                      )}
                    </div>
                    <div className="relative">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1.5">Themes / Set Categories</label>
                      <div className="w-full border rounded-xl p-2 bg-zinc-50/50 flex flex-wrap gap-2 items-center shadow-inner">
                        {formThemes.map(tag => <span key={tag} className="px-3 py-1 bg-zinc-950 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">{tag}<button type="button" onClick={() => setFormThemes(prev => prev.filter(t => t !== tag))} className="text-[10px] text-zinc-400">✕</button></span>)}
                        <input type="text" value={themeInputSearchValue} onFocus={() => setIsThemeDropdownFocused(true)} onBlur={() => setTimeout(() => setIsThemeDropdownFocused(false), 200)} onChange={e => setThemeInputSearchValue(e.target.value)} placeholder="Type themes..." className="flex-1 bg-transparent border-0 outline-none text-xs font-bold p-1.5 text-zinc-800" />
                      </div>
                      {isThemeDropdownFocused && filteredThemeCatalogSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl max-h-48 overflow-y-auto z-[3000] shadow-xl">{filteredThemeCatalogSuggestions.map(th => <button key={th} type="button" onClick={() => { setFormThemes([...formThemes, th]); setThemeInputSearchValue(""); }} className="w-full px-4 py-2.5 text-left text-xs font-extrabold border-b last:border-0 block">🏷️ {th}</button>)}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {editorActiveTab === "content" && (
                <div className="max-w-3xl mx-auto space-y-6 pb-12 animate-in fade-in">
                  <div className="space-y-6">
                    {formSections.map((sec) => {
                      const timingTuple = getCentralizedMetricsTuple(sec.type);

                      return (
                        <div key={sec.id} className="bg-white border rounded-2xl p-5 space-y-3 relative overflow-visible shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3 overflow-visible relative">
                            <div className="flex flex-wrap items-center gap-2 overflow-visible relative">
                              <div className="relative overflow-visible">
                                <button 
                                  type="button"
                                  onClick={() => setActiveReassignSectionId(activeReassignSectionId === sec.id ? null : sec.id)}
                                  className="px-4 py-1.5 bg-cyan-100 hover:bg-cyan-200 text-cyan-800 font-black text-[10px] rounded-full uppercase tracking-wider block transition-all shadow-sm flex items-center gap-1.5"
                                >
                                  <span>{sec.type}</span>
                                  <span className="text-[8px] opacity-60">▼</span>
                                </button>
                                {activeReassignSectionId === sec.id && (
                                  <div className="absolute top-full left-0 mt-1 bg-zinc-950 text-white rounded-2xl border max-h-48 w-44 overflow-y-auto z-[5000] p-1">
                                    {ENCLOSURE_POPUP_CATALOG.map(tmpl => (
                                      <button 
                                        key={tmpl.id} 
                                        type="button" 
                                        onClick={() => {
                                          const existingNumbers = formSections
                                            .filter(x => x.type.toLowerCase().startsWith(tmpl.baseType.toLowerCase()))
                                            .map(x => {
                                              const match = x.type.match(/\d+/);
                                              return match ? parseInt(match[0], 10) : 0;
                                            });
                                          const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
                                          const dynamicTypeString = `${tmpl.baseType} ${nextNum}`;

                                          setFormSections(formSections.map(item => item.id === sec.id ? { ...item, type: dynamicTypeString, label: tmpl.display } : item));
                                          setActiveReassignSectionId(null);
                                        }} 
                                        className="w-full text-left px-3 py-2 text-[11px] font-bold rounded-xl block border-b border-zinc-900 last:border-0"
                                      >
                                        🏷️ {tmpl.display}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1 bg-zinc-50 border rounded-xl px-2.5 py-1 text-[11px] font-bold text-zinc-700 shadow-inner">
                                <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider">Measures:</span>
                                <input 
                                  type="number" 
                                  min={0} 
                                  value={timingTuple.measures} 
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    handleUpdateCentralizedMetrics(sec.type, "measures", val);
                                  }}
                                  className="w-10 bg-transparent text-center font-black text-zinc-800 outline-none" 
                                />
                              </div>

                              <div className="flex items-center gap-1 bg-zinc-50 border rounded-xl px-2.5 py-1 text-[11px] font-bold text-zinc-700 shadow-inner">
                                <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider">Beats:</span>
                                <input 
                                  type="number" 
                                  min={0}
                                  max={3}
                                  value={timingTuple.beats} 
                                  onChange={(e) => {
                                    const val = Math.min(3, Math.max(0, parseInt(e.target.value, 10) || 0));
                                    handleUpdateCentralizedMetrics(sec.type, "beats", val);
                                  }}
                                  className="w-8 bg-transparent text-center font-black text-zinc-800 outline-none" 
                                />
                              </div>
                            </div>

                            {simulatedRole === "admin" && (
                              <button type="button" onClick={() => setFormSections(prev => prev.filter(x => x.id !== sec.id))} className="w-7 h-7 rounded-full bg-zinc-50 text-zinc-400 text-xs border flex items-center justify-center">✕</button>
                            )}
                          </div>

                          {isRealtimePreviewActive ? (
                            <div className="bg-zinc-50/50 p-4 rounded-xl border border-dashed border-zinc-200">
                              {renderSymmetricalLivePreviewLine(sec.type, sec.content)}
                            </div>
                          ) : (
                            <div>
                              <textarea rows={4} value={sec.content} onChange={(e) => setFormSections(formSections.map(x => x.type === sec.type ? { ...x, content: e.target.value } : x))} className="w-full border rounded-xl p-3 font-mono text-sm resize-none outline-none focus:border-zinc-400" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {simulatedRole === "admin" && (
                    <button type="button" onClick={() => setIsSectionSelectorOpen(true)} className="w-full border-2 border-dashed py-4 text-center rounded-2xl text-blue-600 font-black text-xs uppercase tracking-wider block hover:bg-zinc-50 transition-colors">＋ Add New Section Enclosures</button>
                  )}
                </div>
              )}

              {editorActiveTab === "structure" && (
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 pb-12 animate-in fade-in">
                  <div className="bg-white border p-6 rounded-3xl shadow-sm"><h4 className="font-black text-sm mb-4 border-b pb-2">📊 Current Play Order</h4><div className="space-y-2 min-h-[300px]">{formSections.map((sec, idx) => <div key={sec.id} draggable={simulatedRole === "admin"} onDragStart={() => handleStructureDragStart(idx)} onDragOver={e => e.preventDefault()} onDrop={e => handleStructureDrop(e, idx)} className="flex items-center justify-between p-4 bg-zinc-50 border rounded-2xl shadow-inner cursor-grab active:cursor-grabbing"><span className="text-sm font-bold">{sec.type}</span>{simulatedRole === "admin" && <button type="button" onClick={() => setFormSections(prev => prev.filter(x => x.id !== sec.id))} className="text-xs font-bold text-zinc-400 hover:text-red-500">Remove</button>}</div>)}</div></div>
                  <div className="bg-white border p-6 rounded-3xl shadow-sm"><h4 className="font-black text-sm mb-4 border-b pb-2">🧱 Template Catalog</h4><div className="grid grid-cols-1 gap-2 max-h-[440px] overflow-y-auto custom-scrollbar">{uniqueContentSectionsList.map(tmpl => <div key={tmpl.id} className="p-4 border rounded-2xl flex items-center justify-between bg-white"><span className="text-xs font-bold">{tmpl.type}</span><button type="button" onClick={() => setFormSections([...formSections, { id: `sec-dup-${Date.now()}-${Math.random()}`, type: tmpl.type, label: tmpl.label, content: tmpl.content, repetitions: 1 }])} className="w-8 h-8 rounded-xl bg-zinc-50 border flex items-center justify-center text-sm font-black hover:bg-blue-600 hover:text-white transition-colors">＋</button></div>)}</div></div>
                </div>
              )}
            </div>

            {/* UNIFIED PERSISTENT MULTI-TAB ACTION FOOTER CONSOLE */}
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-white border-t px-8 flex items-center justify-between z-50 shadow-md flex-shrink-0 select-none rounded-b-[2.5rem]">
              <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                {editorActiveTab === "content" && isAddChordsModeActive && (
                  <div className="flex items-center gap-2 bg-amber-50/40 border border-amber-200/60 p-1.5 px-3 rounded-xl animate-in slide-in-from-bottom-2 duration-150">
                    <span className="text-[10px] font-black uppercase text-amber-600 tracking-tight">🎸 Chords</span>
                    <select value={selectedChordRoot} onChange={e => { const r = e.target.value; setSelectedChordRoot(r); const m = activeScaleDiatonicDeck.find(o => o.root === r); setCustomChordInputValue(`${r}${m ? m.suffix : ""}`); }} className="bg-white border rounded-lg px-2 py-1 text-xs font-bold outline-none">{activeScaleDiatonicDeck.map((opt, i) => <option key={i} value={opt.root}>{opt.root}{opt.suffix}</option>)}</select>
                    <input type="text" value={customChordInputValue} onChange={e => setCustomChordInputValue(e.target.value)} className="border bg-white rounded-lg px-2 py-1 text-center w-20 text-xs font-black outline-none" />
                    <button type="button" onClick={() => executeChordInjectionAtIndex(customChordInputValue)} className={`px-4 py-1 rounded-lg font-black text-[11px] uppercase tracking-wide text-white ${isChordInputBlank ? 'bg-red-600' : 'bg-blue-600'}`}>{isChordInputBlank ? "Clear" : "Insert"}</button>
                  </div>
                )}

                {editorActiveTab === "content" && isAddNotesModeActive && (
                  <div className="flex items-center gap-2 bg-purple-50/40 border border-purple-200/60 p-1.5 px-3 rounded-xl flex-1 max-w-lg animate-in slide-in-from-bottom-2 duration-150">
                    <span className="text-[10px] font-black uppercase text-purple-600 tracking-tight shrink-0">📝 Notes</span>
                    <input type="text" value={customCommentInputValue} onChange={e => setCustomCommentInputValue(e.target.value)} placeholder="Type row details here..." className="border bg-white rounded-lg px-3 py-1 text-xs font-bold flex-1 outline-none" />
                    <button type="button" onClick={() => executeLineCommentInjection(customCommentInputValue)} className={`px-4 py-1 rounded-lg font-black text-[11px] uppercase tracking-wide text-white shrink-0 ${isCommentInputBlank ? 'bg-red-600' : 'bg-purple-600'}`}>{isCommentInputBlank ? "Clear" : "Save Note"}</button>
                  </div>
                )}

                {!(editorActiveTab === "content" && (isAddChordsModeActive || isAddNotesModeActive)) && editingSongId && simulatedRole === "admin" && (
                  <button 
                    type="button" 
                    onClick={async () => {
                      if (confirm("Are you completely sure you want to delete this song arrangement permanently out of database plan grids?")) {
                        setLoading(true);
                        const { error } = await supabase.from("songs").delete().eq("id", editingSongId);
                        if (!error) {
                          setIsEditorOpen(false);
                          await loadSongsData();
                        } else { setLoading(false); }
                      }
                    }} 
                    className="px-5 py-2.5 rounded-xl bg-red-50 text-red-600 font-bold text-xs uppercase border border-red-200 hover:bg-red-100 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    🗑️ Delete Song
                  </button>
                )}
              </div>

              <div className="shrink-0">
                {(simulatedRole === "admin" || simulatedRole === "member") && (
                  <button 
                    type="button" 
                    onClick={handleCommitSongChangesToDB} 
                    className="px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest shadow-md active:scale-95 transition-all cursor-pointer"
                  >
                    Save Arrangement
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {isSectionSelectorOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[11000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-6 w-full max-w-md shadow-2xl border space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="font-black text-zinc-900 text-sm">Add New Enclosure Section</h4>
              <button type="button" onClick={() => setIsSectionSelectorOpen(false)} className="text-zinc-400 text-xs font-bold">Close</button>
            </div>
            <input type="text" placeholder="Filter templates..." value={sectionSearchTerm} onChange={e => setSectionSearchTerm(e.target.value)} className="w-full bg-zinc-50 border rounded-xl px-3 py-2 text-xs font-bold outline-none" />
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
              {filteredEnclosurePopupCatalog.map(tmpl => (
                <button 
                  key={tmpl.id} type="button" 
                  onClick={() => {
                    const existingNumbers = formSections
                      .filter(x => x.type.toLowerCase().startsWith(tmpl.baseType.toLowerCase()))
                      .map(x => {
                        const match = x.type.match(/\d+/);
                        return match ? parseInt(match[0], 10) : 0;
                      });
                    const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
                    const blockTypeString = `${tmpl.baseType} ${nextNum}`;

                    setFormSections([...formSections, { id: `sec-add-${Date.now()}-${Math.random()}`, type: blockTypeString, label: tmpl.display, content: "" }]);
                    setIsSectionSelectorOpen(false); setSectionSearchTerm("");
                  }} 
                  className="px-4 py-3 hover:bg-zinc-50 text-left border rounded-xl text-xs font-bold text-zinc-700 transition-colors"
                >
                  🏷️ {tmpl.display}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-md z-[11000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-2xl border shadow-2xl space-y-6 animate-in zoom-in-95">
            <h4 className="text-xl font-black">Import Raw Lyrics Pipeline</h4>
            <textarea rows={10} value={pastedRawLyricsText} onChange={e => setPastedRawLyricsText(e.target.value)} placeholder="Paste plain track text format layout sections (e.g. [Verse 1] lines)..." className="w-full text-xs p-4 border bg-zinc-50/50 rounded-2xl outline-none font-mono" />
            <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setIsImportModalOpen(false)} className="py-3 bg-zinc-100 text-zinc-700 text-xs font-black rounded-xl">Cancel</button><button type="button" onClick={executeRawLyricsImportAction} className="py-3 bg-blue-600 text-white text-xs font-black rounded-xl shadow-sm">Parse & Import Sections</button></div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* --- RE-ARCHITECTED SPECIFICATION KEY PICKER OVERLAY MODAL FORM -------- */}
      {/* ======================================================================= */}
      {isKeyPopupOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-100 select-none">
          <form 
            onSubmit={handleSaveModalKeySelection}
            className="bg-[#f8f9fa] border border-zinc-200 rounded-[2.5rem] shadow-2xl max-w-xl w-full p-7 px-8 space-y-6 animate-in zoom-in-95 duration-150 relative text-left"
          >
            {/* Top Close Dismiss anchor */}
            <button
              type="button"
              onClick={() => setIsKeyPopupOpen(false)}
              className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white hover:bg-zinc-100 border text-zinc-400 text-xs font-bold flex items-center justify-center shadow-sm cursor-pointer transition-colors"
            >
              ✕
            </button>

            {/* Header Labels context */}
            <div className="space-y-1">
              <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Change Key</h3>
              <p className="text-xs font-black text-blue-500">Original {formKey}</p>
            </div>

            {/* Row 1: Base Letter Grid Array Selector (C, D, E, F, G, A, B) */}
            <div className="grid grid-cols-7 gap-2 bg-white p-2 rounded-2xl border shadow-inner">
              {BASE_LETTER_ROOTS.map((letter) => {
                const isSelected = modalKeyRoot === letter;
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setModalKeyRoot(letter)}
                    className={`aspect-square rounded-xl text-center text-sm font-black transition-all flex items-center justify-center cursor-pointer ${
                      isSelected 
                        ? "bg-blue-600 text-white shadow-md scale-105" 
                        : "bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>

            {/* Row 2: Accidental Flat / Sharp Sign Modifier Grid Strip */}
            <div className="grid grid-cols-2 divide-x bg-white rounded-2xl border overflow-hidden shadow-inner h-12">
              <button
                type="button"
                onClick={() => setModalKeyAccidental(modalKeyAccidental === "b" ? "" : "b")}
                className={`text-center text-base font-black transition-colors flex items-center justify-center h-full cursor-pointer ${
                  modalKeyAccidental === "b" ? "bg-blue-50/80 text-blue-600 font-extrabold" : "text-zinc-600 hover:bg-zinc-50/50"
                }`}
              >
                ♭
              </button>
              <button
                type="button"
                onClick={() => setModalKeyAccidental(modalKeyAccidental === "#" ? "" : "#")}
                className={`text-center text-sm font-black transition-colors flex items-center justify-center h-full cursor-pointer ${
                  modalKeyAccidental === "#" ? "bg-blue-50/80 text-blue-600 font-extrabold" : "text-zinc-600 hover:bg-zinc-50/50"
                }`}
              >
                #
              </button>
            </div>

            {/* Bottom Form Action Switch */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-md transition-all active:scale-[0.99] cursor-pointer text-center"
              >
                Save
              </button>
            </div>

          </form>
        </div>
      )}

    </div>
  );
}

const DIATONIC_MODES_MAP: { [key: string]: { root: string; suffix: string }[] } = {
  "C":  [{root:"C",suffix:""}, {root:"D",suffix:"m"}, {root:"E",suffix:"m"}, {root:"F",suffix:""}, {root:"G",suffix:""}, {root:"A",suffix:"m"}, {root:"B",suffix:"dim"}],
  "Db": [{root:"Db",suffix:""},{root:"Eb",suffix:"m"},{root:"F",suffix:"m"},{root:"Gb",suffix:""},{root:"Ab",suffix:""},{root:"Bb",suffix:"m"},{root:"C",suffix:"dim"}],
  "D":  [{root:"D",suffix:""}, {root:"E",suffix:"m"}, {root:"F#",suffix:"m"},{root:"G",suffix:""}, {root:"A",suffix:""}, {root:"B",suffix:"m"}, {root:"C#",suffix:"dim"}],
  "Eb": [{root:"Eb",suffix:""},{root:"F",suffix:"m"}, {root:"G",suffix:"m"}, {root:"Ab",suffix:""},{root:"Bb",suffix:""},{root:"C",suffix:"m"}, {root:"D",suffix:"dim"}],
  "E":  [{root:"E",suffix:""}, {root:"F#",suffix:"m"},{root:"G#",suffix:"m"},{root:"A",suffix:""}, {root:"B",suffix:""}, {root:"C#",suffix:"m"},{root:"D#",suffix:"dim"}],
  "F":  [{root:"F",suffix:""}, {root:"G",suffix:"m"}, {root:"A",suffix:"m"}, {root:"Bb",suffix:""},{root:"C",suffix:""}, {root:"D",suffix:"m"}, {root:"E",suffix:"dim"}],
  "F#": [{root:"F#",suffix:""},{root:"G#",suffix:"m"},{root:"A#",suffix:"m"},{root:"B",suffix:""}, {root:"C#",suffix:""},{root:"D#",suffix:"m"},{root:"F",suffix:"dim"}],
  "G":  [{root:"G",suffix:""}, {root:"A",suffix:"m"}, {root:"B",suffix:"m"}, {root:"C",suffix:""}, {root:"D",suffix:""}, {root:"E",suffix:"m"}, {root:"F#",suffix:"dim"}],
  "Ab": [{root:"Ab",suffix:""},{root:"Bb",suffix:"m"},{root:"C",suffix:"m"}, {root:"Db",suffix:""},{root:"Eb",suffix:""},{root:"F",suffix:"m"}, {root:"G",suffix:"dim"}],
  "A":  [{root:"A",suffix:""}, {root:"B",suffix:"m"}, {root:"C#",suffix:"m"},{root:"D",suffix:""}, {root:"E",suffix:""}, {root:"F#",suffix:"m"},{root:"G#",suffix:"dim"}],
  "Bb": [{root:"Bb",suffix:""},{root:"C",suffix:"m"}, {root:"D",suffix:"m"}, {root:"Eb",suffix:""},{root:"F",suffix:""}, {root:"G",suffix:"m"}, {root:"A",suffix:"dim"}],
  "B":  [{root:"B",suffix:""}, {root:"C#",suffix:"m"},{root:"D#",suffix:"m"},{root:"E",suffix:""}, {root:"F#",suffix:""},{root:"G#",suffix:"m"},{root:"A#",suffix:"dim"}],
  "Am":  [{root:"A",suffix:"m"}, {root:"B",suffix:"dim"},{root:"C",suffix:""}, {root:"D",suffix:"m"}, {root:"E",suffix:"m"}, {root:"F",suffix:""}, {root:"G",suffix:""}],
  "Bm":  [{root:"B",suffix:"m"}, {root:"C#",suffix:"dim"},{root:"D",suffix:""}, {root:"E",suffix:"m"}, {root:"F#",suffix:"m"},{root:"G",suffix:""}, {root:"A",suffix:""}]
};