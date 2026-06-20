"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../../../utils/supabase/client";
import { useEngine } from "../../../context/EngineContext";
import { getSongChordChart } from "../../../../utils/supabase/actions";

// =======================================================
// --- TRANSPOSTITION & DIATONIC CONSTANT BLUEPRINTS -----
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
  "Am": [{root:"A",suffix:"m"}, {root:"B",suffix:"dim"},{root:"C",suffix:""}, {root:"D",suffix:"m"}, {root:"E",suffix:"m"}, {root:"F",suffix:""}, {root:"G",suffix:""}],
  "Bm": [{root:"B",suffix:"m"}, {root:"C#",suffix:"dim"},{root:"D",suffix:""}, {root:"E",suffix:"m"}, {root:"F#",suffix:"m"},{root:"G",suffix:""}, {root:"A",suffix:""}]
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
    repeats?: number;
  };
}

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

export default function SongEditPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const editingSongId = params.id as string;

  const editorContentContainerRef = useRef<HTMLDivElement | null>(null);
  const { activeRole, userTeamId } = useEngine();

  // Primary Hydration States
  const [loading, setLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfirmExitModalOpen, setIsConfirmExitModalOpen] = useState(false);
  const [editorActiveTab, setEditorActiveTab] = useState<"details" | "content" | "structure">("details");
  
  const [formTitle, setFormTitle] = useState("");
  const [formTempo, setFormTempo] = useState("");
  const [formKey, setFormKey] = useState("G");
  const [formArtist, setFormArtist] = useState("");
  const [formThemes, setFormThemes] = useState<string[]>([]);
  const [themeInputSearchValue, setThemeInputSearchValue] = useState("");
  const [isArtistDropdownFocused, setIsArtistDropdownFocused] = useState(false);
  const [knownArtists, setKnownArtists] = useState<string[]>([]);

  useEffect(() => {
    const fetchGlobalArtists = async () => {
      const { data: allSongs } = await supabase
        .from("songs")
        .select("artist");
        
      if (allSongs) {
        const uniqueArtists = Array.from(new Set(allSongs.map(s => s.artist).filter(Boolean)));
        setKnownArtists(uniqueArtists as string[]);
      }
    };
    
    fetchGlobalArtists();
  }, [supabase]);

  const [isThemeDropdownFocused, setIsThemeDropdownFocused] = useState(false);
  const [formSections, setFormSections] = useState<SongSectionBlock[]>([]);
  const [sectionTimings, setSectionTimings] = useState<SectionTimingMap>({});
  const [lineOverrides, setLineOverrides] = useState<Record<string, Record<number, { measures: number; beats: number }>> | null>(null);
  
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
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  
  const [draggedStructureIndex, setDraggedStructureIndex] = useState<number | null>(null);
  const [dragOverStructureIndex, setDragOverStructureIndex] = useState<number | null>(null);

  // Data Hydration Stream
  useEffect(() => {
    const hydrateArrangementWorkspace = async () => {
      if (!editingSongId) return;
      
      if (editingSongId === "new") {
        setLoading(false);
        return; 
      }
      try {
        setLoading(true);
        const { data: song, error: songFetchError } = await supabase
          .from("songs")
          .select("*")
          .eq("id", editingSongId)
          .single();

        if (songFetchError || !song) throw songFetchError;

        setFormTitle(song.title || "");
        setFormTempo(song.tempo || "");
        setFormKey(song.original_key || "G");
        setFormArtist(song.artist || "");
        setFormThemes(song.themes ? song.themes.split(",").map((t: string) => t.trim()).filter(Boolean) : []);
        setSectionTimings(song.section_timings || {});

        const sectionsRaw = await getSongChordChart(editingSongId);
        if (sectionsRaw && sectionsRaw.length > 0) {
          const loadedBlocks = sectionsRaw.map((s: any, idx: number) => ({ 
            id: s.id || `sec-${idx}-${Math.random()}`, 
            type: s.section_name || "Verse 1", 
            label: s.section_name || "Verse 1", 
            content: s.content || "", 
            repetitions: 1
          }));
          setFormSections(loadedBlocks);

          const hydratedOverrides: Record<string, any> = {};
          loadedBlocks.forEach((sec) => {
            const savedMetricsNode = song.section_timings?.[sec.type];
            if (savedMetricsNode?.line_timings) {
              hydratedOverrides[sec.type] = savedMetricsNode.line_timings;
            }
          });
          setLineOverrides(hydratedOverrides);
        } else {
          setFormSections([{ id: "sec-1", type: "Verse 1", label: "Verse 1", content: "", repetitions: 1 }]);
        }
      } catch (err: any) {
        // ✅ SURGICAL FIX: Stringify the hydration error so it doesn't hide
        console.error("Tracking hydration synced drop failure:", err?.message || JSON.stringify(err));
      } finally {
        setLoading(false);
        setHasUnsavedChanges(false);
      }
    };

    hydrateArrangementWorkspace();
  }, [editingSongId]);

  // Global Key Escape Interceptor
  useEffect(() => {
    const handleModalHardwareEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleAttemptDismissal();
    };
    window.addEventListener("keydown", handleModalHardwareEscapeKey);
    return () => window.removeEventListener("keydown", handleModalHardwareEscapeKey);
  }, [hasUnsavedChanges]);

  const activeScaleDiatonicDeck = useMemo(() => DIATONIC_MODES_MAP[formKey] || DIATONIC_MODES_MAP["G"], [formKey]);

  // Nashville Input Listener
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
        e.preventDefault();
        const { sectionType, lineIdx, wordIdx = 0 } = chordTargetCoordinate;
        setHasUnsavedChanges(true);
        setFormSections(prev => prev.map(sec => {
          if (sec.type !== sectionType) return sec;
          const lines = sec.content.split("\n");
          let realWordCounter = 0;
          lines[lineIdx] = (lines[lineIdx] || "").replace(/(?:\[[^\]]+\]|\{\s*[^\}]+\s*\}|\S)+/g, (match) => {
            if (realWordCounter === wordIdx) { realWordCounter++; return match.replace(/\[[^\]]+\]/g, ""); }
            realWordCounter++; return match;
          });
          return { ...sec, content: lines.join("\n") };
        }));
        setChordTargetCoordinate(null);
      }
    };
    window.addEventListener("keydown", handleNashvilleNumberKeyInjections);
    return () => window.removeEventListener("keydown", handleNashvilleNumberKeyInjections);
  }, [isAddChordsModeActive, chordTargetCoordinate, activeScaleDiatonicDeck]);

  // Transposition Actions (Surgically linked back up)
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

  const handleSelectNewKeySignature = (newKey: string) => {
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
  };

  const handleSaveModalKeySelection = (e: React.FormEvent) => {
    e.preventDefault();
    const isMinorSong = formKey.endsWith("m");
    const nextKeyComputedName = `${modalKeyRoot}${modalKeyAccidental}${isMinorSong ? "m" : ""}`;
    handleSelectNewKeySignature(nextKeyComputedName);
  };

  const getCentralizedMetricsTuple = (sectionType: string) => {
    const savedMetrics = sectionTimings[sectionType];
    return {
      measures: savedMetrics?.measures ?? 4,
      beats: savedMetrics?.beats ?? 0,
      repeats: savedMetrics?.repeats ?? 0
    };
  };

  const handleUpdateCentralizedMetrics = (sectionType: string, field: "measures" | "beats" | "repeats", value: number) => {
    setHasUnsavedChanges(true);
    setSectionTimings(prev => {
      const currentTuple = prev[sectionType] || { measures: 4, beats: 0, repeats: 0 };
      return { ...prev, [sectionType]: { ...currentTuple, [field]: value } };
    });
  };

  const handleAddSectionBelow = (tmpl: any) => {
    const newSection = { id: `sec-${Date.now()}-${Math.random()}`, type: tmpl.type, label: tmpl.label, content: tmpl.content, repetitions: 1 };
    const updatedSections = [...formSections];
    const selectedIndex = updatedSections.findIndex(s => s.id === selectedSequenceId);
    
    if (selectedIndex > -1) updatedSections.splice(selectedIndex + 1, 0, newSection);
    else updatedSections.push(newSection);
    
    setHasUnsavedChanges(true);
    setFormSections(updatedSections);
  };

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

  const executeChordInjectionAtIndex = (injectedTokenStr: string) => {
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
  };

  const executeLineCommentInjection = (injectedCommentStr: string) => {
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
  };

  const executeRawLyricsImportAction = () => {
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
  };

  const handleAttemptDismissal = () => {
    if (hasUnsavedChanges) {
      setIsConfirmExitModalOpen(true);
      return;
    }
    router.push("/songs");
  };

  const handleCommitSongChangesToDB = async () => {
    if (!editingSongId) return;

    if (activeRole !== "admin") {
      alert("Permission denied: Only admins can save arrangement modifications.");
      return;
    }

    setLoading(true);

    try {
      const updatedSectionTimings: Record<string, any> = {};
      formSections.forEach((sec) => {
        const metricsTuple = getCentralizedMetricsTuple(sec.type);
        const specificRowOverrides = lineOverrides?.[sec.type] || null;

        updatedSectionTimings[sec.type] = {
          measures: metricsTuple.measures,
          beats: metricsTuple.beats,
          repeats: metricsTuple.repeats,
          line_timings: specificRowOverrides 
        };
      });

      const songPayload = {
        title: formTitle,
        artist: formArtist,
        tempo: parseInt(formTempo, 10) || 75,
        original_key: formKey,
        themes: formThemes.join(", "),
        section_timings: updatedSectionTimings,
        // ✅ SURGICAL FIX: Pass an empty string to satisfy the database's strict NOT NULL constraint!
        chordpro_content: "" 
      };

      let targetSongId = editingSongId;

      // ✅ SURGICAL FIX: Branching logic for Create vs. Update
      if (editingSongId === "new") {
        // 1. INSERT NEW SONG
        const { data: newSong, error: insertSongError } = await supabase
          .from("songs")
          .insert({ ...songPayload, team_id: userTeamId })
          .select("id")
          .single();

        if (insertSongError) throw insertSongError;
        targetSongId = newSong.id; // Grab the newly generated UUID!
      } else {
        // 2. UPDATE EXISTING SONG
        const { error: songUpdateError } = await supabase
          .from("songs")
          .update(songPayload)
          .eq("id", targetSongId);

        if (songUpdateError) throw songUpdateError;

        // Wipe out old sections before writing the new ones
        const { error: deleteError } = await supabase
          .from("song_sections")
          .delete()
          .eq("song_id", targetSongId);

        if (deleteError) throw deleteError;
      }

      // 3. INSERT SECTIONS (Works for both new and existing songs!)
      const sectionsToInsert = formSections.map((sec, index) => ({
        song_id: targetSongId,
        section_name: sec.type,
        content: sec.content || "",
        sequence_order: index
      }));

      if (sectionsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("song_sections")
          .insert(sectionsToInsert);
        if (insertError) throw insertError;
      }

      setHasUnsavedChanges(false);
      router.push("/songs");
    } catch (err: any) {
      const errorMessage = err?.message || JSON.stringify(err);
      console.error("Database connection failure drop crash:", errorMessage);
      alert(`Failed to save: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  function renderSymmetricalLivePreviewLine(sectionType: string, contentText: string) {
  if (!contentText.trim()) return <p className="text-zinc-400 italic text-xs font-semibold py-1">Empty line segment...</p>;
  
  return contentText.split("\n").map((line, lineIdx) => {
    let lineCommentText = "";
    // Cleanly extract comments and split line into word tokens
    const wordsArray = line.replace(/\{([^\}]+)\}/g, (m, p1) => { lineCommentText = p1.trim(); return ""; }).match(/(?:\[[^\]]+\]|\S)+/g) || [];
    
    return (
      <div key={lineIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1 px-2 rounded-xl transition-all duration-150 relative">
        <div className="flex flex-wrap items-end gap-x-2 gap-y-2 py-1 leading-none flex-1">
          {wordsArray.map((chunk, currentWordIdx) => {
            const chordRegex = /\[([^\]]+)\]/g; 
            const extractedChordsList: string[] = []; 
            let matchResult;
            while ((matchResult = chordRegex.exec(chunk)) !== null) { extractedChordsList.push(matchResult[1]); }
            
            const cleanWordDisplay = chunk.replace(/\[[^\]]+\]/g, "");
            const isTargetedCoordinate = chordTargetCoordinate?.sectionType === sectionType && 
                                        chordTargetCoordinate?.lineIdx === lineIdx && 
                                        chordTargetCoordinate?.wordIdx === currentWordIdx;
            
            const hasNotation = extractedChordsList.length > 0;

            return (
              <div 
                key={currentWordIdx} 
                onClick={(e) => { 
                  if (isAddChordsModeActive) { 
                    e.stopPropagation(); 
                    setChordTargetCoordinate({ sectionType, lineIdx, wordIdx: currentWordIdx }); 
                    setCustomChordInputValue(hasNotation ? extractedChordsList[0] : ""); 
                  } 
                }} 
                className={`
                  flex flex-col items-start relative select-none rounded-lg px-2 py-0.5 transition-all duration-150 cursor-pointer
                  ${isAddChordsModeActive 
                    ? hasNotation 
                      ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-400/20 shadow-sm' 
                      : 'border-zinc-200 bg-white hover:bg-zinc-100 hover:border-zinc-300'
                    : 'border-transparent'}
                  ${isTargetedCoordinate ? '!bg-blue-600 !text-white ring-2 ring-blue-500/30 !scale-105 z-10' : ''}
                `}
              >
                {hasNotation && (
                  <div className="min-h-[1rem] text-[10px] font-mono font-black flex flex-wrap gap-0.5 mb-0.5 leading-none">
                    {extractedChordsList.map((ch, cIndex) => (
                      <span key={cIndex} className={`px-0.5 rounded border font-bold ${isTargetedCoordinate ? 'text-white border-transparent' : 'text-blue-600 bg-blue-100/50 border-blue-200'}`}>
                        {ch}
                      </span>
                    ))}
                  </div>
                )}
                <div className={`text-[13px] font-sans font-bold leading-tight ${isTargetedCoordinate ? 'text-white' : 'text-zinc-800'}`}>
                  {cleanWordDisplay || " "}
                </div>
              </div>
            );
          })}
        </div>
        {lineCommentText && (
          <div style={{ fontFamily: "'Nothing You Could Do', cursive" }} className="text-[14px] text-zinc-500 italic shrink-0 sm:text-right pl-4">
            {lineCommentText}
          </div>
        )}
      </div>
    );
  });
}

  const uniqueContentSectionsList = formSections.reduce((acc: SongSectionBlock[], curr) => { if (!acc.some(item => item.type === curr.type)) acc.push(curr); return acc; }, []);
  const filteredThemeCatalogSuggestions = CHRISTIAN_THEMES_PRESETS.filter(th => th.toLowerCase().includes(themeInputSearchValue.toLowerCase()) && !formThemes.includes(th));
  const filteredArtistSuggestions = knownArtists.filter(a => a.toLowerCase().includes(formArtist.toLowerCase()));
  const filteredEnclosurePopupCatalog = ENCLOSURE_POPUP_CATALOG.filter(item => item.display.toLowerCase().includes(sectionSearchTerm.toLowerCase()));
  const isChordInputBlank = customChordInputValue.trim() === ""; 
  const isCommentInputBlank = customCommentInputValue.trim() === "";

  if (loading && formSections.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f8f9fa] text-center select-none animate-pulse">
        <div className="text-[10px] font-mono font-black uppercase text-blue-600 tracking-widest">Syncing Catalog Rows...</div>
      </div>
    );
  }

  return (
    /* SURGICAL DE-CONTAINERIZATION: Bounding limits like max-w-4xl and centering elements removed (edited-image.png) */
    <div ref={editorContentContainerRef} className="h-screen w-full overflow-hidden bg-[#f8f9fa] flex flex-col relative animate-in fade-in duration-200">
      <style dangerouslySetInnerHTML={{__html: `@import url('https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap');`}} />

      {/* FULL-WIDTH STICKY DOCK HEADER BAR */}
      {/* --- STICKY DOCK HEADER BAR --- */}
      {/* ========================================= */}
      {/* --- UNIFIED SEMANTIC STICKY HEADER --- */}
      {/* ========================================= */}
      <header className="sticky top-0 z-[100] w-full flex-shrink-0 bg-white border-b border-zinc-200 shadow-sm supports-[backdrop-filter]:bg-white/95 supports-[backdrop-filter]:backdrop-blur-sm">
        
        {/* 1. TOP BAR: Title & Primary Actions */}
        <div className="flex items-center justify-between px-4 md:px-8 py-3.5 w-full">
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={handleAttemptDismissal} 
              className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold flex items-center justify-center transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <h1 className="font-black text-base md:text-lg text-zinc-900 tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
              Modify Worship Arrangement
            </h1>
            <button
              type="button"
              onClick={() => router.push(`/songs/${editingSongId}`)}
              className="hidden md:flex px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer items-center gap-1.5 ml-2"
            >
              View Lyrics
            </button>
          </div>
          
          <div className="hidden md:flex items-center gap-2 select-none">
            {editorActiveTab === "content" && (
              <>
                <button type="button" onClick={() => setIsImportModalOpen(true)} className="px-3 py-1.5 text-[11px] font-black text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg block shadow-sm">📥 Import Raw</button>
                <button type="button" onClick={() => { const nextState = !isRealtimePreviewActive; setIsRealtimePreviewActive(nextState); if (!nextState) { setIsAddChordsModeActive(false); setIsAddNotesModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); } }} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all ${isRealtimePreviewActive ? 'bg-blue-600 border-blue-500 text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-700'}`}> {isRealtimePreviewActive ? "👁️ Hide Preview" : "👁️ Show Preview"} </button>
                <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddChordsModeActive(!isAddChordsModeActive); setIsAddNotesModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); }} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all disabled:opacity-40 ${isAddChordsModeActive ? 'bg-amber-500 border-amber-400 text-white' : 'bg-white border-zinc-200 text-zinc-700'}`}> {isAddChordsModeActive ? "🎸 Lock Mode" : "🎸 Add Notation"} </button>
                <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddNotesModeActive(!isAddNotesModeActive); setIsAddChordsModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); }} className={`px-3 py-1.5 text-[11px] font-black rounded-lg border transition-all disabled:opacity-40 ${isAddNotesModeActive ? 'bg-purple-600 border-purple-500 text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-700'}`}> 📝 Add Notes </button>
              </>
            )}
          </div>
        </div>

        {/* 2. SUB-NAVIGATION BAR: Tabs & Mobile Actions */}
        <nav className="flex flex-col select-none w-full border-t border-zinc-100">
          <div className="px-4 md:px-8 flex gap-4 text-xs font-bold bg-zinc-50/30">
            {(["details", "content", "structure"] as const).map(tab => (
              <button key={tab} type="button" onClick={() => setEditorActiveTab(tab)} className={`py-3 capitalize tracking-wide transition-all border-b-2 font-black ${editorActiveTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>{tab}</button>
            ))}
          </div>

          {/* MOBILE ACTIONS */}
          {editorActiveTab === "content" && (
            <div className="w-full bg-zinc-50/80 p-2 flex items-center gap-1.5 overflow-x-auto overflow-y-hidden flex-nowrap scrollbar-none border-t border-zinc-100 md:hidden">
              <button type="button" onClick={() => setIsImportModalOpen(true)} className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-md text-[9px] font-black uppercase tracking-wider text-zinc-700 shrink-0 shadow-sm">📥 Import</button>
              <button type="button" onClick={() => { const nextState = !isRealtimePreviewActive; setIsRealtimePreviewActive(nextState); if (!nextState) { setIsAddChordsModeActive(false); setIsAddNotesModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); } }} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border shadow-sm transition-colors ${isRealtimePreviewActive ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white border-zinc-200 text-zinc-700'}`}>👁️ {isRealtimePreviewActive ? "Hide Live" : "Preview"}</button>
              <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddChordsModeActive(!isAddChordsModeActive); setIsAddNotesModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); }} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border transition-all disabled:opacity-40 ${isAddChordsModeActive ? 'bg-amber-500 border-amber-400 text-white shadow-sm' : 'bg-white border-zinc-200 text-zinc-700'}`}>🎸 Chords</button>
              <button type="button" disabled={!isRealtimePreviewActive} onClick={() => { setIsAddNotesModeActive(!isAddNotesModeActive); setIsAddChordsModeActive(false); setChordTargetCoordinate(null); setNotesTargetCoordinate(null); }} className={`px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider shrink-0 border transition-all disabled:opacity-40 ${isAddNotesModeActive ? 'bg-purple-600 border-purple-500 text-white shadow-sm' : 'bg-white border-zinc-200 text-zinc-700'}`}>📝 Note Rows</button>
            </div>
          )}
        </nav>
      </header>

      {/* FULL-BLEED WORKSPACE CANVAS */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-20 custom-scrollbar space-y-3 w-full">
        {editorActiveTab === "details" && (
          <div className="w-full animate-in fade-in relative z-[200]">
            <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-zinc-200 space-y-4 shadow-sm">
              <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Track Title Signature *</label><input type="text" value={formTitle} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 outline-none" onChange={e => { setHasUnsavedChanges(true); setFormTitle(e.target.value); }} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">BPM Tempo Count</label><input type="number" value={formTempo} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs outline-none" onChange={e => { setHasUnsavedChanges(true); setFormTempo(e.target.value); }} /></div>
                <div>
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Original Target Key Signature *</label>
                  <button type="button" onClick={() => handleOpenKeySelectionPopup()} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 text-left flex justify-between items-center outline-none">
                    <span>{formKey ? `Key of ${formKey}` : "Select Key"}</span>
                    <span className="text-[10px] text-zinc-400">▼</span>
                  </button>
                </div>
              </div>
              
              {/* ✅ SURGICAL FIX: Autofill Artist Dropdown UI */}
              <div className="relative">
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Artist / Author Label Signature *</label>
                <input 
                  type="text" 
                  value={formArtist} 
                  autoComplete="off" // ✅ SURGICAL FIX: S
                  onFocus={() => setIsArtistDropdownFocused(true)}
                  onBlur={() => setTimeout(() => setIsArtistDropdownFocused(false), 200)}
                  onChange={e => { setHasUnsavedChanges(true); setFormArtist(e.target.value); }} 
                  className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 outline-none" 
                />
                {isArtistDropdownFocused && filteredArtistSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl max-h-40 overflow-y-auto z-[3000] shadow-xl">
                    {filteredArtistSuggestions.map(artist => (
                      <button 
                        key={artist} 
                        type="button" 
                        className="w-full px-3 py-2 text-left text-xs font-bold block border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors" 
                        onClick={() => { setHasUnsavedChanges(true); setFormArtist(artist); setIsArtistDropdownFocused(false); }}
                      >
                        {artist}
                      </button>
                    ))}
                  </div>
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

        {/* PRIMARY WORKSPACE CANVAS: CONTENT TAB PANEL */}
        {editorActiveTab === "content" && (
          <div className="w-full space-y-3 pb-6 animate-in fade-in">
            <div className="space-y-3">
              {formSections.map((sec) => {
                const timingTuple = getCentralizedMetricsTuple(sec.type);
                
                // Process and keep raw lines with chord brackets intact for word container processing
                const processedLines = sec.content.split("\n").map((line) => {
                  return {
                    rawText: line,
                    cleanText: line.replace(/\[[^\]]+\]/g, "").replace(/\{[^\}]+\}/g, "").trim()
                  };
                }).filter(line => line.cleanText.length > 0);

                const totalLines = processedLines.length;
                const sectionRepeats = timingTuple.repeats || 0;
                const totalPasses = sectionRepeats + 1; 
                const totalLineSegmentsCount = totalLines * totalPasses;
                const masterTotalAbsoluteBeats = (timingTuple.measures * 4) + timingTuple.beats;

                const autoSpreadMeasures = totalLineSegmentsCount > 0 ? Math.floor(timingTuple.measures / totalLineSegmentsCount) : 0;
                const remainderMeasures = totalLineSegmentsCount > 0 ? timingTuple.measures % totalLineSegmentsCount : 0;
                const autoSpreadBeats = totalLineSegmentsCount > 0 ? Math.floor(timingTuple.beats / totalLineSegmentsCount) : 0;
                const remainderBeats = totalLineSegmentsCount > 0 ? timingTuple.beats % totalLineSegmentsCount : 0;

                const currentLinesMetrics = processedLines.map((_, lIdx) => {
                  // ✅ SURGICAL FIX: Access via sec.type
                  const explicitOverride = (lineOverrides as any)?.[sec.type]?.[lIdx];
                  if (explicitOverride) return explicitOverride;
                  return {
                    measures: autoSpreadMeasures + (lIdx < remainderMeasures ? 1 : 0),
                    beats: autoSpreadBeats + (lIdx < remainderBeats ? 1 : 0)
                  };
                });

                const totalManualLineMeasures = currentLinesMetrics.reduce((sum, l) => sum + l.measures, 0) * totalPasses;
                const totalManualLineBeats = currentLinesMetrics.reduce((sum, l) => sum + l.beats, 0) * totalPasses;
                const totalManualAbsoluteBeats = (totalManualLineMeasures * 4) + totalManualLineBeats;
                const isSectionMismatched = totalLines > 0 && totalManualAbsoluteBeats !== masterTotalAbsoluteBeats;

                const handleAdjustLineMetricValue = (lineIdx: number, field: "measures" | "beats", delta: number) => {
                  const currentVal = currentLinesMetrics[lineIdx][field];
                  const proposedVal = Math.max(0, currentVal + delta);

                  if (field === "beats" && proposedVal > 3) return;
                  const deltaBeats = (field === "measures" ? (delta * 4) : delta) * totalPasses;
                  const projectedAbsoluteBeats = totalManualAbsoluteBeats + deltaBeats;

                  if (projectedAbsoluteBeats > masterTotalAbsoluteBeats) return;

                  setHasUnsavedChanges(true);
                  setLineOverrides(prev => {
                    const prevOverrides = prev || {};
                    // ✅ SURGICAL FIX: Execute a true DEEP COPY to prevent React state poisoning
                    const sectionMap = { ...(prevOverrides[sec.type] || {}) };
                    
                    processedLines.forEach((_, currentIdx) => {
                      if (sectionMap[currentIdx] === undefined) {
                        sectionMap[currentIdx] = {
                          measures: autoSpreadMeasures + (currentIdx < remainderMeasures ? 1 : 0),
                          beats: autoSpreadBeats + (currentIdx < remainderBeats ? 1 : 0)
                        };
                      } else {
                        sectionMap[currentIdx] = { ...sectionMap[currentIdx] };
                      }
                    });
                    
                    sectionMap[lineIdx] = { ...sectionMap[lineIdx], [field]: proposedVal };
                    return { ...prevOverrides, [sec.type]: sectionMap };
                  });
                };

                return (
                  <div key={sec.id} className={`border rounded-xl p-3.5 space-y-2 relative transition-all shadow-sm ${isRealtimePreviewActive && isSectionMismatched ? "bg-amber-50/40 border-amber-300 ring-4 ring-amber-500/5" : "bg-white border-zinc-200"}`}>
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
                          <input type="number" min={0} value={timingTuple.measures} className="w-6 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "measures", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                          <span className="text-[8px] font-black uppercase text-zinc-400">B:</span>
                          <input type="number" min={0} max={3} value={timingTuple.beats} className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "beats", Math.min(3, Math.max(0, parseInt(e.target.value, 10) || 0))); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                          <span className="text-[8px] font-black uppercase text-zinc-400">R:</span>
                          <input type="number" min={0} value={sectionRepeats} className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "repeats", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                        </div>
                      </div>

                      {activeRole === "admin" && (
                        <button type="button" className="w-6 h-6 rounded-lg bg-zinc-50 text-zinc-400 text-xs border flex items-center justify-center" onClick={() => { setHasUnsavedChanges(true); setFormSections(prev => prev.filter(x => x.id !== sec.id)); }}>✕</button>
                      )}
                    </div>

                    {isRealtimePreviewActive ? (
                      <div className="border border-dashed border-zinc-200 rounded-xl p-4 bg-zinc-50/15 space-y-4">
                        {isSectionMismatched && (
                          <div className="text-[10px] font-black text-amber-700 bg-amber-100/70 border border-amber-200 p-2 rounded-lg leading-snug animate-in fade-in duration-100">
                            ⚠️ Alignment Warning: Line values sum up to <span className="font-mono">{Math.floor(totalManualAbsoluteBeats / 4)}m + {totalManualAbsoluteBeats % 4}b</span>. Please adjust line properties to equal the section master total of <span className="font-mono">{timingTuple.measures}m + {timingTuple.beats}b</span> to unlock saving permissions.
                          </div>
                        )}

                        <div className="space-y-3">
                          {processedLines.map((line, lineIdx) => {
                            const lineMetrics = currentLinesMetrics[lineIdx];
                            
                            // Splitting our newly mapped raw text into chunked arrays
                            const wordsArray = line.rawText.replace(/\{([^\}]+)\}/g, "").match(/(?:\[[^\]]+\]|\S)+/g) || [];

                            return (
                              <div key={lineIdx} className="flex items-center justify-between gap-4 py-1 border-b border-zinc-100/40 last:border-0 group">
                                
                                {/* SURGICAL REPLACEMENT: Replaced the static layout row text with itemized clickable card blocks */}
                                <div className="flex flex-wrap items-end gap-x-1.5 gap-y-2 py-0.5 leading-none flex-1">
                                  {wordsArray.map((chunk, currentWordIdx) => {
                                    const chordRegex = /\[([^\]]+)\]/g;
                                    const extractedChordsList: string[] = [];
                                    let matchResult;
                                    while ((matchResult = chordRegex.exec(chunk)) !== null) { extractedChordsList.push(matchResult[1]); }
                                    
                                    const cleanWordDisplay = chunk.replace(/\[[^\]]+\]/g, "");
                                    const isTargetedCoordinate = chordTargetCoordinate?.sectionType === sec.type && 
                                                                chordTargetCoordinate?.lineIdx === lineIdx && 
                                                                chordTargetCoordinate?.wordIdx === currentWordIdx;
                                    const hasNotation = extractedChordsList.length > 0;

                                    return (
                                      <div 
                                        key={currentWordIdx} 
                                        style={{ pointerEvents: 'auto' }} 
                                        onClick={(e) => { 
                                          if (isAddChordsModeActive) { 
                                            e.stopPropagation(); 
                                            setChordTargetCoordinate({ sectionType: sec.type, lineIdx, wordIdx: currentWordIdx }); 
                                            setCustomChordInputValue(hasNotation ? extractedChordsList[0] : ""); 
                                          } 
                                        }} 
                                        className={`flex flex-col items-start relative select-none rounded-lg px-2 py-0.5 transition-all duration-150 cursor-pointer ${isAddChordsModeActive ? hasNotation ? 'border border-blue-500 bg-blue-50/40 ring-1 ring-blue-400/20 shadow-sm' : 'border border-zinc-200 bg-white hover:bg-zinc-100 hover:border-zinc-300' : 'border border-transparent'} ${isTargetedCoordinate ? '!bg-blue-600 !text-white ring-2 ring-blue-500/30 !scale-105 z-10' : ''}`}
                                      >
                                        {hasNotation && (
                                          <div className="min-h-[1rem] text-[10px] font-mono font-black flex flex-wrap gap-0.5 mb-0.5 leading-none">
                                            {extractedChordsList.map((ch, cIndex) => (
                                              <span key={cIndex} className={`px-0.5 rounded border font-bold ${isTargetedCoordinate ? 'text-white border-transparent' : 'text-blue-600 bg-blue-100/50 border-blue-200'}`}>
                                                {ch}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        <div className={`text-[13px] font-sans font-bold leading-tight ${isTargetedCoordinate ? 'text-white' : 'text-zinc-800'}`}>
                                          {cleanWordDisplay || " "}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 select-none">
                                  <div className="flex items-center gap-1 bg-white border border-zinc-200 p-1 px-2.5 h-7 rounded-lg shadow-sm text-[10px] font-bold text-zinc-400 relative pr-4">
                                    <span>M:</span>
                                    <span className="font-black text-zinc-800 text-center min-w-[12px]">{lineMetrics.measures}</span>
                                    <div className="absolute right-0.5 inset-y-0 flex flex-col justify-center text-[6px] scale-90 leading-[5px] text-zinc-400 font-sans">
                                      <button type="button" onClick={() => handleAdjustLineMetricValue(lineIdx, "measures", 1)} className="hover:text-blue-600 transition-colors py-0.5">▲</button>
                                      <button type="button" onClick={() => handleAdjustLineMetricValue(lineIdx, "measures", -1)} className="hover:text-blue-600 transition-colors py-0.5">▼</button>
                                    </div>
                                  </div>
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
                        </div>
                      </div>
                    ) : (
                      <div>
                        <textarea rows={Math.max(4, sec.content.split("\n").length)} value={sec.content} className="w-full border rounded-xl p-2.5 font-mono text-xs resize-none outline-none focus:border-zinc-400 bg-zinc-50/20 overflow-hidden" onChange={(e) => { setHasUnsavedChanges(true); setFormSections(formSections.map(x => x.type === sec.type ? { ...x, content: e.target.value } : x)); }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {activeRole === "admin" && (
              <button type="button" className="w-full border border-dashed py-3 text-center rounded-xl text-blue-600 font-black text-xs uppercase tracking-wider block hover:bg-zinc-50 transition-colors" onClick={() => setIsSectionSelectorOpen(true)}>＋ Add New Section Enclosures</button>
            )}
          </div>
        )}

        {editorActiveTab === "structure" && (
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 animate-in fade-in select-none">
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Active Performance Sequence</h4>
              <div className="space-y-1.5 min-h-[220px] h-fit bg-zinc-50/40 p-3 rounded-xl border border-zinc-200/60 shadow-inner">
                {formSections.map((sec, idx) => {
                  const isBeingDragged = draggedStructureIndex === idx;
                  const isHoveredTarget = dragOverStructureIndex === idx;
                  const isSelectedNode = selectedSequenceId === sec.id;

                  return (
                    <div key={sec.id} draggable={activeRole === "admin"} onDragStart={() => setDraggedStructureIndex(idx)} onDragOver={(e) => { e.preventDefault(); if (dragOverStructureIndex !== idx) setDragOverStructureIndex(idx); }} onDragLeave={() => { if (dragOverStructureIndex === idx) setDragOverStructureIndex(null); }} onDragEnd={() => { setDraggedStructureIndex(null); setDragOverStructureIndex(null); }} onDrop={(e) => handleStructureDropOverride(e, idx)} onClick={() => setSelectedSequenceId(isSelectedNode ? null : sec.id)} className={`flex items-center justify-between p-3.5 border rounded-xl transition-all duration-150 ${isBeingDragged ? "opacity-30 bg-zinc-150 border-zinc-300 cursor-grabbing" : isHoveredTarget ? "border-blue-500 bg-blue-50/50 scale-[1.01] ring-2 ring-blue-400/20 shadow-md cursor-pointer" : isSelectedNode ? "border-blue-600 bg-blue-50/80 scale-[1.005] ring-2 ring-blue-500/30 shadow-md cursor-pointer" : "bg-white border-zinc-200/80 shadow-sm cursor-grab hover:bg-zinc-50"}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[11px] text-zinc-400 font-mono font-bold shrink-0">#{idx + 1}</span>
                        <span className="text-xs font-black uppercase tracking-wider text-zinc-700 truncate">{sec.type}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {activeRole === "admin" && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setHasUnsavedChanges(true); setFormSections(prev => prev.filter(x => x.id !== sec.id)); if (isSelectedNode) setSelectedSequenceId(null); }} className="text-[10px] font-bold text-zinc-400 hover:text-red-500 px-1 transition-colors cursor-pointer">✕ Remove</button>
                        )}
                        <span className="text-zinc-300 text-sm font-bold select-none">☰</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Add Block Element</h4>
              <div className="grid grid-cols-1 gap-1.5 bg-zinc-50/40 p-3 rounded-xl border border-zinc-200/60 shadow-inner h-fit">
                {uniqueContentSectionsList.map(tmpl => (
                  <div key={tmpl.id} className="p-2.5 border border-zinc-200/80 bg-white hover:bg-blue-50/10 hover:border-blue-300 rounded-xl flex items-center justify-between shadow-sm transition-all group select-none">
                    <span className="text-xs font-black text-zinc-700 uppercase tracking-wider flex items-center gap-1.5"><span className="opacity-60 text-xs shrink-0">🏷️</span> {tmpl.type}</span>
                    <button type="button" onClick={() => handleAddSectionBelow(tmpl)} className="w-6 h-6 rounded-lg bg-zinc-50 hover:bg-blue-600 border border-zinc-200 hover:border-blue-500 text-zinc-400 group-hover:text-white flex items-center justify-center font-black text-xs transition-colors cursor-pointer">＋</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STICKY BOTTOM DECK CONTROLS (Stretches cleanly full-bleed to base layout) */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-white border-t px-4 md:px-8 flex items-center justify-between z-50 shadow-md flex-shrink-0 select-none w-full">
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

          {!(editorActiveTab === "content" && (isAddChordsModeActive || isAddNotesModeActive)) && editingSongId && activeRole === "admin" && (
            <button 
              type="button" 
              className="px-3 py-2 rounded-xl bg-red-50 text-red-600 font-bold text-[10px] uppercase border border-red-200 hover:bg-red-100 transition-all cursor-pointer shadow-sm"
              onClick={async () => {
                if (confirm("Are you sure you want to delete this arrangement permanently?")) {
                  setLoading(true);
                  const { error } = await supabase.from("songs").delete().eq("id", editingSongId);
                  if (!error) router.push("/songs");
                  else setLoading(false);
                }
              }} 
            >
              🗑️ Delete Song
            </button>
          )}
        </div>

        {(() => {
          const isAnySectionMismatchedAcrossModal = formSections.some((checkSec) => {
            const checkTuple = getCentralizedMetricsTuple(checkSec.type);
            const checkLines = checkSec.content.split("\n").map(l => l.replace(/\[[^\]]+\]/g, "").trim()).filter(l => l.length > 0);
            if (checkLines.length === 0) return false;

            const checkRepeats = checkTuple.repeats || 0;
            const totalCheckPasses = checkRepeats + 1; 
            const totalLineSegments = checkLines.length * totalCheckPasses;
            const targetAbsoluteBeats = (checkTuple.measures * 4) + checkTuple.beats;

            const checkSpreadMeasures = Math.floor(checkTuple.measures / totalLineSegments);
            const checkRemainderMeasures = checkTuple.measures % totalLineSegments;
            const checkSpreadBeats = Math.floor(checkTuple.beats / totalLineSegments);
            const checkRemainderBeats = checkTuple.beats % totalLineSegments;

            const calculatedBeatsSum = checkLines.reduce((sum, _, lineIndex) => {
              // ✅ SURGICAL FIX: Validate via checkSec.type
              const lineOverride = (lineOverrides as any)?.[checkSec.type]?.[lineIndex];
              const measures = lineOverride?.measures ?? (checkSpreadMeasures + (lineIndex < checkRemainderMeasures ? 1 : 0));
              const beats = lineOverride?.beats ?? (checkSpreadBeats + (lineIndex < checkRemainderBeats ? 1 : 0));
              return sum + (measures * 4) + beats;
            }, 0) * totalCheckPasses;

            return calculatedBeatsSum !== targetAbsoluteBeats;
          });

          const isSaveDisabled = isRealtimePreviewActive && isAnySectionMismatchedAcrossModal;

          return (
            <div className="shrink-0">
              {/* ✅ SURGICAL FIX: Only show the save button to actual admins, not members! */}
              {activeRole === "admin" && (
                <button 
                  type="button" 
                  disabled={isSaveDisabled}
                  className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all ${isSaveDisabled ? "bg-zinc-200 text-zinc-400 border border-zinc-300 shadow-none cursor-not-allowed opacity-60" : "bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95 cursor-pointer"}`}
                  onClick={handleCommitSongChangesToDB} 
                >
                  {isSaveDisabled ? "🔒 Calculations Mismatched" : "Save Arrangement"}
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* DISCARD OVERLAY MODAL */}
      {isConfirmExitModalOpen && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4 animate-in zoom-in-95 duration-150">
            <div className="space-y-1">
              <h4 className="font-extrabold text-base text-zinc-900 tracking-tight">Unsaved Modifications</h4>
              <p className="text-xs text-zinc-500 font-medium leading-relaxed">You have active modifications inside your arrangement canvas layers. Discard changes and close workspace?</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={() => setIsConfirmExitModalOpen(false)} className="py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer">Keep Editing</button>
              <button type="button" onClick={() => { setHasUnsavedChanges(false); setIsConfirmExitModalOpen(false); router.push("/songs"); }} className="py-2.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 cursor-pointer">Discard & Exit</button>
            </div>
          </div>
        </div>
      )}

      {/* ADD SECTION DIALOG BLOCK */}
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
                <button key={tmpl.id} type="button" className="px-3 py-2 hover:bg-zinc-50 text-left border rounded-lg text-[11px] font-bold text-zinc-700 transition-colors" onClick={() => {
                  const existingNumbers = formSections.filter(x => x.type.toLowerCase().startsWith(tmpl.baseType.toLowerCase())).map(x => { const match = x.type.match(/\d+/); return match ? parseInt(match[0], 10) : 0; });
                  const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
                  const blockTypeString = `${tmpl.baseType} ${nextNum}`;
                  setHasUnsavedChanges(true);
                  setFormSections([...formSections, { id: `sec-add-${Date.now()}-${Math.random()}`, type: blockTypeString, label: tmpl.display, content: "", repetitions: 1 }]);
                  setIsSectionSelectorOpen(false); setSectionSearchTerm("");
                }}>{tmpl.display}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PLAIN TEXT IMPORT PANEL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-md z-[11000] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-xl border shadow-2xl space-y-4 animate-in zoom-in-95">
            <h4 className="text-base font-black">Import Plain Text Lyrics</h4>
            <textarea rows={7} value={pastedRawLyricsText} placeholder="Paste plain track text format layout sections (e.g. [Verse 1] lines)..." className="w-full text-xs p-3 border bg-zinc-50/50 rounded-xl outline-none font-mono resize-none" onChange={e => setPastedRawLyricsText(e.target.value)} />
            <div className="grid grid-cols-2 gap-2"><button type="button" className="py-2.5 bg-zinc-100 text-zinc-700 text-xs font-black rounded-lg" onClick={() => setIsImportModalOpen(false)}>Cancel</button><button type="button" className="py-2.5 bg-blue-600 text-white text-xs font-black rounded-lg shadow-sm" onClick={executeRawLyricsImportAction}>Parse & Import</button></div>
          </div>
        </div>
      )}

      {/* TARGETED TRANSPOSITION SELECTOR PANEL */}
      {isKeyPopupOpen && (
        <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 animate-in fade-in duration-100 select-none">
          <form onSubmit={handleSaveModalKeySelection} className="bg-[#f8f9fa] border border-zinc-200 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-100 text-left">
            <div className="space-y-0.5">
              <h3 className="text-base font-black text-zinc-900 tracking-tight">Change Key</h3>
              <p className="text-[11px] font-black text-blue-500">Original {formKey}</p>
            </div>
            <div className="grid grid-cols-7 gap-1 bg-white p-1 rounded-xl border shadow-inner">
              {BASE_LETTER_ROOTS.map((letter) => {
                const isSelected = modalKeyRoot === letter;
                return <button key={letter} type="button" className={`aspect-square rounded-lg text-center text-xs font-black flex items-center justify-center cursor-pointer ${isSelected ? "bg-blue-600 text-white shadow-sm scale-105" : "bg-zinc-50/50 text-zinc-700 hover:bg-zinc-100"}`} onClick={() => setModalKeyRoot(letter)}>{letter}</button>;
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