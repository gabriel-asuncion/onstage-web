import { useState, useEffect, useRef, MutableRefObject } from "react";
import { SongRecord, CompiledBeatMap } from "../types/setlist";

interface UseYouTubeSyncProps {
  activeSong: SongRecord | null;
  activeSongRef: MutableRefObject<SongRecord | null>;
  beatMapRef: MutableRefObject<CompiledBeatMap>;
  currentSectionIndexRef: MutableRefObject<number>;
  getGlobalTime: () => number;
  executeStartSequence: (useCountdown: boolean, forcedStartTimestamp?: number, isYtSource?: boolean) => void;
  youtubeVolumeRef: MutableRefObject<number>;
  isYoutubeSyncEnabled: boolean; // ✅ Added
}

export function useYouTubeSync({
  activeSong, activeSongRef, beatMapRef, currentSectionIndexRef, getGlobalTime,
  executeStartSequence, youtubeVolumeRef, isYoutubeSyncEnabled
}: UseYouTubeSyncProps) {
  
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [isYtBuffering, setIsYtBuffering] = useState<boolean>(false);

  const ytPlayerRef = useRef<any>(null);
  const ytSyncPendingRef = useRef<boolean>(false);
  const loadedVideoIdRef = useRef<string | null>(null);
  const isYtPlayerReadyRef = useRef<boolean>(false);

  useEffect(() => {
    if (!activeSong?.youtube_url) { setYoutubeVideoId(null); return; }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = activeSong.youtube_url.match(regExp);
    if (match && match[2].length === 11) setYoutubeVideoId(match[2]);
    else setYoutubeVideoId(null);
  }, [activeSong?.youtube_url]);

  useEffect(() => {
    if (!youtubeVideoId || !isYoutubeSyncEnabled) return;
    const initPlayer = () => {
      if (!(window as any).YT || !(window as any).YT.Player) { setTimeout(initPlayer, 200); return; }
      
      if (ytPlayerRef.current && isYtPlayerReadyRef.current && typeof ytPlayerRef.current.cueVideoById === 'function') {
        if (loadedVideoIdRef.current !== youtubeVideoId) {
          loadedVideoIdRef.current = youtubeVideoId;
          try { ytPlayerRef.current.cueVideoById(youtubeVideoId); } catch(e) {}
        }
      } else if (!ytPlayerRef.current) {
        loadedVideoIdRef.current = youtubeVideoId;
        ytPlayerRef.current = new (window as any).YT.Player('yt-live-player-container', {
          height: '10px', width: '10px', videoId: youtubeVideoId,
          playerVars: { 'playsinline': 1, 'controls': 0, 'disablekb': 1 },
          events: {
            'onReady': (event: any) => {
              isYtPlayerReadyRef.current = true; 
              event.target.setVolume(youtubeVolumeRef.current * 100);
              event.target.mute(); event.target.playVideo();
              setTimeout(() => {
                if (event.target && typeof event.target.pauseVideo === 'function') {
                  event.target.pauseVideo(); event.target.seekTo(0); event.target.unMute();
                }
              }, 500);
            },
            'onStateChange': (event: any) => {
              if (event.data === 1 && ytSyncPendingRef.current) {
                ytSyncPendingRef.current = false; setIsYtBuffering(false);
                const currentVideoTimeMs = (event.target.getCurrentTime() || 0) * 1000;
                const songBeat1OffsetMs = activeSongRef.current?.youtube_sync_offset_ms || 0;
                const targetAbsoluteBeat = beatMapRef.current.sectionStartBeats[currentSectionIndexRef.current] || 0;
                const beatSpeedMs = (60 / (activeSongRef.current?.tempo || 75)) * 1000;
                const sectionVideoStartMs = songBeat1OffsetMs + (targetAbsoluteBeat * beatSpeedMs);
                const timeUntilSectionStart = sectionVideoStartMs - currentVideoTimeMs;
                const exactStartTimestamp = getGlobalTime() + timeUntilSectionStart;
                executeStartSequence(false, exactStartTimestamp, true);
              }
            }
          }
        });
      }
    };

    if (!(window as any).YT) {
      const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
    initPlayer();

    return () => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') ytPlayerRef.current.pauseVideo();
    };
  }, [youtubeVideoId, isYoutubeSyncEnabled]);

  // ✅ Physically apply volume changes to the iframe when the slider moves
  useEffect(() => {
    if (ytPlayerRef.current && isYtPlayerReadyRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      try { ytPlayerRef.current.setVolume(youtubeVolumeRef.current * 100); } catch(e) {}
    }
  }, [youtubeVolumeRef.current]);

  return { youtubeVideoId, isYtBuffering, setIsYtBuffering, ytPlayerRef, isYtPlayerReadyRef, ytSyncPendingRef };
}