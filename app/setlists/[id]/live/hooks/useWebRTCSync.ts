import { useEffect, useRef, useState, useCallback } from "react";

interface SyncPayload {
  action: "START" | "STOP" | "JUMP" | "QUEUE" | "TRACK_CHANGE" | "HEARTBEAT";
  [key: string]: any;
}

export function useWebRTCSync(setlistId: string, isMD: boolean, onCommandReceived: (payload: SyncPayload) => void) {
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<Map<string, any>>(new Map());
  const [rtcStatus, setRtcStatus] = useState<"disconnected" | "connecting" | "connected" | "hosting">("disconnected");
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stable callback reference to prevent stale closures
  const handleCommandRef = useRef(onCommandReceived);
  useEffect(() => { handleCommandRef.current = onCommandReceived; }, [onCommandReceived]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;
    const mdHostId = `onstage-md-${setlistId}`;

    const initializePeer = async () => {
      const Peer = (await import("peerjs")).default;
      
      // Cleanup previous instances if roles changed (e.g., Follower became MD)
      if (peerRef.current) {
        peerRef.current.destroy();
        connectionsRef.current.clear();
      }
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

      setRtcStatus("connecting");

      try {
        if (isMD) {
          // --- HOST MODE (MUSIC DIRECTOR) ---
          const peer = new Peer(mdHostId, { debug: 1 }); // debug: 1 keeps the console clean
          
          peer.on("open", () => {
            if (isMounted) setRtcStatus("hosting");
            console.log("👑 WebRTC Host Active: Awaiting Band Members");
          });

          peer.on("connection", (conn) => {
            conn.on("open", () => {
              connectionsRef.current.set(conn.peer, conn);
              console.log("🎧 Band Member Linked");
            });
            conn.on("close", () => connectionsRef.current.delete(conn.peer));
            conn.on("error", () => connectionsRef.current.delete(conn.peer));
          });
          
          peer.on("error", (err: any) => {
            if (err.type === "unavailable-id") console.warn("Another MD is already hosting!");
          });

          peerRef.current = peer;

        } else {
          // --- FOLLOWER MODE ---
          const peer = new Peer({ debug: 1 }); 
          
          const connectToMD = () => {
            if (!isMounted || peer.destroyed) return;
            
            const conn = peer.connect(mdHostId, { reliable: false }); // Unreliable = UDP Mode (Lightning Fast)
            
            conn.on("open", () => {
              if (isMounted) setRtcStatus("connected");
              connectionsRef.current.set(mdHostId, conn);
              console.log("⚡ WebRTC Linked to Music Director");
            });

            conn.on("data", (data: unknown) => {
              // Execute the command instantly
              handleCommandRef.current(data as SyncPayload);
            });

            conn.on("close", () => {
              if (isMounted) setRtcStatus("disconnected");
              connectionsRef.current.delete(mdHostId);
              // If MD closes laptop or loses connection, start polling again
              if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
              retryTimeoutRef.current = setTimeout(connectToMD, 3000);
            });
          };

          peer.on("open", () => {
            connectToMD(); // Attempt first connection
          });

          peer.on("error", (err: any) => {
            // If the MD isn't online yet, peerjs throws this error.
            if (err.type === "peer-unavailable") {
              if (isMounted) setRtcStatus("disconnected");
              
              // ✅ SURGICAL FIX: Quietly try again in 3 seconds!
              if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
              retryTimeoutRef.current = setTimeout(connectToMD, 3000);
            } else {
              console.warn("PeerJS Error:", err);
            }
          });

          peerRef.current = peer;
        }
      } catch (err) {
        console.error("WebRTC Initialization Error:", err);
        setRtcStatus("disconnected");
      }
    };

    // Delay init by 800ms to allow Supabase to figure out if we are the MD 
    // before we accidentally spin up a Follower peer that fails.
    const initDelay = setTimeout(initializePeer, 800);

    return () => {
      isMounted = false;
      if (initDelay) clearTimeout(initDelay);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (peerRef.current) peerRef.current.destroy();
    };
  }, [setlistId, isMD]);

  // The function the MD calls to blast data to all followers instantly
  const broadcastToFollowers = useCallback((payload: SyncPayload) => {
    if (!isMD || connectionsRef.current.size === 0) return;
    
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(payload);
      }
    });
  }, [isMD]);

  return { rtcStatus, broadcastToFollowers };
}