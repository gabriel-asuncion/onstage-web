import { useEffect } from "react";
import { SongRecord, ArrangementSection, CompiledBeatMap, CompiledSectionToken } from "../types/setlist";

export interface HardwareClockConfig {
  isPlayingFlow: boolean;
  isPlayingRef: React.MutableRefObject<boolean>;
  activeSongRef: React.MutableRefObject<SongRecord | null>;
  playingSongRef: React.MutableRefObject<SongRecord | null>;
  sectionsRef: React.MutableRefObject<ArrangementSection[]>;
  playingSectionsRef: React.MutableRefObject<ArrangementSection[]>;
  currentSectionIndexRef: React.MutableRefObject<number>;
  setCurrentSectionIndex: (idx: number) => void;
  beatMapRef: React.MutableRefObject<CompiledBeatMap>;
  astTreeRef: React.MutableRefObject<CompiledSectionToken[]>;
  mdSectionStartTimeRef: React.MutableRefObject<number | null>;
  audioLatencyOffsetMs: number;
  isYtBackingTrackStartRef: React.MutableRefObject<boolean>;
  countdownValueRef: React.MutableRefObject<number | null>;
  setCountdownValue: (val: number | null) => void;
  backdropProgressRef: React.MutableRefObject<HTMLDivElement | null>;
  accentProgressBarRef: React.MutableRefObject<HTMLDivElement | null>;
  simplifiedProgressBarRef: React.MutableRefObject<HTMLDivElement | null>;
  hasPlayedCueRef: React.MutableRefObject<boolean>;
  playGuideCue: (name: string) => void;
  queuedSectionIndexRef: React.MutableRefObject<number | null>;
  queuedTrackIndexRef: React.MutableRefObject<number | null>;
  audioContextStartTimeRef: React.MutableRefObject<number | null>;
  getAudioContext: () => AudioContext | null;
  triggerMetronomeSound: (beat: number, time: number) => void;
  isDoubleMetronomeEnabledRef: React.MutableRefObject<boolean>;
  lastAudioBeatRef: React.MutableRefObject<number>;
  lastVisualBeatRef: React.MutableRefObject<number>;
  lastBeatRef: React.MutableRefObject<number>;
  lastVisualMeasureLengthRef: React.MutableRefObject<number>;
  setCurrentMeasureLength: (len: number) => void;
  pendingQuantizedJumpRef: React.MutableRefObject<any>;
  getGlobalTime: () => number;
  executeJumpNow: (trackIdx: number, secIdx: number, time: number, isInitialStart?: boolean) => void;
  localPresenceUserRef: React.MutableRefObject<any>;
  broadcastRef: React.MutableRefObject<(payload: any) => void>; // ✅ FULL FIX: Converted to Ref
  updateMetronomeUI: (beat: number, isPlaying: boolean, measureLength?: number) => void;
  activeLineIndexRef: React.MutableRefObject<number>;
  setActiveLineIndex: (idx: number) => void;
  handleAdvanceToNextSetlistTrack: () => void;
  sectionStartTimeRef: React.MutableRefObject<number>;
  pauseOffsetMsRef: React.MutableRefObject<number>;
  animationFrameRef: React.MutableRefObject<number | null>;
  playingTrackIndexRef: React.MutableRefObject<number>;
}

export function useHardwareClock(config: HardwareClockConfig) {
  useEffect(() => {
    if (!config.isPlayingFlow || !config.activeSongRef.current || config.sectionsRef.current.length === 0) {
      if (config.animationFrameRef.current) cancelAnimationFrame(config.animationFrameRef.current);
      return;
    }

    if (config.pauseOffsetMsRef.current > 0) config.sectionStartTimeRef.current = performance.now() - config.pauseOffsetMsRef.current;
    else config.sectionStartTimeRef.current = performance.now();
    
    config.lastBeatRef.current = 0; 

    const clockExecutionTick = (timestamp: number) => {
      if (!config.isPlayingRef.current || !config.activeSongRef.current || config.sectionsRef.current.length === 0) return;
      
      if (config.pendingQuantizedJumpRef.current) {
        const { trackIndex, sectionIndex, jumpTime } = config.pendingQuantizedJumpRef.current;
        if (config.getGlobalTime() >= jumpTime) config.executeJumpNow(trackIndex, sectionIndex, jumpTime);
      }
      
      const isCurrentlyMD = config.localPresenceUserRef.current?.isMD === true;
      const song = config.playingSongRef.current || config.activeSongRef.current; 
      const secs = config.playingSectionsRef.current;
      const idx = config.currentSectionIndexRef.current;
      const currentSection = secs[idx];
      
      if (!currentSection) { config.handleAdvanceToNextSetlistTrack(); return; }

      const beatSpeedMsCurrent = (60 / (song.tempo || 75)) * 1000;
      const timings = song.section_timings?.[currentSection.section_name] || { measures: 4, beats: 0, repeats: 0, head_m: 0, tail_m: 0 };
      const sectionMultiplier = (timings.repeats || 0) + 1; 
      const headBeats = (timings.head_m || 0) * 4;
      const tailBeats = (timings.tail_m || 0) * 4;
      
      let totalCoreBeats = ((timings.measures || 0) * 4) + (timings.beats || 0);
      let baseLoopBeats = totalCoreBeats / sectionMultiplier;

      const lineTimingsObj = timings.line_timings;
      const currentAstNode = config.astTreeRef.current[idx];
      const parsedLinesCount = currentAstNode?.lines?.length || 1; 

      let calculatedBaseLoopBeats = 0;
      const lineBeatsArray: number[] = [];
      
      if (lineTimingsObj && Object.keys(lineTimingsObj).length > 0) {
        for (let i = 0; i < parsedLinesCount; i++) {
          const t = lineTimingsObj[String(i)] || { measures: 0, beats: 0 };
          const lineMult = (t.repeats || 0) + 1; 
          const base = ((t.measures * 4) + (t.beats || 0)) * lineMult; 
          lineBeatsArray.push(base);
          calculatedBaseLoopBeats += base;
        }
        if (calculatedBaseLoopBeats > 0) {
          baseLoopBeats = calculatedBaseLoopBeats;
          totalCoreBeats = baseLoopBeats * sectionMultiplier; 
        }
      }

      let totalBeats = totalCoreBeats + headBeats + tailBeats;
      const totalDurationMs = totalBeats * beatSpeedMsCurrent;
      
      if (!config.mdSectionStartTimeRef.current || isNaN(config.mdSectionStartTimeRef.current)) {
        config.animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
        return; 
      }

      let elapsedMs = config.getGlobalTime() - config.mdSectionStartTimeRef.current;
      
      if (elapsedMs < -500 && !config.isYtBackingTrackStartRef.current) {
        const secondsLeft = Math.ceil(Math.abs(elapsedMs) / 1000);
        if (secondsLeft <= 3 && secondsLeft > 0) {
          if (config.countdownValueRef.current !== secondsLeft) {
            config.countdownValueRef.current = secondsLeft;
            config.setCountdownValue(secondsLeft);
          }
        }
        config.animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
        return; 
      } else if (elapsedMs < 0) {
        if (config.countdownValueRef.current !== null) { config.countdownValueRef.current = null; config.setCountdownValue(null); }
        config.animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
        return;
      } else {
        if (config.countdownValueRef.current !== null) { config.countdownValueRef.current = null; config.setCountdownValue(null); }
      }
      
      const visualElapsedMs = Math.max(0, elapsedMs);
      
      const progressRatio = Math.min(1, visualElapsedMs / totalDurationMs);
      if (config.backdropProgressRef.current) config.backdropProgressRef.current.style.transform = `scaleX(${progressRatio})`;
      if (config.accentProgressBarRef.current) config.accentProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;
      if (config.simplifiedProgressBarRef.current) config.simplifiedProgressBarRef.current.style.transform = `scaleX(${progressRatio})`;

      const msRemaining = totalDurationMs - visualElapsedMs;
      const fourBeatsMs = beatSpeedMsCurrent * 4;

      if (!config.hasPlayedCueRef.current && msRemaining > 0 && msRemaining <= fourBeatsMs) {
        config.hasPlayedCueRef.current = true; 
        const nextSecIndex = (config.queuedSectionIndexRef.current !== null) ? config.queuedSectionIndexRef.current : idx + 1;
        const targetSec = secs[nextSecIndex];
        if (targetSec) config.playGuideCue(targetSec.section_name);
      }

      const audioCtx = config.getAudioContext();
      if (config.audioContextStartTimeRef.current !== null && audioCtx) {
        const lookaheadSecs = 0.200;
        const beatSpeedSecs = beatSpeedMsCurrent / 1000;
        const currentAudioTime = audioCtx.currentTime;
        
        const audioOffsetSecs = -(config.audioLatencyOffsetMs / 1000); 

        let nextBeatTime = config.audioContextStartTimeRef.current + (config.lastAudioBeatRef.current * beatSpeedSecs);
        
        while (nextBeatTime < currentAudioTime + lookaheadSecs) {
          const absoluteBeatIndex = config.lastAudioBeatRef.current;
          const mapNodes = config.beatMapRef.current.nodes;
          if (config.pendingQuantizedJumpRef.current) {
            const timeUntilBeatSecs = nextBeatTime - currentAudioTime;
            const exactGlobalBeatTime = config.getGlobalTime() + (timeUntilBeatSecs * 1000);
            if (exactGlobalBeatTime >= config.pendingQuantizedJumpRef.current.jumpTime - 10) break; 
          }
          if (absoluteBeatIndex < mapNodes.length) {
            const beatNode = mapNodes[absoluteBeatIndex];
            config.triggerMetronomeSound(beatNode.isDownbeat ? 1 : 2, nextBeatTime + audioOffsetSecs);
            if (config.isDoubleMetronomeEnabledRef.current) {
              config.triggerMetronomeSound(2, nextBeatTime + audioOffsetSecs + (beatSpeedSecs / 2));
            }
          }
          config.lastAudioBeatRef.current++;
          nextBeatTime = config.audioContextStartTimeRef.current + (config.lastAudioBeatRef.current * beatSpeedSecs);
        }
        
        if (isCurrentlyMD && config.lastAudioBeatRef.current > 0 && config.lastAudioBeatRef.current % 16 === 0) {
          if ((window as any)._lastHeartbeatBeat !== config.lastAudioBeatRef.current) {
            (window as any)._lastHeartbeatBeat = config.lastAudioBeatRef.current;
            
            const sectionStartBeat = config.beatMapRef.current.sectionStartBeats[config.currentSectionIndexRef.current] || 0;
            const localBeatCount = config.lastAudioBeatRef.current - sectionStartBeat;
            const exactGlobalBeatTime = config.mdSectionStartTimeRef.current + (localBeatCount * beatSpeedSecs * 1000);
            
            // ✅ FULL FIX: Triggers via Ref to bypass stale closure!
            config.broadcastRef.current({ 
                action: "HEARTBEAT", 
                mdAbsoluteBeat: config.lastAudioBeatRef.current, 
                mdGlobalBeatTime: exactGlobalBeatTime,
                mdSectionIndex: config.currentSectionIndexRef.current 
            });
          }
        }
      }

      const localSectionElapsedBeats = visualElapsedMs / beatSpeedMsCurrent;
      const absoluteVisualBeatFloat = (config.beatMapRef.current.sectionStartBeats[idx] || 0) + localSectionElapsedBeats;
      const absoluteVisualBeatIndex = Math.floor(absoluteVisualBeatFloat);

      if (absoluteVisualBeatIndex < config.beatMapRef.current.nodes.length) {
        const beatNode = config.beatMapRef.current.nodes[absoluteVisualBeatIndex];
        const currentVisualBeatPulse = beatNode.measureBeatIndex;
        const activeMeasureLength = beatNode.measureLength;
        if (activeMeasureLength !== config.lastVisualMeasureLengthRef.current) {
          config.lastVisualMeasureLengthRef.current = activeMeasureLength;
          config.setCurrentMeasureLength(activeMeasureLength);
        }
        if (currentVisualBeatPulse !== config.lastVisualBeatRef.current) {
          config.lastVisualBeatRef.current = currentVisualBeatPulse;
          config.updateMetronomeUI(currentVisualBeatPulse, true, activeMeasureLength); 
        }
      }

      const safeDuration = Math.max(1, totalDurationMs);
      const cappedElapsedMs = Math.max(0, Math.min(elapsedMs, safeDuration - 1));
      const sectionAbsoluteBeat = Math.floor(cappedElapsedMs / beatSpeedMsCurrent);
      const coreAbsoluteBeat = Math.max(0, sectionAbsoluteBeat - headBeats);
      
      const cappedCoreBeat = Math.min(coreAbsoluteBeat, Math.max(0, totalCoreBeats - 1));

      const safeBaseLoopBeats = Math.max(1, baseLoopBeats); 
      
      let targetLineIdx = 0;
      if (calculatedBaseLoopBeats > 0 && lineBeatsArray.length > 0) { 
        const beatWithinCurrentLoop = cappedCoreBeat % safeBaseLoopBeats;
        let beatAccumulator = 0;
        for (let i = 0; i < parsedLinesCount; i++) {
          beatAccumulator += lineBeatsArray[i] || 0; 
          if (beatWithinCurrentLoop < beatAccumulator) { targetLineIdx = i; break; }
          targetLineIdx = i; 
        }
      } else {
        const safeLinesCount = Math.max(1, parsedLinesCount); 
        const beatsPerLine = safeBaseLoopBeats / safeLinesCount; 
        const beatWithinCurrentLoop = cappedCoreBeat % safeBaseLoopBeats;
        targetLineIdx = Math.floor(beatWithinCurrentLoop / beatsPerLine);
        if (targetLineIdx >= safeLinesCount) targetLineIdx = safeLinesCount - 1;
      }

      if (config.activeLineIndexRef.current !== targetLineIdx) {
        config.activeLineIndexRef.current = targetLineIdx;
        config.setActiveLineIndex(targetLineIdx);
      }

      if (elapsedMs >= totalDurationMs) {
        const harmsActiveQueue = config.queuedSectionIndexRef.current !== null && config.queuedTrackIndexRef.current !== null;
        let nextTrackIdx = config.playingTrackIndexRef.current;
        let nextSectionIdx = idx + 1;

        if (harmsActiveQueue) {
          nextTrackIdx = config.queuedTrackIndexRef.current as number;
          nextSectionIdx = config.queuedSectionIndexRef.current as number;
          const jumpTime = config.mdSectionStartTimeRef.current + totalDurationMs;
          config.executeJumpNow(nextTrackIdx, nextSectionIdx, jumpTime);
          if (isCurrentlyMD) {
            config.broadcastRef.current({ action: "JUMP", trackIndex: nextTrackIdx, sectionIndex: nextSectionIdx, mdSectionStartTime: jumpTime }); // ✅ FULL FIX
          }
        } else if (nextSectionIdx >= secs.length) {
          const jumpTime = config.mdSectionStartTimeRef.current + totalDurationMs;
          config.executeJumpNow(nextTrackIdx, 0, jumpTime);
          if (isCurrentlyMD) {
            config.broadcastRef.current({ action: "JUMP", trackIndex: nextTrackIdx, sectionIndex: 0, mdSectionStartTime: jumpTime }); // ✅ FULL FIX
          }
        } else {
          config.currentSectionIndexRef.current = nextSectionIdx;
          config.setCurrentSectionIndex(nextSectionIdx);
          config.hasPlayedCueRef.current = false;
          config.mdSectionStartTimeRef.current = config.mdSectionStartTimeRef.current + totalDurationMs;
        }
      }
      config.animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
    };

    config.animationFrameRef.current = requestAnimationFrame(clockExecutionTick);
    return () => { if (config.animationFrameRef.current) cancelAnimationFrame(config.animationFrameRef.current); };
  }, [config.isPlayingFlow]);
}