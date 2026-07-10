import { useState, useEffect, useRef, MutableRefObject } from "react";
import { SongRecord, CompiledBeatMap } from "../types/setlist";

interface UseYouTubeSyncProps {
  activeSong: SongRecord | null;
  activeSongRef: MutableRefObject<SongRecord | null>;
  beatMapRef: MutableRefObject<CompiledBeatMap>;
  currentSectionIndexRef: MutableRefObject<number>;
  getGlobalTime: () => number;
  youtubeVolumeRef: MutableRefObject<number>;
  isYoutubeSyncEnabled: boolean; 
}

export function useYouTubeSync({
  activeSong, activeSongRef, beatMapRef, currentSectionIndexRef, getGlobalTime,
  youtubeVolumeRef, isYoutubeSyncEnabled
}: UseYouTubeSyncProps) {
  
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [isYtBuffering, setIsYtBuffering] = useState<boolean>(false);

  const ytPlayerRef = useRef<any>(null);
  const loadedVideoIdRef = useRef<string | null>(null);
  const isYtPlayerReadyRef = useRef<boolean>(false);
  const ytSyncPendingRef = useRef<boolean>(false); 
  
  // ✅ SURGICAL FIX: A synchronous reference so the hardware clock never waits for a React render
  const isYtBufferingRef = useRef<boolean>(false);

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
            },
            'onStateChange': (event: any) => {
               if (event.data === 3) {
                 isYtBufferingRef.current = true;
                 setIsYtBuffering(true); 
               } else if (event.data === 1 || event.data === 2 || event.data === 0) {
                 isYtBufferingRef.current = false;
                 setIsYtBuffering(false); 
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

  useEffect(() => {
    if (ytPlayerRef.current && isYtPlayerReadyRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
      try { ytPlayerRef.current.setVolume(youtubeVolumeRef.current * 100); } catch(e) {}
    }
  }, [youtubeVolumeRef.current]);

  return { youtubeVideoId, isYtBuffering, setIsYtBuffering, ytPlayerRef, isYtPlayerReadyRef, ytSyncPendingRef, isYtBufferingRef };
}