"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { useEngine } from "../context/EngineContext";
import { getSongChordChart } from "../../utils/supabase/actions";

// =======================================================
// --- SURGICAL FIX: HOISTED DIATONIC MODES MAP DECK -----
// =======================================================
const DIATONIC_MODES_MAP: { [key: string]: { root: string; suffix: string }[] } = {
  "C":  [{root:"C",suffix:""}, {root:"D",suffix:"m"}, {root:"E",suffix:"m"}, {root:"F",suffix:""}, {root:"G",suffix:""}, {root:"A",suffix:"m"}, {root:"B",suffix:"dim"}],
  "Db": [{root:"Db",suffix:""},{root:"Eb",suffix:"m"},{root:"F",suffix:"m"},{root:"Gb",suffix:""},{root:"Ab",suffix:""},{root:"Bb",suffix:"m"},{root:"C",suffix:"dim"}],
  "D":  [{root:"D",suffix:""}, {root:"E",suffix:"m"}, {root:"F#",suffix:"m"},{root:"G",suffix:""}, {root:"A",suffix:""}, {root:"B",suffix:"m"}, {root:"C#",suffix:"dim"}],
  "Eb": [{root:"Eb",suffix:""},{root:"F",suffix:"m"}, {root:"G",suffix:"m"}, {root:"Ab",suffix:""},{root:"Bb",suffix:""},{root:"C",suffix:"m"}, {root:"D",suffix:"dim"}],
  "E":  [{root:"E",suffix:""}, {root:"F#",suffix:"m"},{root:"G#",suffix:"m"},{root:"A",suffix:""}, {root:"B",suffix:""}, {root:"C#",suffix:"m"},{root:"D#",suffix:"dim"}],
  "F":  [{root:"F",suffix:""}, {root:"G",suffix:"m"}, {root:"A",suffix:"m"}, {root:"Bb",suffix:""},{root:"C",suffix:""}, {root:"D",suffix:"m"}, {root:"E",suffix:"dim"}],
  "F#": [{root:"F#",suffix:""},{root:"G#",suffix:"m"},{root:"A#",suffix:"m"},{root:"B",suffix:""}, {root:"C#",suffix:""},{root:"D#",suffix:"m"}, {root:"F",suffix:"dim"}],
  "G":  [{root:"G",suffix:""}, {root:"A",suffix:"m"}, {root:"B",suffix:"m"}, {root:"C",suffix:""}, {root:"D",suffix:""}, {root:"E",suffix:"m"}, {root:"F#",suffix:"dim"}],
  "Ab": [{root:"Ab",suffix:""},{root:"Bb",suffix:"m"},{root:"C",suffix:"m"}, {root:"Db",suffix:""},{root:"Eb",suffix:""},{root:"F",suffix:"m"}, {root:"G",suffix:"dim"}],
  "A":  [{root:"A",suffix:"m"}, {root:"B",suffix:"m"}, {root:"C#",suffix:"m"},{root:"D",suffix:""}, {root:"E",suffix:""}, {root:"F#",suffix:"m"},{root:"G#",suffix:"dim"}],
  "Bb": [{root:"Bb",suffix:""},{root:"C",suffix:"m"}, {root:"D",suffix:"m"}, {root:"Eb",suffix:""},{root:"F",suffix:""}, {root:"G",suffix:"m"}, {root:"A",suffix:"dim"}],
  "B":  [{root:"B",suffix:""}, {root:"C#",suffix:"m"},{root:"D#",suffix:"m"},{root:"E",suffix:""}, {root:"F#",suffix:""},{root:"G#",suffix:"m"},{root:"A#",suffix:"dim"}],
  "Am":  [{root:"A",suffix:"m"}, {root:"B",suffix:"dim"},{root:"C",suffix:""}, {root:"D",suffix:"m"}, {root:"E",suffix:"m"}, {root:"F",suffix:""}, {root:"G",suffix:""}],
  "Bm":  [{root:"B",suffix:"m"}, {root:"C#",suffix:"dim"},{root:"D",suffix:""}, {root:"E",suffix:"m"}, {root:"F#",suffix:"m"},{root:"G",suffix:""}, {root:"A",suffix:""}]
};

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
  { id: "V1", baseType: "Verse", display: "Verse" },
  { id: "P",  baseType: "Pre-Chorus", display: "Pre-Chorus" },
  { id: "C1", baseType: "Chorus", display: "Chorus" },
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
  const editorContentContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Drop these near line 120-140 alongside your other editor hooks:
  const [sectionTotalMeasures, setSectionTotalMeasures] = useState<number>(8);
  const [sectionTotalBeats, setSectionTotalBeats] = useState<number>(0);
  const [sectionNamePreset, setSectionNamePreset] = useState<string>("Intro");
  const [lineOverrides, setLineOverrides] = useState<Record<string, Record<number, { measures: number; beats: number }>> | null>(null);

  const { simulatedRole, simulatedUserId } = useEngine();

  const [loading, setLoading] = useState(true);
  const [allDatabaseSongs, setAllDatabaseSongs] = useState<any[]>([]);
  const [songSearchQuery, setSongSearchQuery] = useState("");
  const [bookmarkedSongIds, setBookmarkedSongIds] = useState<string[]>([]);
  
  // Safe Close Modification Tracking State Flags
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfirmExitModalOpen, setIsConfirmExitModalOpen] = useState(false);
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
  
  // Interactive Drag & Placement Highlight Tracking States
  const [draggedStructureIndex, setDraggedStructureIndex] = useState<number | null>(null);
  const [dragOverStructureIndex, setDragOverStructureIndex] = useState<number | null>(null);

  // Helper routine to break down query parameter arrays
  const parseColonWrappedKeywords = (rawQuery: string) => {
    const tokens = { title: "", artist: "", key: "", lyrics: "", theme: "" };
    if (!rawQuery.trim()) return tokens;

    let processedString = rawQuery;
    const isolateToken = (prefix: string) => {
      const regex = new RegExp(`${prefix}\\s*([^:]+?)(?=\\s*(w:artist:|:key:|:lyrics:|:theme:|$))`, 'i');
      const match = processedString.match(regex);
      if (match) {
        processedString = processedString.replace(match[0], "").trim();
        return match[1].trim();
      }
      return "";
    };

    tokens.artist = isolateToken(":artist:");
    tokens.key = isolateToken(":key:");
    tokens.lyrics = isolateToken(":lyrics:");
    tokens.theme = isolateToken(":theme:");
    tokens.title = processedString.trim();
    return tokens;
  };

  // HIGH PERFORMANCE SERVER-SIDE SYNC ROUTINE WITH HARD 20-ROW VISUAL BARS LIMIT
  const loadSongsData = async () => {
    try {
      setLoading(true);
      const searchTokens = parseColonWrappedKeywords(songSearchQuery);

      let dbQueryBuilder = supabase
        .from("songs")
        .select("*")
        .order("created_at", { ascending: false }) // Old songs push back out of standard views bounds
        .limit(20);                               // Locks row count performance strictly to 20

      if (searchTokens.title) dbQueryBuilder = dbQueryBuilder.ilike("title", `%${searchTokens.title}%`);
      if (searchTokens.artist) dbQueryBuilder = dbQueryBuilder.ilike("artist", `%${searchTokens.artist}%`);
      if (searchTokens.key) dbQueryBuilder = dbQueryBuilder.ilike("original_key", `%${searchTokens.key}%`);
      if (searchTokens.theme) dbQueryBuilder = dbQueryBuilder.ilike("themes", `%${searchTokens.theme}%`);
      if (searchTokens.lyrics) dbQueryBuilder = dbQueryBuilder.ilike("chordpro_content", `%${searchTokens.lyrics}%`);

      const { data: matchedSongs, error } = await dbQueryBuilder;
      if (!error && matchedSongs) {
        setAllDatabaseSongs(matchedSongs);
      }

      const handleClearSpecificTokenChip = (tokenPrefix: string, tokenValue: string) => {
        const targetMatchPattern = new RegExp(`${tokenPrefix}\\s*${tokenValue.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'i');
        setSongSearchQuery(prev => prev.replace(targetMatchPattern, "").trim());
      };
    } catch (e) {
      console.error("Failed to load songs assets:", e);
    } finally {
      setLoading(false);
    }
  };
  function handleClearSpecificTokenChip(tokenPrefix: string, tokenValue: string) {
    const targetMatchPattern = new RegExp(`${tokenPrefix}\\s*${tokenValue.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'i');
    setSongSearchQuery(prev => prev.replace(targetMatchPattern, "").trim());
  }
  function handleStructureDragStart(idx: number) {
    setDraggedStructureIndex(idx);
  }
  function handleSelectKeywordSuggestion(token: string) {
    setSongSearchQuery(prev => {
      const words = prev.split(/\s+/);
      words[words.length - 1] = token + " ";
      return words.join(" ");
    });
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }
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

  // Safety Dismiss Prompt Layer
  const handleAttemptDismissal = () => {
    if (hasUnsavedChanges) {
      setIsConfirmExitModalOpen(true);
      return;
    }
    setHasUnsavedChanges(false);
    setIsEditorOpen(false);
  };

  // Click Outside Backdrop Catch Node
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (editorContentContainerRef.current && !editorContentContainerRef.current.contains(e.target as Node)) {
      handleAttemptDismissal();
    }
  };

  // =======================================================
  // --- RESTORED: AIR-TIGHT HOISTED WORKSPACE LOGIC CONTROLLER FUNCTIONS
  // =======================================================
  function renderSymmetricalLivePreviewLine(sectionType: string, contentText: string) {
    if (!contentText.trim()) return <p className="text-zinc-400 italic text-xs font-semibold py-1">Empty line segment...</p>;
    return contentText.split("\n").map((line, lineIdx) => {
      let lineCommentText = "";
      const wordsArray = line.replace(/\{([^\}]+)\}/g, (m, p1) => { lineCommentText = p1.trim(); return ""; }).match(/(?:\[[^\]]+\]|\S)+/g) || [];
      const isLineNotesTargeted = notesTargetCoordinate?.sectionType === sectionType && notesTargetCoordinate?.lineIdx === lineIdx;

      return (
        <div key={lineIdx} onClick={() => { if (isAddNotesModeActive) { setNotesTargetCoordinate({ sectionType, lineIdx }); setCustomCommentInputValue(lineCommentText); } }} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1 px-2 rounded-xl transition-all duration-150 relative ${isAddNotesModeActive ? `cursor-pointer border border-dashed border-transparent hover:border-purple-400 hover:bg-purple-50/20 shadow-sm ${isLineNotesTargeted ? '!border-purple-600 !bg-purple-50/30' : ''}` : 'border border-transparent'}`}>
          <div className="flex flex-wrap items-end gap-x-1.5 gap-y-2 py-0.5 leading-none flex-1">
            {wordsArray.map((chunk, currentWordIdx) => {
              const chordRegex = /\[([^\]]+)\]/g; const extractedChordsList: string[] = []; let matchResult;
              while ((matchResult = chordRegex.exec(chunk)) !== null) { extractedChordsList.push(matchResult[1]); }
              const cleanWordDisplay = chunk.replace(/\[[^\]]+\]/g, "");
              const isTargetedCoordinate = chordTargetCoordinate?.sectionType === sectionType && chordTargetCoordinate?.lineIdx === lineIdx && chordTargetCoordinate?.wordIdx === currentWordIdx;
              const hasNotation = extractedChordsList.length > 0;

              return (
                <div key={currentWordIdx} onClick={(e) => { if (isAddChordsModeActive) { e.stopPropagation(); setChordTargetCoordinate({ sectionType, lineIdx, wordIdx: currentWordIdx }); if (hasNotation) { setCustomChordInputValue(extractedChordsList[0]); } } }} className={`flex flex-col items-start relative select-none rounded-lg px-2 py-0.5 transition-all duration-150 ${isAddChordsModeActive ? `cursor-pointer border shadow-sm ${hasNotation ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-400/20 font-semibold' : 'border-zinc-200 bg-white hover:bg-zinc-50'}` : 'border border-transparent'} ${isTargetedCoordinate ? '!bg-blue-600 !text-white ring-2 ring-blue-500/30 font-bold scale-105 z-10 border-blue-600' : ''}`}>
                  {hasNotation && (
                    <div className="min-h-[1rem] text-[10px] font-mono font-black tracking-tight flex flex-wrap gap-0.5 mb-0.5 leading-none select-none">
                      {extractedChordsList.map((ch, cIndex) => (
                        <span key={cIndex} className="flex items-center gap-0.5">{ch.split(/\s+/).map((subCh, subIdx) => <span key={subIdx} className={`px-0.5 rounded border font-bold ${subCh === "~" || subCh === "-" || subCh === "->" ? "text-zinc-400 bg-transparent border-transparent font-sans normal-case" : "text-blue-600 bg-blue-50/80 border-blue-200/40"}`}>{subCh}</span>)}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-[13px] font-sans font-bold leading-tight">{cleanWordDisplay || " "}</div>
                </div>
              );
            })}
          </div>
          {lineCommentText && <div style={{ fontFamily: "'Nothing You Could Do', cursive" }} className="text-[14px] text-zinc-500 tracking-wide select-none whitespace-nowrap shrink-0 sm:text-right sm:pl-2 self-center pb-0.5">{lineCommentText}</div>}
        </div>
      );
    });
  }

  function handleSelectNewKeySignature(newKey: string) {
    if (newKey === formKey) return;
    const oldIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(formKey.endsWith("m") ? formKey.slice(0, -1) : formKey));
    const newIdx = CHROMATIC_SCALE.indexOf(normalizeKeyNote(newKey.endsWith("m") ? newKey.slice(0, -1) : newKey));
    if (oldIdx !== -1 && newIdx !== -1) {
      const semitoneDelta = (newIdx - oldIdx + 12) % 12;
      if (semitoneDelta !== 0) {
        setHasUnsavedChanges(true);
        setFormSections(prev => prev.map(sec => ({ 
          ...sec, 
          content: sec.content.replace(/\[([^\]]+)\]/g, (m, inner) => `[${transposeBracketContent(inner, semitoneDelta)}]`) 
        })));
      }
    }
    setFormKey(newKey); 
    setIsKeyPopupOpen(false);
  }
  function handleSaveModalKeySelection(e: React.FormEvent) {
    e.preventDefault();
    const isMinorSong = formKey.endsWith("m");
    const nextKeyComputedName = `${modalKeyRoot}${modalKeyAccidental}${isMinorSong ? "m" : ""}`;
    
    handleSelectNewKeySignature(nextKeyComputedName);
  }
  async function handleCommitSongChangesToDB() {
    if (!editingSongId) return;
    setLoading(true);

    try {
      // 1. Compile the nested line level overrides for the master JSON object
      const updatedSectionTimings: Record<string, any> = {};

      formSections.forEach((sec) => {
        const metricsTuple = getCentralizedMetricsTuple(sec.type);
        const specificRowOverrides = lineOverrides?.[sec.id] || null;

        updatedSectionTimings[sec.type] = {
          measures: metricsTuple.measures,
          beats: metricsTuple.beats,
          line_timings: specificRowOverrides 
        };
      });

      // 2. Update the parent song row metadata variables
      const { error: songUpdateError } = await supabase
        .from("songs")
        .update({ 
          title: formTitle,
          artist: formArtist,
          tempo: parseInt(formTempo, 10) || 75,
          original_key: formKey,
          themes: formThemes,
          section_timings: updatedSectionTimings 
        })
        .eq("id", editingSongId);

      if (songUpdateError) throw songUpdateError;

      // 3. >>> DATABASE HOOK: Wipe old structure sequence layout nodes for this track <<<
      const { error: deleteError } = await supabase
        .from("song_sections")
        .delete()
        .eq("song_id", editingSongId);

      if (deleteError) throw deleteError;

      // 4. >>> DATABASE HOOK: Re-write the updated chronology sequence matrix <<<
      const sectionsToInsert = formSections.map((sec, index) => ({
        song_id: editingSongId,
        section_name: sec.type,
        content: sec.content || "",
        sequence_order: index // Retains your exact drag/drop list sequence position
      }));

      if (sectionsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("song_sections")
          .insert(sectionsToInsert);

        if (insertError) throw insertError;
      }

      // 5. Clean up modal focus flags and refresh parent grid charts
      setHasUnsavedChanges(false);
      setIsEditorOpen(false);
      await loadSongsData(); 

    } catch (err) {
      console.error("Database structural update drop crash:", err);
      alert("Failed to commit arrangement modifications to database synchronization streams.");
    } finally {
      setLoading(false);
    }
  }

  // RESTORED: Symmetrical chord input matrix logic node
  function executeChordInjectionAtIndex(injectedTokenStr: string) {
    if (!chordTargetCoordinate) return;
    const { sectionType, lineIdx, wordIdx = 0 } = chordTargetCoordinate;
    const cleanInput = injectedTokenStr.trim();
    let bracketedTag = cleanInput !== "" ? ((cleanInput.startsWith("[") && cleanInput.endsWith("]")) ? cleanInput : `[${cleanInput}]`) : "";

    setHasUnsavedChanges(true);
    setFormSections(prev => prev.map(sec => {
      if (sec.type !== sectionType) return sec;
      const lines = sec.content.split("\n");
      let realWordCounter = 0;
      lines[lineIdx] = (lines[lineIdx] || "").replace(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g, (match) => {
        if (realWordCounter === wordIdx) { realWordCounter++; return `${bracketedTag}${match.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "")}`; }
        realWordCounter++; return match;
      });
      return { ...sec, content: lines.join("\n") };
    }));
    setChordTargetCoordinate(null); 
    setCustomChordInputValue("");
  }

  // RESTORED: Symmetrical row comment input builder mapping node
  function executeLineCommentInjection(injectedCommentStr: string) {
    if (!notesTargetCoordinate) return;
    const { sectionType, lineIdx } = notesTargetCoordinate;
    const cleanInput = injectedCommentStr.trim();
    let taggedComment = cleanInput !== "" ? ((cleanInput.startsWith("{") && cleanInput.endsWith("}")) ? cleanInput : `{${cleanInput}}`) : "";

    setHasUnsavedChanges(true);
    setFormSections(prev => prev.map(sec => {
      if (sec.type !== sectionType) return sec;
      const lines = sec.content.split("\n");
      lines[lineIdx] = (lines[lineIdx] || "").replace(/\{[^\}]+\}/g, "").trim() + (taggedComment ? ` ${taggedComment}` : "");
      return { ...sec, content: lines.join("\n") };
    }));
    setNotesTargetCoordinate(null); 
    setCustomCommentInputValue("");
  }

  function executeRawLyricsImportAction() {
    if (!pastedRawLyricsText.trim()) return;
    setHasUnsavedChanges(true);
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
  }

  // RESTORED: Unified Modal Launcher Controllers
  function handleOpenAddSongModal() {
    setEditingSongId(null); setFormTitle(""); setFormTempo(""); setFormKey("G"); setFormArtist(""); setFormThemes([]); setSectionTimings({}); setFormSections([{ id: "sec-1", type: "Verse 1", label: "Verse 1", content: "", repetitions: 1 }]);
    setIsAddChordsModeActive(false); setChordTargetCoordinate(null); setEditorActiveTab("details"); setHasUnsavedChanges(false); setIsEditorOpen(true);
  }

  async function handleOpenEditSongModal(song: any) {
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
    setIsAddChordsModeActive(false); setChordTargetCoordinate(null); setEditorActiveTab("details"); setHasUnsavedChanges(false); setIsEditorOpen(true);
  }

  function handleOpenKeySelectionPopup() {
    const cleanKeyBase = formKey.endsWith("m") ? formKey.slice(0, -1) : formKey;
    let baseLetter = cleanKeyBase.charAt(0);
    let accidentalSign: "" | "#" | "b" = "";
    
    if (cleanKeyBase.includes("#")) accidentalSign = "#";
    else if (cleanKeyBase.includes("b")) accidentalSign = "b";

    setModalKeyRoot(baseLetter);
    setModalKeyAccidental(accidentalSign);
    setIsKeyPopupOpen(true);
  }

  // =======================================================
  // --- HOISTED HOOK LAYERS: STRICT UNCONDITIONAL TOP EXECUTION
  // =======================================================

  // Hook 1: Sync server-side queries on input adjustments
  useEffect(() => {
    loadSongsData();
  }, [songSearchQuery]);

  // Hook 2: Keyboard Escape Key Hardware Sync
  useEffect(() => {
    const handleModalHardwareEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isEditorOpen) {
        handleAttemptDismissal();
      }
    };
    window.addEventListener("keydown", handleModalHardwareEscapeKey);
    return () => window.removeEventListener("keydown", handleModalHardwareEscapeKey);
  }, [isEditorOpen, hasUnsavedChanges]);

  // Hook 3: Sync Active User Bookmark Matrix
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

  const activeScaleDiatonicDeck = useMemo(() => DIATONIC_MODES_MAP[formKey] || DIATONIC_MODES_MAP["G"], [formKey]);

  // Hook 4: Nashville Number Keyboard Input & Backspace Notation Stripper Binding Matrix
  useEffect(() => {
    const handleNashvilleNumberKeyInjections = (e: KeyboardEvent) => {
      if (!isAddChordsModeActive || !chordTargetCoordinate || document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      
      if (["1", "2", "3", "4", "5", "6", "7"].includes(e.key)) {
        e.preventDefault();
        const targetedScaleChord = activeScaleDiatonicDeck[parseInt(e.key, 10) - 1];
        if (targetedScaleChord) {
          const formattedFullChordStr = `${targetedScaleChord.root}${targetedScaleChord.suffix}`;
          const { sectionType, lineIdx, wordIdx = 0 } = chordTargetCoordinate;
          setHasUnsavedChanges(true);
          setFormSections(prev => prev.map(sec => {
            if (sec.type !== sectionType) return sec;
            const lines = sec.content.split("\n");
            let realWordCounter = 0;
            lines[lineIdx] = (lines[lineIdx] || "").replace(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g, (match) => {
              if (realWordCounter === wordIdx) { realWordCounter++; return `[${formattedFullChordStr}]${match.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "")}`; }
              realWordCounter++; return match;
            });
            return { ...sec, content: lines.join("\n") };
          }));
          setChordTargetCoordinate(null);
        }
      } else if (e.key === "Backspace") {
        // SURGICAL ADDITION: Backspace Notation Clear Engine
        e.preventDefault();
        const { sectionType, lineIdx, wordIdx = 0 } = chordTargetCoordinate;
        setHasUnsavedChanges(true);
        setFormSections(prev => prev.map(sec => {
          if (sec.type !== sectionType) return sec;
          const lines = sec.content.split("\n");
          let realWordCounter = 0;
          lines[lineIdx] = (lines[lineIdx] || "").replace(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g, (match) => {
            if (realWordCounter === wordIdx) { 
              realWordCounter++; 
              return match.replace(/\[[^\]]+\]/g, ""); // Completely strips bracketed chords from current word block
            }
            realWordCounter++; 
            return match;
          });
          return { ...sec, content: lines.join("\n") };
        }));
        setChordTargetCoordinate(null);
      }
    };
    window.addEventListener("keydown", handleNashvilleNumberKeyInjections);
    return () => window.removeEventListener("keydown", handleNashvilleNumberKeyInjections);
  }, [isAddChordsModeActive, chordTargetCoordinate, activeScaleDiatonicDeck]);

  // >>> SURGICAL FIX: Match against your exact state variable 'allDatabaseSongs' <<<
  useEffect(() => {
    // 1. Look up the song item out of your active database state array
    const currentSong = allDatabaseSongs?.find((s: any) => s.id === editingSongId);

    if (isEditorOpen && currentSong?.section_timings && formSections.length > 0) {
      const hydratedOverrides: Record<string, any> = {};

      formSections.forEach((sec) => {
        const savedMetricsNode = currentSong.section_timings[sec.type];
        if (savedMetricsNode?.line_timings) {
          hydratedOverrides[sec.id] = savedMetricsNode.line_timings;
        }
      });

      setLineOverrides(hydratedOverrides);
    }
    // 2. Swapped 'songs' for 'allDatabaseSongs' to satisfy the compiler footprint
  }, [isEditorOpen, editingSongId, formSections, allDatabaseSongs]);

  const handleStructureDropOverride = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedStructureIndex !== null && draggedStructureIndex !== targetIdx) {
      setHasUnsavedChanges(true);
      const reordered = [...formSections]; 
      const [removed] = reordered.splice(draggedStructureIndex, 1); 
      reordered.splice(targetIdx, 0, removed);
      setFormSections(reordered); 
    }
    setDraggedStructureIndex(null);
    setDragOverStructureIndex(null);
  };
  // paste this right below handleStructureDropOverride:


  function handleUpdateCentralizedMetrics(sectionType: string, field: "measures" | "beats" | "repeats", value: number) {
    setHasUnsavedChanges(true);
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
  }

  const uniqueContentSectionsList = formSections.reduce((acc: SongSectionBlock[], curr) => { if (!acc.some(item => item.type === curr.type)) acc.push(curr); return acc; }, []);
  const existingCachedDatabaseArtists = Array.from(new Set(allDatabaseSongs.map(s => s.artist).filter(Boolean))) as string[];
  const filteredArtistSuggestions = existingCachedDatabaseArtists.filter(art => art.toLowerCase().includes(formArtist.toLowerCase()) && art.toLowerCase() !== formArtist.toLowerCase().trim());
  const filteredThemeCatalogSuggestions = CHRISTIAN_THEMES_PRESETS.filter(th => th.toLowerCase().includes(themeInputSearchValue.toLowerCase()) && !formThemes.includes(th));
  
  const typingWordsArray = songSearchQuery.split(/\s+/);
  const currentActiveWordFragment = typingWordsArray[typingWordsArray.length - 1] || "";
  const shouldShowHintsDropdown = currentActiveWordFragment.startsWith(":");
  const filteredKeywordSuggestions = KEYWORD_SUGGESTIONS_CATALOG.filter(item =>
    item.token.toLowerCase().includes(currentActiveWordFragment.toLowerCase())
  );

  const filteredEnclosurePopupCatalog = ENCLOSURE_POPUP_CATALOG.filter(item => item.display.toLowerCase().includes(sectionSearchTerm.toLowerCase()));
  const isChordInputBlank = customChordInputValue.trim() === ""; const isCommentInputBlank = customCommentInputValue.trim() === "";

  const searchTokensMetrics = parseColonWrappedKeywords(songSearchQuery);

  // >>> SURGICAL FIX: Define the missing metrics lookup engine <<<
  const getCentralizedMetricsTuple = (sectionType: string): { measures: number; beats: number; repeats: number } => {
    // 1. Locate the active song record being modified inside your dashboard dataset array
    const currentSong = allDatabaseSongs?.find((s: any) => s.id === editingSongId);
    
    // 2. Fetch the existing timing node for this specific section type (e.g., "Bridge 1")
    const savedMetrics = currentSong?.section_timings?.[sectionType];

    return {
      measures: savedMetrics?.measures ?? 4, // Defaults to 4 measures if blank
      beats: savedMetrics?.beats ?? 0,       // Defaults to 0 beats if blank
      repeats: savedMetrics?.repeats ?? 0     // 🌟 Defaults to 0 repeats if blank
    };
  };

  

  if (loading && allDatabaseSongs.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f8f9fa] p-4 text-center select-none animate-pulse">
        <div className="text-[10px] font-mono font-black uppercase text-blue-600 tracking-widest">
          Syncing Catalog Rows...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-4 md:space-y-6 animate-in fade-in duration-200">
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

      {/* --- RESPONSIVE MAIN CONTAINER --- */}
      <div className="bg-white border border-zinc-200 rounded-xl md:rounded-3xl p-4 md:p-6 shadow-sm">
        
        {/* COMPACT SEARCH FILTER & HEADER ACTIONS DECK */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-zinc-100 pb-3 mb-4 md:mb-6 gap-3">
          <div className="flex items-center gap-3">
            {simulatedRole === "admin" && (
              <button onClick={handleOpenAddSongModal} className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center font-black text-lg shadow-md transition-transform active:scale-95">＋</button>
            )}
            <div>
              <h3 className="text-lg md:text-xl font-bold text-zinc-950 tracking-tight">Songs Database</h3>
            </div>
          </div>
          
          <div className="flex-1 max-w-xl flex flex-col gap-1 relative overflow-visible">
            <div className="w-full flex flex-wrap items-center gap-1.5 bg-zinc-50 rounded-xl px-3 py-2.5 border border-zinc-200 shadow-inner focus-within:bg-white focus-within:border-blue-500 transition-all">
              
              {searchTokensMetrics.artist && (
                <div className="inline-flex items-center gap-1 bg-white border border-zinc-250 text-zinc-800 text-[10px] font-black px-2 py-0.5 rounded-lg shadow-sm animate-in zoom-in-95">
                  <span className="opacity-40 font-mono text-[9px] bg-zinc-50 px-1 rounded border">:artist:</span>
                  <span className="max-w-[70px] truncate">{searchTokensMetrics.artist}</span>
                  <button type="button" onClick={() => handleClearSpecificTokenChip(":artist:", searchTokensMetrics.artist)} className="text-[10px] ml-0.5 font-bold text-zinc-400 hover:text-red-500 transition-colors">✕</button>
                </div>
              )}

              {searchTokensMetrics.key && (
                <div className="inline-flex items-center gap-1 bg-white border border-zinc-250 text-zinc-800 text-[10px] font-black px-2 py-0.5 rounded-lg shadow-sm animate-in zoom-in-95">
                  <span className="opacity-40 font-mono text-[9px] bg-zinc-50 px-1 rounded border">:key:</span>
                  <span className="uppercase">{searchTokensMetrics.key}</span>
                  <button type="button" onClick={() => handleClearSpecificTokenChip(":key:", searchTokensMetrics.key)} className="text-[10px] ml-0.5 font-bold text-zinc-400 hover:text-red-500 transition-colors">✕</button>
                </div>
              )}

              {searchTokensMetrics.lyrics && (
                <div className="inline-flex items-center gap-1 bg-white border border-zinc-250 text-zinc-800 text-[10px] font-black px-2 py-0.5 rounded-lg shadow-sm animate-in zoom-in-95">
                  <span className="opacity-40 font-mono text-[9px] bg-zinc-50 px-1 rounded border">:lyrics:</span>
                  <span className="max-w-[70px] truncate">"{searchTokensMetrics.lyrics}"</span>
                  <button type="button" onClick={() => handleClearSpecificTokenChip(":lyrics:", searchTokensMetrics.lyrics)} className="text-[10px] ml-0.5 font-bold text-zinc-400 hover:text-red-500 transition-colors">✕</button>
                </div>
              )}

              {searchTokensMetrics.theme && (
                <div className="inline-flex items-center gap-1 bg-white border border-zinc-250 text-zinc-800 text-[10px] font-black px-2 py-0.5 rounded-lg shadow-sm animate-in zoom-in-95">
                  <span className="opacity-40 font-mono text-[9px] bg-zinc-50 px-1 rounded border">:theme:</span>
                  <span className="capitalize max-w-[70px] truncate">{searchTokensMetrics.theme}</span>
                  <button type="button" onClick={() => handleClearSpecificTokenChip(":theme:", searchTokensMetrics.theme)} className="text-[10px] ml-0.5 font-bold text-zinc-400 hover:text-red-500 transition-colors">✕</button>
                </div>
              )}

              <input 
                ref={searchInputRef}
                type="text" 
                placeholder={songSearchQuery.trim() === "" ? "Search library parameters..." : ""} 
                value={songSearchQuery} 
                onChange={e => setSongSearchQuery(e.target.value)} 
                className="flex-1 min-w-[100px] text-xs font-semibold text-zinc-800 bg-transparent outline-none placeholder-zinc-400" 
              />
            </div>

            {shouldShowHintsDropdown && filteredKeywordSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200/90 rounded-xl shadow-2xl p-2 z-[999999] flex flex-col gap-0.5 max-h-40 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-1 duration-100">
                {filteredKeywordSuggestions.map((item) => (
                  <button
                    key={item.token}
                    type="button"
                    onClick={() => handleSelectKeywordSuggestion(item.token)}
                    className="w-full flex items-center justify-between text-left p-2 rounded-lg hover:bg-blue-50/60 transition-colors cursor-pointer group text-[11px]"
                  >
                    <span className="font-mono font-black text-blue-600 bg-blue-50/50 border border-blue-200/40 px-1 rounded group-hover:bg-blue-100 transition-colors">{item.token}</span>
                    <span className="font-bold text-zinc-400 text-right group-hover:text-zinc-600 transition-colors">{item.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SONG GRID TILE CARDS LINEUP DOCK */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 content-start">
          {allDatabaseSongs.map(song => {
            const isBookmarked = bookmarkedSongIds.includes(song.id);
            return (
              <div 
                key={song.id} 
                onClick={() => handleOpenEditSongModal(song)} 
                className="p-4 rounded-xl border border-zinc-200 bg-white hover:bg-blue-50/20 hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between min-h-[110px] group select-none shadow-sm relative overflow-hidden"
              >
                <div className="space-y-1 pr-6">
                  <h4 className="font-extrabold text-[14px] tracking-tight group-hover:text-blue-600 line-clamp-2">{song.title}</h4>
                  <p className="text-[10px] font-bold text-zinc-400 truncate">👤 {song.artist || "Unknown Artist"}</p>
                </div>
                
                <button 
                  type="button" 
                  onClick={(e) => handleToggleBookmark(e, song.id)} 
                  className="absolute top-3.5 right-3.5 w-5 h-5 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 z-20 cursor-pointer"
                >
                  <img src={isBookmarked ? "/assets/bookmark-active.svg" : "/assets/bookmark.svg"} alt="" className="w-full h-full object-contain" />
                </button>

                <div className="flex items-center justify-between mt-3 pt-1.5 border-t border-zinc-100/60">
                  <span className="px-1.5 py-0.5 rounded bg-white border border-zinc-200 text-[9px] font-black uppercase text-zinc-500 shadow-inner">{song.original_key || "G"}</span>
                  <span className="text-[10px] font-bold text-zinc-400">{song.tempo || "74"} BPM</span>
                </div>
              </div>
            );
          })}

          {allDatabaseSongs.length === 0 && (
            <div className="col-span-full py-8 text-center text-[11px] font-semibold italic text-zinc-400 select-none border border-dashed rounded-xl bg-zinc-50/50">No catalog songs records found matching current query tokens.</div>
          )}
        </div>
      </div>

      {/* --- SECTIONS DRAWERS & WORKSPACE POPUPS --- */}
      {isEditorOpen && (
        <div 
          onClick={handleBackdropClick}
          className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-3 md:p-6 pb-16 md:pb-0 animate-in fade-in"
        >
          <div 
            ref={editorContentContainerRef}
            className="bg-[#f8f9fa] rounded-xl md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl h-[78vh] md:h-[85vh] flex flex-col overflow-hidden border border-zinc-200 relative pb-16 md:pb-20 animate-in zoom-in-95"
          >
            {/* STICKY DISMISS HEADER BAR DOCK */}
            <div className="bg-white border-b border-zinc-200 px-4 md:px-8 py-3.5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleAttemptDismissal} className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-600 font-bold text-xs flex items-center justify-center">‹</button>
                <h3 className="font-black text-sm md:text-base text-zinc-900 tracking-tight">{editingSongId ? "Modify Worship Arrangement" : "Create Studio Track Node"}</h3>
                {/* SURGICAL FIX: Properly bound to your local 'editingSongId' and 'setIsEditorOpen' state parameters */}
                {editingSongId && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditorOpen(false);
                      router.push(`/songs/${editingSongId}`);
                    }}
                    className="px-4 py-2 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ml-2"
                  >
                    View Lyrics
                  </button>
                )}
              </div>
              
              <div className="hidden md:flex items-center gap-2 select-none">
              {editorActiveTab === "content" && (
                <>
                  <button type="button" onClick={() => setIsImportModalOpen(true)} className="px-3 py-1.5 text-[11px] font-black text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg block shadow-sm">📥 Import Raw Lyrics</button>
                  <button type="button" onClick={() => { const nextState = !isRealtimePreviewActive; setIsRealtimePreviewActive(nextState); if (!nextState) { setIsAddChordsModeActive(false); setIsAddNotesModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); } }} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all ${isRealtimePreviewActive ? 'bg-blue-600 border-blue-500 text-white shadow-md' : 'bg-white border-zinc-200'}`}> {isRealtimePreviewActive ? "👁️ Hide Preview" : "👁️ Show Preview"} </button>
                  <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddChordsModeActive(!isAddChordsModeActive); setIsAddNotesModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); }} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all disabled:opacity-40 ${isAddChordsModeActive ? 'bg-amber-500 border-amber-400 text-white' : 'bg-white border-zinc-200'}`}> {isAddChordsModeActive ? "🎸 Lock Mode" : "🎸 Add Notation"} </button>
                  <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddNotesModeActive(!isAddNotesModeActive); setIsAddChordsModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); }} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all disabled:opacity-40 ${isAddNotesModeActive ? 'bg-purple-600 border-purple-500 text-white shadow-md' : 'bg-white border-zinc-200'}`}> 📝 Add Notes </button>
                </>
              )}
            </div>
            </div>

            {/* TWIN-BAR LEVEL 2 ACTION SUB TAB CONTAINERS */}
            <div className="bg-white flex flex-col flex-shrink-0 border-b border-zinc-100 select-none w-full">
              <div className="px-4 md:px-8 flex gap-4 text-xs font-bold border-b border-zinc-100">
                {(["details", "content", "structure"] as const).map(tab => (
                  <button key={tab} type="button" onClick={() => setEditorActiveTab(tab)} className={`py-2.5 capitalize tracking-wide transition-all border-b-2 font-black ${editorActiveTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>{tab}</button>
                ))}
              </div>

              {/* REFACTORED MOBILE CONTENT ACTION SLIDER SUB BAR */}
              {editorActiveTab === "content" && (
                <div className="w-full bg-zinc-50/60 p-2 flex items-center gap-1.5 overflow-x-auto overflow-y-hidden flex-nowrap scrollbar-none border-b border-zinc-100 md:hidden animate-in slide-in-from-top-1">
                  <button type="button" onClick={() => setIsImportModalOpen(true)} className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-md text-[9px] font-black uppercase tracking-wider text-zinc-700 shrink-0 shadow-sm">📥 Import</button>
                  <button type="button" onClick={() => { const nextState = !isRealtimePreviewActive; setIsRealtimePreviewActive(nextState); if (!nextState) { setIsAddChordsModeActive(false); setIsAddNotesModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); } }} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border shadow-sm transition-colors ${isRealtimePreviewActive ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white border-zinc-200 text-zinc-700'}`}>👁️ {isRealtimePreviewActive ? "Hide Live" : "Preview"}</button>
                  <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddChordsModeActive(!isAddChordsModeActive); setIsAddNotesModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); }} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border transition-all disabled:opacity-40 ${isAddChordsModeActive ? 'bg-amber-500 border-amber-400 text-white shadow-sm' : 'bg-white border-zinc-200 text-zinc-700'}`}>🎸 Chords</button>
                  <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddNotesModeActive(!isAddNotesModeActive); setIsAddChordsModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); }} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border transition-all disabled:opacity-40 ${isAddNotesModeActive ? 'bg-purple-600 border-purple-500 text-white shadow-sm' : 'bg-white border-zinc-200 text-zinc-700'}`}>📝 Note Rows</button>
                </div>
              )}
            </div>

            {/* INTERNAL PRIMARY CONTENT SHEETS CANVAS */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-20 custom-scrollbar relative space-y-3">
              {editorActiveTab === "details" && (
                <div className="max-w-2xl mx-auto animate-in fade-in">
                  <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-3xl border border-zinc-200 space-y-4">
                    <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Track Title Signature *</label><input type="text" value={formTitle} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 outline-none" onChange={e => { setHasUnsavedChanges(true); setFormTitle(e.target.value); }} /></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">BPM Tempo Count</label><input type="number" value={formTempo} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs outline-none" onChange={e => { setHasUnsavedChanges(true); setFormTempo(e.target.value); }} /></div>
                      <div>
                        <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Original Target Key Signature *</label>
                        <button type="button" onClick={handleOpenKeySelectionPopup} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 text-left flex justify-between items-center outline-none">
                          <span>{formKey ? `Key of ${formKey}` : "Select Key"}</span>
                          <span className="text-[10px] text-zinc-400">▼</span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="relative">
                      <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Artist / Author Label Signature *</label><input type="text" value={formArtist} onFocus={() => setIsArtistDropdownFocused(true)} onBlur={() => setTimeout(() => setIsArtistDropdownFocused(false), 200)} onChange={e => { setHasUnsavedChanges(true); setFormArtist(e.target.value); }} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs outline-none" />
                      {isArtistDropdownFocused && filteredArtistSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border rounded-xl max-h-32 overflow-y-auto z-[3000] shadow-xl">{filteredArtistSuggestions.map(art => <button key={art} type="button" className="w-full text-left px-3 py-2 text-xs font-bold block border-b" onClick={() => { setHasUnsavedChanges(true); setFormArtist(art); }}>👤 {art}</button>)}</div>
                      )}
                    </div>
                    <div className="relative">
                      <label className="text-[9px] font-black text-zinc-400 uppercase tracking-wider block mb-1">Themes / Set Categories</label>
                      <div className="w-full border rounded-xl p-1.5 bg-zinc-50/50 flex flex-wrap gap-1.5 items-center shadow-inner">
                        {formThemes.map(tag => <span key={tag} className="px-2.5 py-0.5 bg-zinc-950 text-white rounded-lg text-[10px] font-bold flex items-center gap-1">{tag}<button type="button" className="text-[9px] text-zinc-400" onClick={() => { setHasUnsavedChanges(true); setFormThemes(prev => prev.filter(t => t !== tag)); }}>✕</button></span>)}
                        <input type="text" value={themeInputSearchValue} onFocus={() => setIsThemeDropdownFocused(true)} onBlur={() => setTimeout(() => setIsThemeDropdownFocused(false), 200)} placeholder="Add themes..." className="flex-1 bg-transparent border-0 outline-none text-xs font-bold p-1 text-zinc-800" onChange={e => setThemeInputSearchValue(e.target.value)} />
                      </div>
                      {isThemeDropdownFocused && filteredThemeCatalogSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border rounded-xl max-h-36 overflow-y-auto z-[3000] shadow-xl">{filteredThemeCatalogSuggestions.map(th => <button key={th} type="button" className="w-full px-3 py-2 text-left text-xs font-bold block border-b" onClick={() => { setHasUnsavedChanges(true); setFormThemes([...formThemes, th]); setThemeInputSearchValue(""); }}>{th}</button>)}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {editorActiveTab === "content" && (
                <div className="max-w-3xl mx-auto space-y-3 pb-6 animate-in fade-in">
                  <div className="space-y-3">
                    {formSections.map((sec) => {
                      const timingTuple = getCentralizedMetricsTuple(sec.type);

                      // 1. Break content block down into clean text rows
                      const linesArray = sec.content
                        .split("\n")
                        .map(line => line.replace(/\[[^\]]+\]/g, "").trim())
                        .filter(line => line.length > 0);

                      const totalLines = linesArray.length;
                      
                      // MATH UPDATE: 1 original pass + R repeats = Total passes running through the engine
                      const sectionRepeats = timingTuple.repeats || 0;
                      const totalPasses = sectionRepeats + 1; 
                      const totalLineSegmentsCount = totalLines * totalPasses;

                      const masterTotalAbsoluteBeats = (timingTuple.measures * 4) + timingTuple.beats;

                      // 2. Compute even distributions across line segments
                      const autoSpreadMeasures = totalLineSegmentsCount > 0 ? Math.floor(timingTuple.measures / totalLineSegmentsCount) : 0;
                      const remainderMeasures = totalLineSegmentsCount > 0 ? timingTuple.measures % totalLineSegmentsCount : 0;

                      const autoSpreadBeats = totalLineSegmentsCount > 0 ? Math.floor(timingTuple.beats / totalLineSegmentsCount) : 0;
                      const remainderBeats = totalLineSegmentsCount > 0 ? timingTuple.beats % totalLineSegmentsCount : 0;

                      // 3. Retrieve or map active metrics overrides
                      const currentLinesMetrics = linesArray.map((_, lIdx) => {
                        const explicitOverride = (lineOverrides as any)?.[sec.id]?.[lIdx];
                        if (explicitOverride) return explicitOverride;
                        return {
                          measures: autoSpreadMeasures + (lIdx < remainderMeasures ? 1 : 0),
                          beats: autoSpreadBeats + (lIdx < remainderBeats ? 1 : 0)
                        };
                      });

                      // 4. Multiply line layers out by the loop passes to verify total absolute section beats matches
                      const totalManualLineMeasures = currentLinesMetrics.reduce((sum, l) => sum + l.measures, 0) * totalPasses;
                      const totalManualLineBeats = currentLinesMetrics.reduce((sum, l) => sum + l.beats, 0) * totalPasses;
                      const totalManualAbsoluteBeats = (totalManualLineMeasures * 4) + totalManualLineBeats;

                      const isSectionMismatched = totalLines > 0 && totalManualAbsoluteBeats !== masterTotalAbsoluteBeats;

                      const handleAdjustLineMetricValue = (lineIdx: number, field: "measures" | "beats", delta: number) => {
                        const currentVal = currentLinesMetrics[lineIdx][field];
                        const proposedVal = Math.max(0, currentVal + delta);

                        if (field === "beats" && proposedVal > 3) return;

                        // Account for total passes factor inside delta steps
                        const deltaBeats = (field === "measures" ? (delta * 4) : delta) * totalPasses;
                        const projectedAbsoluteBeats = totalManualAbsoluteBeats + deltaBeats;

                        if (projectedAbsoluteBeats > masterTotalAbsoluteBeats) return;

                        setHasUnsavedChanges(true);
                        setLineOverrides(prev => {
                          const sectionMap = prev?.[sec.id] || {};
                          
                          linesArray.forEach((_, currentIdx) => {
                            if (sectionMap[currentIdx] === undefined) {
                              sectionMap[currentIdx] = {
                                measures: autoSpreadMeasures + (currentIdx < remainderMeasures ? 1 : 0),
                                beats: autoSpreadBeats + (currentIdx < remainderBeats ? 1 : 0)
                              };
                            }
                          });

                          sectionMap[lineIdx] = {
                            ...sectionMap[lineIdx],
                            [field]: proposedVal
                          };

                          return { ...(prev || {}), [sec.id]: sectionMap };
                        });
                      };

                      return (
                        <div 
                          key={sec.id} 
                          className={`border rounded-xl p-3.5 space-y-2 relative transition-all shadow-sm ${
                            isRealtimePreviewActive && isSectionMismatched 
                              ? "bg-amber-50/40 border-amber-300 ring-4 ring-amber-500/5" 
                              : "bg-white border-zinc-200"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <div className="relative">
                                <button type="button" className="px-2.5 py-1 bg-cyan-100 hover:bg-cyan-200 text-cyan-800 font-black text-[9px] rounded-full uppercase tracking-wider block shadow-sm flex items-center gap-1" onClick={() => setActiveReassignSectionId(activeReassignSectionId === sec.id ? null : sec.id)}>
                                  <span>{sec.type}</span>
                                  <span className="text-[8px] opacity-60">▼</span>
                                </button>
                                {activeReassignSectionId === sec.id && (
                                  <div className="absolute top-full left-0 mt-1 bg-zinc-950 text-white rounded-xl border max-h-40 w-36 overflow-y-auto z-[5000] p-1">
                                    {ENCLOSURE_POPUP_CATALOG.map(tmpl => (
                                      <button key={tmpl.id} type="button" className="w-full text-left px-3 py-2 text-[11px] font-bold rounded-xl block border-b border-zinc-900 last:border-0" onClick={() => {
                                        const existingNumbers = formSections.filter(x => x.type.toLowerCase().startsWith(tmpl.baseType.toLowerCase())).map(x => { const match = x.type.match(/\d+/); return match ? parseInt(match[0], 10) : 0; });
                                        const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
                                        const dynamicTypeString = `${tmpl.baseType} ${nextNum}`;
                                        setHasUnsavedChanges(true);
                                        setFormSections(formSections.map(item => item.id === sec.id ? { ...item, type: dynamicTypeString, label: tmpl.display } : item));
                                        setActiveReassignSectionId(null);
                                      }}>{tmpl.display}</button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                                <span className="text-[8px] font-black uppercase text-zinc-400">M:</span>
                                <input type="number" min={0} value={timingTuple.measures} className="w-6 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "measures", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (prev) { delete prev[sec.id]; } return { ...(prev || {}) }; }); }} />
                              </div>

                              <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                                <span className="text-[8px] font-black uppercase text-zinc-400">B:</span>
                                <input type="number" min={0} max={3} value={timingTuple.beats} className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "beats", Math.min(3, Math.max(0, parseInt(e.target.value, 10) || 0))); setLineOverrides(prev => { if (prev) { delete prev[sec.id]; } return { ...(prev || {}) }; }); }} />
                              </div>

                              {/* 'R:' or 'Repeats' Counter Input Field */}
                              <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                                <span className="text-[8px] font-black uppercase text-zinc-400">R:</span>
                                <input type="number" min={0} value={sectionRepeats} className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "repeats", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (prev) { delete prev[sec.id]; } return { ...(prev || {}) }; }); }} />
                              </div>
                            </div>

                            {simulatedRole === "admin" && (
                              <button type="button" className="w-6 h-6 rounded-lg bg-zinc-50 text-zinc-400 text-xs border flex items-center justify-center" onClick={() => { setHasUnsavedChanges(true); setFormSections(prev => prev.filter(x => x.id !== sec.id)); }}>✕</button>
                            )}
                          </div>

                          {isRealtimePreviewActive ? (
                            <div className="border border-dashed border-zinc-200 rounded-xl p-4 bg-zinc-50/15 space-y-4">
                              
                              {isSectionMismatched && (
                                <div className="text-[10px] font-black text-amber-700 bg-amber-100/70 border border-amber-200 p-2 rounded-lg leading-snug animate-in fade-in duration-100">
                                  ⚠️ Alignment Warning: Line values sum up to{" "}
                                  <span className="font-mono">{Math.floor(totalManualAbsoluteBeats / 4)}m + {totalManualAbsoluteBeats % 4}b</span>. Please adjust line properties to equal the section master total of{" "}
                                  <span className="font-mono">{timingTuple.measures}m + {timingTuple.beats}b</span> to unlock saving permissions.
                                </div>
                              )}

                              <div className="space-y-3">
                                {linesArray.map((lineText, lineIdx) => {
                                  const lineMetrics = currentLinesMetrics[lineIdx];

                                  return (
                                    <div key={lineIdx} className="flex items-center justify-between gap-4 py-1 border-b border-zinc-100/40 last:border-0 group">
                                      <p className="font-sans font-bold text-zinc-800 text-xs tracking-tight flex-1 leading-relaxed">
                                        {lineText}
                                      </p>
                                      
                                      <div className="flex items-center gap-1.5 shrink-0 select-none">
                                        
                                        {/* Line Measure Step Controller */}
                                        <div className="flex items-center gap-1 bg-white border border-zinc-200 p-1 px-2.5 h-7 rounded-lg shadow-sm text-[10px] font-bold text-zinc-400 relative pr-4">
                                          <span>M:</span>
                                          <span className="font-black text-zinc-800 text-center min-w-[12px]">{lineMetrics.measures}</span>
                                          <div className="absolute right-0.5 inset-y-0 flex flex-col justify-center text-[6px] scale-90 leading-[5px] text-zinc-400 font-sans">
                                            <button type="button" onClick={() => handleAdjustLineMetricValue(lineIdx, "measures", 1)} className="hover:text-blue-600 transition-colors py-0.5">▲</button>
                                            <button type="button" onClick={() => handleAdjustLineMetricValue(lineIdx, "measures", -1)} className="hover:text-blue-600 transition-colors py-0.5">▼</button>
                                          </div>
                                        </div>

                                        {/* Line Beat Step Controller */}
                                        <div className="flex items-center gap-1 bg-white border border-zinc-200 p-1 px-2.5 h-7 rounded-lg shadow-sm text-[10px] font-bold text-zinc-400 relative pr-4">
                                          <span>B:</span>
                                          <span className="font-black text-zinc-700 text-center min-w-[12px]">{lineMetrics.beats}</span>
                                          <div className="absolute right-0.5 inset-y-0 flex flex-col justify-center text-[6px] scale-90 leading-[5px] text-zinc-400 font-sans">
                                            <button type="button" onClick={() => handleAdjustLineMetricValue(lineIdx, "beats", 1)} className="hover:text-blue-600 transition-colors py-0.5">▲</button>
                                            <button type="button" onClick={() => handleAdjustLineMetricValue(lineIdx, "beats", -1)} className="hover:text-blue-600 transition-colors py-0.5">▼</button>
                                          </div>
                                        </div>

                                      </div>
                                    </div>
                                  );
                                })}
                                {linesArray.length === 0 && (
                                  <div className="text-center text-xs italic text-zinc-400 py-4">This block enclosure is completely empty.</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <textarea 
                                rows={Math.max(4, sec.content.split("\n").length)} 
                                value={sec.content} 
                                className="w-full border rounded-xl p-2.5 font-mono text-xs resize-none outline-none focus:border-zinc-400 bg-zinc-50/20 overflow-hidden" 
                                onChange={(e) => { 
                                  setHasUnsavedChanges(true); 
                                  setFormSections(formSections.map(x => x.type === sec.type ? { ...x, content: e.target.value } : x)); 
                                }} 
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {simulatedRole === "admin" && (
                    <button type="button" className="w-full border border-dashed py-3 text-center rounded-xl text-blue-600 font-black text-xs uppercase tracking-wider block hover:bg-zinc-50 transition-colors" onClick={() => setIsSectionSelectorOpen(true)}>＋ Add New Section Enclosures</button>
                  )}
                </div>
              )}

              {editorActiveTab === "structure" && (
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 animate-in fade-in select-none">
                  
                  {/* LEFT SURFACE: ACTIVE PLAN TIMELINE CHRONOLOGY */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                      Active Performance Sequence
                    </h4>
                    <div className="space-y-1.5 min-h-[220px] bg-zinc-50/40 p-3 rounded-xl border border-zinc-200/60 shadow-inner">
                      {formSections.map((sec, idx) => {
                        const isBeingDragged = draggedStructureIndex === idx;
                        const isHoveredTarget = dragOverStructureIndex === idx;

                        return (
                          <div 
                            key={sec.id} 
                            draggable={simulatedRole === "admin"} 
                            onDragStart={() => handleStructureDragStart(idx)} 
                            onDragOver={(e) => { e.preventDefault(); if (dragOverStructureIndex !== idx) setDragOverStructureIndex(idx); }}
                            onDragLeave={() => { if (dragOverStructureIndex === idx) setDragOverStructureIndex(null); }}
                            onDragEnd={() => { setDraggedStructureIndex(null); setDragOverStructureIndex(null); }}
                            onDrop={(e) => handleStructureDropOverride(e, idx)}
                            className={`flex items-center justify-between p-3.5 border rounded-xl transition-all duration-150 ${
                              isBeingDragged 
                                ? "opacity-30 bg-zinc-150 border-zinc-300 cursor-grabbing" 
                                : isHoveredTarget
                                ? "border-blue-500 bg-blue-50/50 scale-[1.01] ring-2 ring-blue-400/20 shadow-md cursor-pointer"
                                : "bg-white border-zinc-200/80 shadow-sm cursor-grab hover:bg-zinc-50"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-[11px] text-zinc-400 font-mono font-bold shrink-0">#{idx + 1}</span>
                              <span className="text-xs font-black uppercase tracking-wider text-zinc-700 truncate">{sec.type}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {simulatedRole === "admin" && (
                                <button 
                                  type="button" 
                                  onClick={() => { setHasUnsavedChanges(true); setFormSections(prev => prev.filter(x => x.id !== sec.id)); }}
                                  className="text-[10px] font-bold text-zinc-400 hover:text-red-500 px-1 transition-colors cursor-pointer"
                                >
                                  ✕ Remove
                                </button>
                              )}
                              <span className="text-zinc-300 text-sm font-bold select-none">☰</span>
                            </div>
                          </div>
                        );
                      })}
                      {formSections.length === 0 && (
                        <div className="text-center text-xs italic text-zinc-400 py-12 font-medium">Timeline sequence empty. Append cards from the blueprint drawer.</div>
                      )}
                    </div>
                  </div>

                  {/* RIGHT SURFACE: ARRANGEMENT TEMPLATES drawer */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                      Add Block Element
                    </h4>
                    <div className="grid grid-cols-1 gap-1.5 bg-zinc-50/40 p-3 rounded-xl border border-zinc-200/60 shadow-inner max-h-[360px] overflow-y-auto custom-scrollbar">
                      {uniqueContentSectionsList.map(tmpl => (
                        <div 
                          key={tmpl.id} 
                          className="p-2.5 border border-zinc-200/80 bg-white hover:bg-blue-50/10 hover:border-blue-300 rounded-xl flex items-center justify-between shadow-sm transition-all group select-none"
                        >
                          <span className="text-xs font-black text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="opacity-60 text-xs shrink-0">🏷️</span> {tmpl.type}
                          </span>
                          <button 
                            type="button" 
                            onClick={() => { 
                              setHasUnsavedChanges(true); 
                              setFormSections([...formSections, { id: `sec-dup-${Date.now()}-${Math.random()}`, type: tmpl.type, label: tmpl.label, content: tmpl.content, repetitions: 1 }]); 
                            }} 
                            className="w-6 h-6 rounded-lg bg-zinc-50 hover:bg-blue-600 border border-zinc-200 hover:border-blue-500 text-zinc-400 group-hover:text-white flex items-center justify-center font-black text-xs transition-colors cursor-pointer"
                          >
                            ＋
                          </button>
                        </div>
                      ))}
                      {uniqueContentSectionsList.length === 0 && (
                        <div className="text-center text-xs italic text-zinc-400 py-12 font-medium">No sections built inside the layout. Document lyrics blocks first.</div>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* UNIFIED PERSISTENT SUB FOOTER CONTROL DECK */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-white border-t px-4 md:px-8 flex items-center justify-between z-50 shadow-md flex-shrink-0 select-none rounded-b-xl md:rounded-b-[2.5rem]">
              <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                {editorActiveTab === "content" && isAddChordsModeActive && (
                  <div className="flex items-center gap-1 bg-amber-50/40 border border-amber-200/60 p-1 rounded-xl animate-in slide-in-from-bottom-1 max-w-full overflow-x-auto">
                    <span className="text-[8px] font-black uppercase text-amber-600 tracking-tight shrink-0 px-1">🎸 Notation</span>
                    <select value={selectedChordRoot} className="bg-white border rounded-md px-1.5 py-0.5 text-[10px] font-bold outline-none" onChange={e => { const r = e.target.value; setSelectedChordRoot(r); const m = activeScaleDiatonicDeck.find(o => o.root === r); setCustomChordInputValue(`${r}${m ? m.suffix : ""}`); }}>{activeScaleDiatonicDeck.map((opt, i) => <option key={i} value={opt.root}>{opt.root}{opt.suffix}</option>)}</select>
                    <input type="text" value={customChordInputValue} className="border bg-white rounded-md px-1.5 py-0.5 text-center w-14 text-[10px] font-black outline-none" onChange={e => setCustomChordInputValue(e.target.value)} />
                    <button type="button" className={`px-2.5 py-1 rounded-md font-black text-[9px] uppercase tracking-wide text-white shrink-0 ${isChordInputBlank ? 'bg-red-600' : 'bg-blue-600'}`} onClick={() => executeChordInjectionAtIndex(customChordInputValue)}>{isChordInputBlank ? "Clear" : "Add"}</button>
                  </div>
                )}

                {editorActiveTab === "content" && isAddNotesModeActive && (
                  <div className="flex items-center gap-1.5 bg-purple-50/40 border border-purple-200/60 p-1 rounded-xl flex-1 max-w-md animate-in slide-in-from-bottom-1">
                    <span className="text-[8px] font-black uppercase text-purple-600 tracking-tight shrink-0 px-1">📝 Note</span>
                    <input type="text" value={customCommentInputValue} placeholder="Type row comment..." className="border bg-white rounded-md px-2 py-0.5 text-[10px] font-bold flex-1 outline-none" onChange={e => setCustomCommentInputValue(e.target.value)} />
                    <button type="button" className={`px-2.5 py-1 rounded-md font-black text-[9px] uppercase tracking-wide text-white shrink-0 ${isCommentInputBlank ? 'bg-red-600' : 'bg-purple-600'}`} onClick={() => executeLineCommentInjection(customCommentInputValue)}>{isCommentInputBlank ? "Clear" : "Save"}</button>
                  </div>
                )}

                {!(editorActiveTab === "content" && (isAddChordsModeActive || isAddNotesModeActive)) && editingSongId && simulatedRole === "admin" && (
                  <button 
                    type="button" 
                    className="px-3 py-2 rounded-xl bg-red-50 text-red-600 font-bold text-[10px] uppercase border border-red-200 hover:bg-red-100 transition-all cursor-pointer"
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
                  >
                    🗑️ Delete Song
                  </button>
                )}
              </div>

              {/* LOCK PERMISSIONS: Validation checks accurately evaluating passes = R + 1 to keep save actions unlocked */}
              {(() => {
                const isAnySectionMismatchedAcrossModal = formSections.some((checkSec) => {
                  const checkTuple = getCentralizedMetricsTuple(checkSec.type);
                  const checkLines = checkSec.content.split("\n").map(l => l.replace(/\[[^\]]+\]/g, "").trim()).filter(l => l.length > 0);
                  
                  if (checkLines.length === 0) return false;

                  const checkRepeats = checkTuple.repeats || 0;
                  const totalCheckPasses = checkRepeats + 1; // 🌟 Sync formula 
                  const totalLineSegments = checkLines.length * totalCheckPasses;

                  const targetAbsoluteBeats = (checkTuple.measures * 4) + checkTuple.beats;
                  const checkSpreadMeasures = Math.floor(checkTuple.measures / totalLineSegments);
                  const checkRemainderMeasures = checkTuple.measures % totalLineSegments;

                  const checkSpreadBeats = Math.floor(checkTuple.beats / totalLineSegments);
                  const checkRemainderBeats = checkTuple.beats % totalLineSegments;

                  const calculatedBeatsSum = checkLines.reduce((sum, _, lineIndex) => {
                    const lineOverride = (lineOverrides as any)?.[checkSec.id]?.[lineIndex];
                    const measures = lineOverride?.measures ?? (checkSpreadMeasures + (lineIndex < checkRemainderMeasures ? 1 : 0));
                    const beats = lineOverride?.beats ?? (checkSpreadBeats + (lineIndex < checkRemainderBeats ? 1 : 0));
                    return sum + (measures * 4) + beats;
                  }, 0) * totalCheckPasses;

                  return calculatedBeatsSum !== targetAbsoluteBeats;
                });

                const isSaveDisabled = isRealtimePreviewActive && isAnySectionMismatchedAcrossModal;

                return (
                  <div className="shrink-0">
                    {(simulatedRole === "admin" || simulatedRole === "member") && (
                      <button 
                        type="button" 
                        disabled={isSaveDisabled}
                        className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all ${
                          isSaveDisabled 
                            ? "bg-zinc-200 text-zinc-400 border border-zinc-300 shadow-none cursor-not-allowed opacity-60" 
                            : "bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95 cursor-pointer"
                        }`}
                        onClick={handleCommitSongChangesToDB} 
                      >
                        {isSaveDisabled ? "🔒 Calculations Mismatched" : "Save Arrangement"}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* EMBEDDED MODAL CONFIRMATION DIALOG SHEET OVERLAY CONTAINER */}
            {isConfirmExitModalOpen && (
              <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
                <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-150">
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-base text-zinc-900 tracking-tight">Unsaved Modifications</h4>
                    <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                      You have active modifications inside your arrangement canvas layers. Discard changes and close workspace?
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button 
                      type="button" 
                      onClick={() => setIsConfirmExitModalOpen(false)} 
                      className="py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                      Keep Editing
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        setHasUnsavedChanges(false);
                        setIsConfirmExitModalOpen(false);
                        setIsEditorOpen(false);
                      }} 
                      className="py-2.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      Discard & Exit
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* --- ADD SECTION BLOCK SELECTION MODAL --- */}
      {isSectionSelectorOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[11000] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-xs shadow-2xl border space-y-3 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b pb-1.5">
              <h4 className="font-black text-zinc-900 text-xs">Add Section block</h4>
              <button type="button" className="text-zinc-400 text-xs font-bold" onClick={() => setIsSectionSelectorOpen(false)}>Close</button>
            </div>
            <input type="text" placeholder="Filter templates..." value={sectionSearchTerm} className="w-full bg-zinc-50 border rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none" onChange={e => setSectionSearchTerm(e.target.value)} />
            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto custom-scrollbar">
              {filteredEnclosurePopupCatalog.map(tmpl => (
                <button 
                  key={tmpl.id} type="button" 
                  className="px-3 py-2 hover:bg-zinc-50 text-left border rounded-lg text-[11px] font-bold text-zinc-700 transition-colors"
                  onClick={() => {
                    const existingNumbers = formSections.filter(x => x.type.toLowerCase().startsWith(tmpl.baseType.toLowerCase())).map(x => { const match = x.type.match(/\d+/); return match ? parseInt(match[0], 10) : 0; });
                    const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
                    const blockTypeString = `${tmpl.baseType} ${nextNum}`;
                    setHasUnsavedChanges(true);
                    setFormSections([...formSections, { id: `sec-add-${Date.now()}-${Math.random()}`, type: blockTypeString, label: tmpl.display, content: "", repetitions: 1 }]);
                    setIsSectionSelectorOpen(false); setSectionSearchTerm("");
                  }} 
                >
                  {tmpl.display}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-md z-[11000] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-xl border shadow-2xl space-y-4 animate-in zoom-in-95">
            <h4 className="text-base font-black">Import Plain Text Lyrics</h4>
            <textarea rows={7} value={pastedRawLyricsText} placeholder="Paste plain track text format layout sections (e.g. [Verse 1] lines)..." className="w-full text-xs p-3 border bg-zinc-50/50 rounded-xl outline-none font-mono resize-none" onChange={e => setPastedRawLyricsText(e.target.value)} />
            <div className="grid grid-cols-2 gap-2"><button type="button" className="py-2.5 bg-zinc-100 text-zinc-700 text-xs font-black rounded-lg" onClick={() => setIsImportModalOpen(false)}>Cancel</button><button type="button" className="py-2.5 bg-blue-600 text-white text-xs font-black rounded-lg shadow-sm" onClick={executeRawLyricsImportAction}>Parse & Import</button></div>
          </div>
        </div>
      )}

      {isKeyPopupOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 animate-in fade-in duration-100 select-none">
          <form 
            onSubmit={handleSaveModalKeySelection}
            className="bg-[#f8f9fa] border border-zinc-200 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-100 text-left"
          >
            <button type="button" className="absolute top-4 right-4 w-6 h-6 rounded-full bg-white border text-zinc-400 text-[10px] font-bold flex items-center justify-center shadow-sm" onClick={() => setIsKeyPopupOpen(false)}>✕</button>

            <div className="space-y-0.5">
              <h3 className="text-base font-black text-zinc-900 tracking-tight">Change Key</h3>
              <p className="text-[11px] font-black text-blue-500">Original {formKey}</p>
            </div>

            <div className="grid grid-cols-7 gap-1 bg-white p-1 rounded-xl border shadow-inner">
              {BASE_LETTER_ROOTS.map((letter) => {
                const isSelected = modalKeyRoot === letter;
                return (
                  <button key={letter} type="button" className={`aspect-square rounded-lg text-center text-xs font-black flex items-center justify-center cursor-pointer ${isSelected ? "bg-blue-600 text-white shadow-sm scale-105" : "bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100"}`} onClick={() => setModalKeyRoot(letter)}>{letter}</button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 divide-x bg-white rounded-xl border overflow-hidden shadow-inner h-10">
              <button type="button" className={`text-center text-sm font-black flex items-center justify-center h-full cursor-pointer ${modalKeyAccidental === "b" ? "bg-blue-50/80 text-blue-600" : "text-zinc-600 hover:bg-zinc-50/50"}`} onClick={() => setModalKeyAccidental(modalKeyAccidental === "b" ? "" : "b")}>♭</button>
              <button type="button" className={`text-center text-xs font-black flex items-center justify-center h-full cursor-pointer ${modalKeyAccidental === "#" ? "bg-blue-50/80 text-blue-600" : "text-zinc-600 hover:bg-zinc-50/50"}`} onClick={() => setModalKeyAccidental(modalKeyAccidental === "#" ? "" : "#")}>#</button>
            </div>

            <div className="pt-1">
              <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md text-center">Save Key Change</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}