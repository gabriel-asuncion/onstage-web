"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "../../../../utils/supabase/client";
import { useEngine } from "../../../context/EngineContext";
import { getSongChordChart } from "../../../../utils/supabase/actions";
import GlobalLoader from '../../../../components/GlobalLoader';

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

const Blob = ({ 
  color, w, hasEyes, animClass, delay, top, left, right, bottom 
}: { 
  color: string, w: string, hasEyes: boolean, animClass: string, delay: string, top?: string, left?: string, right?: string, bottom?: string 
}) => (
  <div className={`absolute z-0 opacity-70 ${animClass}`} style={{ animationDelay: delay, top, left, right, bottom, width: w }}>
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <path fill={color} d="M45.7,-76.3C58.9,-69.3,69.1,-55.3,77.5,-41.1C85.9,-26.9,92.5,-12.4,90.4,1.4C88.4,15.2,77.7,28.3,67.6,40.4C57.5,52.5,48,63.6,35.5,70.5C23,77.4,7.5,80.1,-6.9,78C-21.3,75.9,-34.5,69.1,-46.8,60.8C-59.1,52.5,-70.5,42.7,-78.6,30.3C-86.7,17.9,-91.5,2.9,-88.4,-10.8C-85.3,-24.5,-74.3,-36.9,-62,-46.1C-49.7,-55.3,-36.1,-61.3,-23.1,-68.2C-10.1,-75.1,2.3,-82.9,16.4,-82.6C30.5,-82.3,46,-73.9,45.7,-76.3Z" transform="translate(100 100)" />
      {hasEyes && (
        <><circle cx="85" cy="90" r="8" fill="white" className="animate-blink" /><circle cx="115" cy="90" r="8" fill="white" className="animate-blink" /></>
      )}
    </svg>
  </div>
);

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
    // ✅ SURGICAL ADDITION: Head and Tail padding measures
    head_m?: number;
    tail_m?: number;
  };
}
// ✅ SURGICAL REPLACEMENT: Dynamic Base Section Catalog
const SECTION_BASE_CATALOG = [
  { id: "V", display: "Verse", abbr: "V", color: "text-sky-500 border-sky-300 bg-sky-50" },
  { id: "PC", display: "Pre-Chorus", abbr: "PC", color: "text-orange-500 border-orange-300 bg-orange-50" },
  { id: "C",  display: "Chorus", abbr: "C", color: "text-orange-500 border-orange-300 bg-orange-50" },
  { id: "PoC", display: "Post-Chorus", abbr: "PoC", color: "text-orange-500 border-orange-300 bg-orange-50" },
  { id: "R",  display: "Refrain", abbr: "R", color: "text-orange-500 border-orange-300 bg-orange-50" },
  { id: "B",  display: "Bridge", abbr: "B", color: "text-blue-500 border-blue-300 bg-blue-50" },
  { id: "IN", display: "Intro", abbr: "IN", color: "text-emerald-500 border-emerald-300 bg-emerald-50" },
  { id: "I",  display: "Instrumental", abbr: "I", color: "text-emerald-500 border-emerald-300 bg-emerald-50" },
  { id: "IT", display: "Interlude", abbr: "IT", color: "text-emerald-500 border-emerald-300 bg-emerald-50" },
  { id: "O",  display: "Outro", abbr: "O", color: "text-purple-500 border-purple-300 bg-purple-50" },
  { id: "T",  display: "Tag", abbr: "T", color: "text-amber-500 border-amber-300 bg-amber-50" },
  { id: "AD", display: "Ad Lib", abbr: "AL", color: "text-rose-500 border-rose-300 bg-rose-50" }
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
  const { activeRole, simulatedUserId } = useEngine();

  // Primary Hydration States
  const [loading, setLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isConfirmExitModalOpen, setIsConfirmExitModalOpen] = useState(false);
  const [editorActiveTab, setEditorActiveTab] = useState<"details" | "content" | "structure">("details");

  // ✅ SURGICAL ADDITION: Save Engine States
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");

  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const lastScrollY = useRef(0);

  const handleCanvasScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    // 5px threshold prevents jittering
    if (currentScrollY > lastScrollY.current + 5) {
      setIsScrollingDown(true);
    } else if (currentScrollY < lastScrollY.current - 5) {
      setIsScrollingDown(false);
    }
    lastScrollY.current = currentScrollY;
  };
  
  const [formTitle, setFormTitle] = useState("");
  const [formTempo, setFormTempo] = useState("");

  // ✅ SURGICAL ADDITION: Tap BPM States
  const [isTapBpmModalOpen, setIsTapBpmModalOpen] = useState(false);
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);

  // Automatically clear the tap visualizer if inactive for 3 seconds
  useEffect(() => {
    if (tapTimestamps.length > 0) {
      const idleTimer = setTimeout(() => {
        setTapTimestamps([]);
      }, 3000);
      return () => clearTimeout(idleTimer);
    }
  }, [tapTimestamps]);

  const [formKey, setFormKey] = useState("G");
  const [formArtist, setFormArtist] = useState("");

  // ✅ SURGICAL ADDITION: Artist Database State & Filtering
  const [availableArtists, setAvailableArtists] = useState<string[]>([]);
  const filteredArtistSuggestions = availableArtists
    .filter(a => a.toLowerCase().includes(formArtist.toLowerCase()) && a.toLowerCase() !== formArtist.toLowerCase())
    .slice(0, 6); // Keep UI clean by limiting to 6 results

  const [formThemes, setFormThemes] = useState<string[]>([]);
  const [themeInputSearchValue, setThemeInputSearchValue] = useState("");
  const [isArtistDropdownFocused, setIsArtistDropdownFocused] = useState(false);
  const [isThemeDropdownFocused, setIsThemeDropdownFocused] = useState(false);
  const [formSections, setFormSections] = useState<SongSectionBlock[]>([]);
  const [sectionTimings, setSectionTimings] = useState<SectionTimingMap>({});
  const [lineOverrides, setLineOverrides] = useState<Record<string, Record<number, { measures: number; beats: number }>> | null>(null);
  
  const [isKeyPopupOpen, setIsKeyPopupOpen] = useState(false);
  const [modalKeyRoot, setModalKeyRoot] = useState("G");
  const [modalKeyAccidental, setModalKeyAccidental] = useState<"" | "#" | "b">("");

  const [isRealtimePreviewActive, setIsRealtimePreviewActive] = useState(false);

  // ✅ SURGICAL ADDITION: Unified Section Assignment Modal States
  const [sectionModalConfig, setSectionModalConfig] = useState<{ isOpen: boolean, mode: "add" | "reassign", targetId?: string }>({ isOpen: false, mode: "add" });
  const [sectionModalSearch, setSectionModalSearch] = useState("");
  const [sectionModalSelected, setSectionModalSelected] = useState<string | null>(null);

  // ✅ SURGICAL ADDITION: Computes the next available auto-incremented number for each section type
  const dynamicCatalogOptions = useMemo(() => {
    return SECTION_BASE_CATALOG.map(base => {
      // Find highest existing number for this exact base type in the current arrangement
      const regex = new RegExp(`^${base.display}\\s+(\\d+)$`, 'i');
      let maxNum = 0;
      formSections.forEach(sec => {
        const match = sec.type.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
      const nextName = `${base.display} ${maxNum + 1}`;
      return {
        ...base,
        computedId: nextName, // Uses "Verse 2" as the unique ID
        computedDisplay: nextName
      };
    });
  }, [formSections]);

  const handleSectionModalSubmit = () => {
    if (!sectionModalSelected) return;
    
    // Look up against our newly generated dynamic list instead of the static catalog
    const tmpl = dynamicCatalogOptions.find(x => x.computedId === sectionModalSelected);
    if (!tmpl) return;

    if (sectionModalConfig.mode === "add") {
      setHasUnsavedChanges(true);
      setFormSections([...formSections, { 
        id: `sec-add-${Date.now()}-${Math.random()}`, 
        type: tmpl.computedDisplay, 
        label: tmpl.computedDisplay, 
        content: "", 
        repetitions: 1 
      }]);
    } else if (sectionModalConfig.mode === "reassign" && sectionModalConfig.targetId) {
      setHasUnsavedChanges(true);
      setFormSections(formSections.map(item => 
        item.id === sectionModalConfig.targetId 
          ? { ...item, type: tmpl.computedDisplay, label: tmpl.computedDisplay } 
          : item
      ));
    }
    setSectionModalConfig({ isOpen: false, mode: "add" });
  };

  const [isAddChordsModeActive, setIsAddChordsModeActive] = useState(false);
  const [isAddNotesModeActive, setIsAddNotesModeActive] = useState(false); 
  const [chordTargetCoordinate, setChordTargetCoordinate] = useState<{ sectionType: string; lineIdx: number; wordIdx: number } | null>(null);
  const [notesTargetCoordinate, setNotesTargetCoordinate] = useState<{ sectionType: string; lineIdx: number } | null>(null); 

  const [selectedChordRoot, setSelectedChordRoot] = useState("G");
  const [customChordInputValue, setCustomChordInputValue] = useState("G");
  const [customCommentInputValue, setCustomCommentInputValue] = useState("");

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pastedRawLyricsText, setPastedRawLyricsText] = useState("");

  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  
  const [draggedStructureIndex, setDraggedStructureIndex] = useState<number | null>(null);
  const [dragOverStructureIndex, setDragOverStructureIndex] = useState<number | null>(null);

  // ✅ SURGICAL FIX: Standalone Artist Dictionary Fetcher (Runs even on brand new songs!)
  useEffect(() => {
    const fetchArtistDictionary = async () => {
      try {
        const { data } = await supabase.from("songs").select("artist").not("artist", "is", null);
        if (data) {
          const uniqueArtists = Array.from(new Set(data.map(s => s.artist.trim()))).filter(Boolean);
          setAvailableArtists(uniqueArtists as string[]);
        }
      } catch (err) {
        console.error("Failed to fetch artists", err);
      }
    };
    fetchArtistDictionary();
  }, [supabase]);

  // Data Hydration Stream
  useEffect(() => {
    const hydrateArrangementWorkspace = async () => {
      if (!editingSongId) return;
      
      // ✅ SURGICAL FIX: Prevent DB fetch crash if this is a brand new song
      if (editingSongId === "new") {
        setFormSections([{ id: "sec-1", type: "Verse 1", label: "Verse 1", content: "", repetitions: 1 }]);
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
      } catch (err) {
        console.error("Tracking hydration synced drop failure:", err);
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

  // ✅ SURGICAL FIX: Include head_m and tail_m in the tuple
  const getCentralizedMetricsTuple = (sectionType: string) => {
    const savedMetrics = sectionTimings[sectionType];
    return {
      measures: savedMetrics?.measures ?? 4,
      beats: savedMetrics?.beats ?? 0,
      repeats: savedMetrics?.repeats ?? 0,
      head_m: savedMetrics?.head_m ?? 0,
      tail_m: savedMetrics?.tail_m ?? 0
    };
  };

  const handleUpdateCentralizedMetrics = (sectionType: string, field: "measures" | "beats" | "repeats" | "head_m" | "tail_m", value: number) => {
    setHasUnsavedChanges(true);
    setSectionTimings(prev => {
      const currentTuple = prev[sectionType] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
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

    if (!formTitle.trim()) {
      alert("⚠️ Track Title is required before saving.");
      return;
    }

    // ✅ SURGICAL FIX: Lock the UI and trigger the save overlay
    setSaveStatus("saving");

    try {
      const updatedSectionTimings: Record<string, any> = {};
      formSections.forEach((sec) => {
        const metricsTuple = getCentralizedMetricsTuple(sec.type);
        const specificRowOverrides = lineOverrides?.[sec.type] || null;
        updatedSectionTimings[sec.type] = {
          measures: metricsTuple.measures,
          beats: metricsTuple.beats,
          repeats: metricsTuple.repeats,
          head_m: metricsTuple.head_m,  // 👈 Added here
          tail_m: metricsTuple.tail_m,  // 👈 Added here
          line_timings: specificRowOverrides 
        };
      });

      const compiledChordPro = formSections
        .map((sec) => `[${sec.type}]\n${sec.content || ""}`)
        .join("\n\n");

      let finalSongId = editingSongId;
      const isNewSong = editingSongId === "new";

      if (isNewSong) {
        const { data: { user } } = await supabase.auth.getUser();
        let currentTeamId = null;
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("team_id").eq("id", user.id).single();
          currentTeamId = profile?.team_id;
        }

        const insertPayload: any = {
          title: formTitle.trim(),
          artist: formArtist.trim() || "Unknown Artist",
          tempo: parseInt(formTempo, 10) || 75,
          original_key: formKey,
          themes: formThemes.join(", "),
          section_timings: updatedSectionTimings,
          chordpro_content: compiledChordPro
        };

        if (currentTeamId) insertPayload.team_id = currentTeamId;

        const { data: newSong, error: insertError } = await supabase.from("songs").insert(insertPayload).select("id").single();
        if (insertError) throw insertError;
        finalSongId = newSong.id; 

      } else {
        const { error: songUpdateError } = await supabase.from("songs").update({ 
            title: formTitle.trim(),
            artist: formArtist.trim() || "Unknown Artist",
            tempo: parseInt(formTempo, 10) || 75,
            original_key: formKey,
            themes: formThemes.join(", "),
            section_timings: updatedSectionTimings,
            chordpro_content: compiledChordPro 
          }).eq("id", finalSongId);
        if (songUpdateError) throw songUpdateError;

        const { error: deleteError } = await supabase.from("song_sections").delete().eq("song_id", finalSongId);
        if (deleteError) throw deleteError;
      }

      const sectionsToInsert = formSections.map((sec, index) => ({
        song_id: finalSongId,
        section_name: sec.type,
        content: sec.content || "",
        sequence_order: index
      }));

      if (sectionsToInsert.length > 0) {
        const { error: insertError } = await supabase.from("song_sections").insert(sectionsToInsert);
        if (insertError) throw insertError;
      }

      setHasUnsavedChanges(false);
      
      // ✅ SURGICAL FIX: Trigger Success Overlay
      setSaveStatus("success");
      
      // Keep the overlay up for 1.5s, then close it and stay on the page!
      setTimeout(() => {
        if (isNewSong) {
          // Soft-redirect to update the URL to the new ID, so further saves UPDATE instead of INSERT
          router.replace(`/songs/${finalSongId}/edit`);
        } else {
          setSaveStatus("idle");
        }
      }, 1500);

    } catch (err: any) {
      const errorMessage = err?.message || err?.details || err?.hint || JSON.stringify(err);
      console.error("FATAL DB ERROR DETAILS:", errorMessage, err);
      // ✅ SURGICAL FIX: Trigger Error Overlay
      setSaveErrorMessage(errorMessage);
      setSaveStatus("error");
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
  // const filteredEnclosurePopupCatalog = ENCLOSURE_POPUP_CATALOG.filter(item => item.display.toLowerCase().includes(sectionSearchTerm.toLowerCase()));
  const isChordInputBlank = customChordInputValue.trim() === ""; 
  const isCommentInputBlank = customCommentInputValue.trim() === "";

  if (loading) {
  return <GlobalLoader message="LOADING SONGS DETAILS..." />;
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
      <div 
        className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 custom-scrollbar space-y-3 w-full"
        onScroll={handleCanvasScroll}
      >
        {editorActiveTab === "details" && (
          <div className="w-full animate-in fade-in">
            <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-zinc-200 space-y-4 shadow-sm">
              <div><label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Track Title Signature *</label><input type="text" value={formTitle} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 outline-none" onChange={e => { setHasUnsavedChanges(true); setFormTitle(e.target.value); }} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* ✅ SURGICAL FIX: Upgraded BPM Input with Inline TAP Trigger */}
                <div>
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">BPM Tempo Count</label>
                  <div className="relative flex items-center">
                    <input 
                      type="number" 
                      value={formTempo} 
                      className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs outline-none pr-16 bg-zinc-50/50" 
                      onChange={e => { setHasUnsavedChanges(true); setFormTempo(e.target.value); }} 
                    />
                    <button 
                      type="button" 
                      onClick={() => { setTapTimestamps([]); setIsTapBpmModalOpen(true); }} 
                      className="absolute right-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm"
                    >
                      TAP
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Original Target Key Signature *</label>
                  <button type="button" onClick={() => handleOpenKeySelectionPopup()} className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 text-left flex justify-between items-center outline-none">
                    <span>{formKey ? `Key of ${formKey}` : "Select Key"}</span>
                    <span className="text-[10px] text-zinc-400">▼</span>
                  </button>
                </div>
              </div>
              
              {/* ✅ SURGICAL FIX: Artist Input with Auto-Suggest Dropdown */}
              <div className="relative">
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Artist / Author Label Signature *</label>
                <input 
                  type="text" 
                  value={formArtist} 
                  onFocus={() => setIsArtistDropdownFocused(true)}
                  onBlur={() => setTimeout(() => setIsArtistDropdownFocused(false), 200)}
                  onChange={e => { setHasUnsavedChanges(true); setFormArtist(e.target.value); }} 
                  className="w-full border border-zinc-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-zinc-800 bg-zinc-50/50 outline-none transition-all" 
                  placeholder="e.g. Hillsong Worship"
                />
                {isArtistDropdownFocused && filteredArtistSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl max-h-36 overflow-y-auto z-[3000] shadow-xl custom-scrollbar">
                    {filteredArtistSuggestions.map(artist => (
                      <button 
                        key={artist} 
                        type="button" 
                        className="w-full px-3 py-2 text-left text-xs font-bold block border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors text-zinc-700" 
                        onClick={() => { 
                          setHasUnsavedChanges(true); 
                          setFormArtist(artist); 
                        }}
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
                const totalManualAbsoluteBeats = (totalManualLineMeasures * 4) + totalManualLineBeats + (timingTuple.head_m * 4) + (timingTuple.tail_m * 4);
                const isSectionMismatched = totalLines > 0 && totalManualAbsoluteBeats !== masterTotalAbsoluteBeats;

                const handleAdjustLineMetricValue = (lineIdx: number, field: "measures" | "beats", delta: number) => {
                  const currentVal = currentLinesMetrics[lineIdx][field];
                  const proposedVal = Math.max(0, currentVal + delta);

                  if (field === "beats" && proposedVal > 3) return;
                  
                  // ✅ SURGICAL FIX: Removed the `projectedAbsoluteBeats > masterTotalAbsoluteBeats` hard-block!
                  // It was causing a deadlock when Head/Tail values pushed the section over the limit.
                  // Now, the user can freely adjust the steppers to "dig out" of the deficit, 
                  // safely guided by the yellow warning banner and locked save button.

                  setHasUnsavedChanges(true);
                  setLineOverrides(prev => {
                    const prevOverrides = prev || {};
                    // Execute a true DEEP COPY to prevent React state poisoning
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
                          <button 
                            type="button" 
                            className="px-2.5 py-1 bg-cyan-100 hover:bg-cyan-200 text-cyan-800 font-black text-[10px] rounded-full uppercase tracking-wider block shadow-sm flex items-center gap-1 transition-colors" 
                            onClick={() => {
                              setSectionModalSearch("");
                              setSectionModalSelected(null);
                              setSectionModalConfig({ isOpen: true, mode: "reassign", targetId: sec.id });
                            }}
                          >
                            <span>{sec.type}</span>
                            <span className="text-[8px] opacity-60">▼</span>
                          </button>
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
                        
                        {/* ✅ SURGICAL ADDITION: Head (H) and Tail (T) Measure Inputs */}
                        <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                          <span className="text-[8px] font-black uppercase text-zinc-400" title="Head Padding (Added before first loop)">H:</span>
                          <input type="number" min={0} value={timingTuple.head_m} className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "head_m", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
                        </div>
                        <div className="flex items-center gap-1 bg-zinc-50 border rounded-lg px-2 py-0.5 text-[10px] font-bold text-zinc-600 shadow-inner">
                          <span className="text-[8px] font-black uppercase text-zinc-400" title="Tail Padding (Added after last loop)">T:</span>
                          <input type="number" min={0} value={timingTuple.tail_m} className="w-5 bg-transparent text-center font-black text-zinc-800 outline-none" onChange={(e) => { handleUpdateCentralizedMetrics(sec.type, "tail_m", Math.max(0, parseInt(e.target.value, 10) || 0)); setLineOverrides(prev => { if (!prev) return {}; const newPrev = { ...prev }; delete newPrev[sec.type]; return newPrev; }); }} />
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

                                {/* ✅ SURGICAL REPLACEMENT: Touch-friendly Horizontal Steppers */}
                                <div className="flex items-center gap-2 shrink-0 select-none">
                                  
                                  {/* Measures (M) Stepper */}
                                  <div className="flex items-center bg-white border border-zinc-200 rounded-lg shadow-sm h-7 overflow-hidden transition-colors focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
                                    <div className="px-1.5 text-[9px] font-black text-zinc-400 bg-zinc-50/80 border-r border-zinc-200/60 flex items-center h-full cursor-help" title="Measures">
                                      M
                                    </div>
                                    <button 
                                      type="button" 
                                      onClick={() => handleAdjustLineMetricValue(lineIdx, "measures", -1)} 
                                      className="w-6 h-full flex items-center justify-center text-zinc-400 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 12h14"/></svg>
                                    </button>
                                    <span className="w-5 text-center text-[11px] font-black text-zinc-800">
                                      {lineMetrics.measures}
                                    </span>
                                    <button 
                                      type="button" 
                                      onClick={() => handleAdjustLineMetricValue(lineIdx, "measures", 1)} 
                                      className="w-6 h-full flex items-center justify-center text-zinc-400 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors border-l border-transparent"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                                    </button>
                                  </div>

                                  {/* Beats (B) Stepper */}
                                  <div className="flex items-center bg-white border border-zinc-200 rounded-lg shadow-sm h-7 overflow-hidden transition-colors focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
                                    <div className="px-1.5 text-[9px] font-black text-zinc-400 bg-zinc-50/80 border-r border-zinc-200/60 flex items-center h-full cursor-help" title="Beats">
                                      B
                                    </div>
                                    <button 
                                      type="button" 
                                      onClick={() => handleAdjustLineMetricValue(lineIdx, "beats", -1)} 
                                      className="w-6 h-full flex items-center justify-center text-zinc-400 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 12h14"/></svg>
                                    </button>
                                    <span className="w-4 text-center text-[11px] font-black text-zinc-800">
                                      {lineMetrics.beats}
                                    </span>
                                    <button 
                                      type="button" 
                                      onClick={() => handleAdjustLineMetricValue(lineIdx, "beats", 1)} 
                                      className="w-6 h-full flex items-center justify-center text-zinc-400 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors border-l border-transparent"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                                    </button>
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
              <button 
                type="button" 
                className="w-full border border-dashed py-3.5 text-center rounded-2xl text-blue-600 font-black text-xs uppercase tracking-wider block hover:bg-zinc-50 transition-colors shadow-sm bg-white" 
                onClick={() => {
                  setSectionModalSearch("");
                  setSectionModalSelected(null);
                  setSectionModalConfig({ isOpen: true, mode: "add" });
                }}
              >
                ＋ Add New Section Enclosures
              </button>
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

      {/* ======================================================= */}
      {/* ✅ SURGICAL FIX: SMART-DOCKING FLOATING BOTTOM DECK       */}
      {/* ======================================================= */}
      <div 
        className={`fixed left-0 right-0 z-[100] px-4 md:px-8 transition-all duration-300 ease-out flex justify-center pointer-events-none ${
          hasUnsavedChanges || (editorActiveTab === "content" && (isAddChordsModeActive || isAddNotesModeActive))
            ? (isScrollingDown ? "bottom-6 opacity-100" : "bottom-[85px] opacity-100") // 85px clears the global bottom nav
            : "-bottom-24 opacity-0"
        }`}
      >
        <div className="bg-white/95 backdrop-blur-md border border-zinc-200/80 shadow-[0_12px_40px_rgb(0,0,0,0.12)] p-2 md:p-2.5 rounded-2xl flex items-center justify-between w-full max-w-4xl pointer-events-auto">
          
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
                className="px-4 py-2.5 rounded-xl bg-red-50/80 text-red-600 font-black text-[10px] uppercase border border-red-200 hover:bg-red-100 transition-all cursor-pointer flex items-center gap-1.5"
                onClick={async () => {
                  if (confirm("Are you sure you want to delete this arrangement permanently?")) {
                    setLoading(true);
                    const { error } = await supabase.from("songs").delete().eq("id", editingSongId);
                    if (!error) router.push("/songs");
                    else setLoading(false);
                  }
                }} 
              >
                <span className="text-sm">🗑️</span> Delete Song
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

              // ✅ SURGICAL FIX: Add Head and Tail to the bottom validation check
              const calculatedBeatsSum = (checkLines.reduce((sum, _, lineIndex) => {
                const lineOverride = (lineOverrides as any)?.[checkSec.type]?.[lineIndex];
                const measures = lineOverride?.measures ?? (checkSpreadMeasures + (lineIndex < checkRemainderMeasures ? 1 : 0));
                const beats = lineOverride?.beats ?? (checkSpreadBeats + (lineIndex < checkRemainderBeats ? 1 : 0));
                return sum + (measures * 4) + beats;
              }, 0) * totalCheckPasses) + (checkTuple.head_m * 4) + (checkTuple.tail_m * 4);

              return calculatedBeatsSum !== targetAbsoluteBeats;
            });

            const isSaveDisabled = isRealtimePreviewActive && isAnySectionMismatchedAcrossModal;

            return (
              <div className="shrink-0">
                {(activeRole === "admin" || activeRole === "member") && (
                  <button 
                    type="button" 
                    disabled={isSaveDisabled}
                    className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all ${
                      isSaveDisabled 
                        ? "bg-zinc-100 text-zinc-400 border border-zinc-200 shadow-none cursor-not-allowed opacity-80" 
                        : "bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-[0.97] cursor-pointer"
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

      {/* ======================================================= */}
      {/* ✅ SURGICAL ADDITION: NATIVE SECTION ASSIGNMENT MODAL     */}
      {/* ======================================================= */}
      {sectionModalConfig.isOpen && (
        <div className="fixed inset-0 z-[12000] flex items-end md:items-center justify-center md:p-4 bg-zinc-950/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full bg-[#f2f2f6] md:bg-white rounded-t-3xl md:rounded-3xl h-[85vh] md:h-[600px] max-w-lg flex flex-col shadow-2xl animate-in slide-in-from-bottom-full md:slide-in-from-bottom-0 md:zoom-in-95 duration-200 overflow-hidden">
            
            {/* Header */}
            <div className="relative flex items-center justify-center p-4 md:p-5 border-b border-zinc-200/60 bg-white shrink-0">
              <button 
                type="button" 
                onClick={() => setSectionModalConfig({ isOpen: false, mode: "add" })} 
                className="absolute left-4 md:left-auto md:right-4 w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <h3 className="text-base font-black text-zinc-900 tracking-tight">
                {sectionModalConfig.mode === "add" ? "Add New Sections" : "Reassign Section"}
              </h3>
            </div>

            {/* Sticky Search Bar */}
            <div className="p-4 bg-[#f2f2f6] md:bg-white shrink-0">
              <div className="relative flex items-center w-full">
                <svg className="absolute left-3 w-4 h-4 text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                <input 
                  type="text" 
                  placeholder="Search for a new section" 
                  value={sectionModalSearch}
                  onChange={e => setSectionModalSearch(e.target.value)}
                  className="w-full bg-zinc-200/50 md:bg-zinc-100/80 rounded-xl py-2.5 pl-9 pr-4 text-[13px] font-bold text-zinc-800 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
              </div>
            </div>

            {/* Scrollable Radio List */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5 custom-scrollbar bg-[#f2f2f6] md:bg-white">
              {/* ✅ SURGICAL FIX: Map the dynamically numbered options! */}
              {dynamicCatalogOptions.filter(tmpl => tmpl.computedDisplay.toLowerCase().includes(sectionModalSearch.toLowerCase())).map(tmpl => {
                const isSelected = sectionModalSelected === tmpl.computedId;
                return (
                  <button 
                    key={tmpl.computedId} 
                    type="button" 
                    onClick={() => setSectionModalSelected(tmpl.computedId)}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all ${isSelected ? "bg-white ring-2 ring-blue-500 shadow-sm" : "bg-white hover:bg-zinc-50/80 border border-transparent shadow-sm md:border-zinc-200/60"}`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${tmpl.color}`}>
                        {tmpl.abbr}
                      </div>
                      <span className="text-[14px] font-bold text-zinc-900 tracking-tight">{tmpl.computedDisplay}</span>
                    </div>
                    
                    {/* Native iOS style Radio indicator */}
                    <div className={`w-5 h-5 rounded-full border-[2.5px] flex items-center justify-center transition-colors ${isSelected ? "border-blue-500" : "border-zinc-300"}`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Sticky Action Footer */}
            <div className="p-4 bg-[#f2f2f6] md:bg-white border-t border-zinc-200/50 shrink-0 pb-safe">
              <button 
                type="button" 
                disabled={!sectionModalSelected}
                onClick={handleSectionModalSubmit}
                className={`w-full py-3.5 rounded-xl text-[14px] font-black tracking-wide transition-all ${sectionModalSelected ? "bg-zinc-900 text-white shadow-md active:scale-[0.98]" : "bg-zinc-300 text-zinc-500 cursor-not-allowed"}`}
              >
                {sectionModalConfig.mode === "add" ? "Add" : "Select"}
              </button>
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
      {/* ======================================================= */}
      {/* ✅ SURGICAL ADDITION: TAP TEMPO CALCULATOR MODAL          */}
      {/* ======================================================= */}
      {isTapBpmModalOpen && (
        <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 animate-in fade-in duration-100 select-none">
          <div className="bg-[#f8f9fa] border border-zinc-200 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-6 animate-in zoom-in-95 duration-100 text-center">
            
            <div className="space-y-1">
              <h3 className="text-xl font-black text-zinc-900 tracking-tight">Tap Tempo</h3>
              <p className="text-[11px] font-bold text-zinc-500">Tap the button to the beat to calculate the exact BPM.</p>
            </div>
            
            {/* Visualizer Display */}
            {/* ✅ SURGICAL FIX: Click-to-reset, grouped Flexbox wrapping, and idle support */}
            <div 
              onClick={() => setTapTimestamps([])}
              title="Click to reset taps"
              className="bg-white border rounded-xl p-4 shadow-inner h-28 w-full flex items-center justify-center overflow-hidden cursor-pointer hover:bg-zinc-50 transition-colors relative group"
            >
              {/* Subtle hover icon to indicate it's clickable to reset */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none">
                 <span className="text-6xl font-black">↺</span>
              </div>

              {tapTimestamps.length === 0 ? (
                <span className="text-zinc-400 text-sm font-bold italic relative z-10">Start tapping...</span>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-y-2 gap-x-4 md:gap-x-5 animate-in fade-in duration-75 w-full relative z-10">
                  {/* Group timestamps into chunks of 4 so they never break across lines */}
                  {Array.from({ length: Math.ceil(Math.min(tapTimestamps.length, 48) / 4) }).map((_, groupIdx) => {
                    const totalTaps = Math.min(tapTimestamps.length, 48);
                    const starsInGroup = Math.min(4, totalTaps - groupIdx * 4);
                    
                    let tapSizeClass = "text-4xl";
                    if (totalTaps > 36) tapSizeClass = "text-xl";
                    else if (totalTaps > 24) tapSizeClass = "text-2xl";
                    else if (totalTaps > 12) tapSizeClass = "text-3xl";

                    return (
                      <div key={groupIdx} className="flex gap-1.5 flex-nowrap shrink-0">
                        {Array.from({ length: starsInGroup }).map((_, starIdx) => (
                          <span key={starIdx} className={`text-blue-600 font-black leading-none transition-all duration-200 ${tapSizeClass}`}>
                            *
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Live Readout */}
            <div className="text-5xl font-black text-zinc-900 tracking-tighter">
              {formTempo || "--"} <span className="text-sm font-bold text-zinc-400 tracking-normal">BPM</span>
            </div>

            {/* The Giant Tap Target */}
            <button 
              type="button" 
              onClick={(e) => {
                e.preventDefault();
                const now = Date.now();
                setTapTimestamps(prev => {
                  // If it's been more than 2.5 seconds since the last tap, clear the array and start over
                  if (prev.length > 0 && now - prev[prev.length - 1] > 2500) {
                    return [now];
                  }
                  
                  const newTaps = [...prev, now];
                  
                  // Need at least 2 taps to calculate an interval
                  if (newTaps.length >= 2) {
                    const intervals = [];
                    for (let i = 1; i < newTaps.length; i++) {
                      intervals.push(newTaps[i] - newTaps[i - 1]);
                    }
                    // Calculate the rolling average of intervals
                    const averageInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
                    const calculatedBpm = Math.round(60000 / averageInterval);
                    
                    setFormTempo(calculatedBpm.toString());
                    setHasUnsavedChanges(true);
                  }
                  return newTaps;
                });
              }} 
              className="w-full h-32 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-3xl uppercase tracking-widest rounded-3xl shadow-[0_8px_30px_rgb(37,99,235,0.3)] active:scale-[0.96] active:shadow-md transition-all select-none flex items-center justify-center"
            >
              TAP
            </button>

            {/* Exit Control */}
            <button 
              type="button" 
              onClick={() => setIsTapBpmModalOpen(false)} 
              className="w-full py-3.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-black text-[11px] uppercase tracking-widest rounded-xl transition-colors shadow-sm"
            >
              Confirm & Close
            </button>
            
          </div>
        </div>
      )}
      {/* ======================================================= */}
      {/* ✅ SURGICAL ADDITION: SAVE ENGINE OVERLAY                 */}
      {/* ======================================================= */}
      {saveStatus !== "idle" && (
        <div className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm z-[300000] flex items-center justify-center p-4 select-none">
          
          {/* Keyframes for the blobs */}
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes dart-x { 0%, 100% { transform: translateX(0) scale(1); } 2%, 6% { transform: translateX(30px) scale(0.9, 1.1) rotate(5deg); } 8%, 50% { transform: translateX(30px) scale(1) rotate(5deg); } 52%, 56% { transform: translateX(-15px) scale(1.1, 0.9) rotate(-2deg); } 58%, 95% { transform: translateX(-15px) scale(1) rotate(-2deg); } }
            @keyframes morph-squish { 0%, 100% { transform: scale(1) rotate(0deg); } 25% { transform: scale(1.2, 0.8) rotate(10deg); } 50% { transform: scale(0.9, 1.15) rotate(-5deg); } 75% { transform: scale(1.05, 0.95) rotate(15deg); } }
            @keyframes float-spin { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-20px) rotate(180deg); } }
            @keyframes pulse-ghost { 0%, 100% { transform: scale(1); opacity: 0.7; } 30% { transform: scale(1.6); opacity: 0.1; } 40% { transform: scale(0.8); opacity: 0.9; } }
            @keyframes blink { 0%, 96%, 100% { transform: scaleY(1); opacity: 1; } 98% { transform: scaleY(0.1); opacity: 0; } }
            
            .animate-dart-x { animation: dart-x 7s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
            .animate-morph-squish { animation: morph-squish 5s ease-in-out infinite; }
            .animate-float-spin { animation: float-spin 19s ease-in-out infinite; }
            .animate-pulse-ghost { animation: pulse-ghost 7s ease-in-out infinite; }
            .animate-blink { animation: blink 4s infinite; transform-origin: center; }
          `}} />

          {/* Dynamic Background Blobs based on State */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {saveStatus === "saving" && (
              <>
                <Blob color="#3B82F6" w="100px" hasEyes animClass="animate-dart-x" delay="0s" top="20%" left="30%" />
                <Blob color="#60A5FA" w="60px" hasEyes={false} animClass="animate-float-spin" delay="-2s" bottom="30%" right="25%" />
              </>
            )}
            {saveStatus === "success" && (
              <>
                <Blob color="#10B981" w="110px" hasEyes animClass="animate-morph-squish" delay="0s" top="30%" right="30%" />
                <Blob color="#34D399" w="50px" hasEyes={false} animClass="animate-pulse-ghost" delay="-1s" bottom="20%" left="20%" />
              </>
            )}
            {saveStatus === "error" && (
              <>
                <Blob color="#EF4444" w="90px" hasEyes animClass="animate-dart-x" delay="0s" bottom="25%" left="25%" />
                <Blob color="#F87171" w="70px" hasEyes={false} animClass="animate-float-spin" delay="-3s" top="20%" right="20%" />
              </>
            )}
          </div>

          {/* The Modal Card */}
          <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full relative z-10 text-center animate-in zoom-in-95 duration-200">
            
            {saveStatus === "saving" && (
              <>
                <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-6 shadow-sm" />
                <h3 className="text-xl font-black tracking-tight text-zinc-900">Saving Matrix...</h3>
                <p className="text-[13px] font-bold text-zinc-500 mt-2">Writing arrangement to secure database.</p>
              </>
            )}

            {saveStatus === "success" && (
              <div className="animate-in slide-in-from-bottom-2 duration-300">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6 shadow-sm border border-green-200">
                  <span className="font-black">✓</span>
                </div>
                <h3 className="text-xl font-black tracking-tight text-zinc-900">Saved Successfully</h3>
                <p className="text-[13px] font-bold text-zinc-500 mt-2">Your changes have been safely logged.</p>
              </div>
            )}

            {saveStatus === "error" && (
              <div className="animate-in slide-in-from-bottom-2 duration-300">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6 shadow-sm border border-red-200">
                  <span className="font-black">✕</span>
                </div>
                <h3 className="text-xl font-black tracking-tight text-zinc-900">Save Failed</h3>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 mt-4 mb-6">
                  <p className="text-[11px] font-bold text-red-600 font-mono break-words">{saveErrorMessage}</p>
                </div>
                <button 
                  onClick={() => setSaveStatus("idle")} 
                  className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-colors active:scale-95 shadow-md"
                >
                  Close & Try Again
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
    
  );
}