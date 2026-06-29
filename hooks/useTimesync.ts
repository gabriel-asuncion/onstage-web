"use client";
import { useEffect, useState, useRef } from 'react';

export function useTimesync() {
  const [isSynced, setIsSynced] = useState(false);
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    let isActive = true;

    const syncClock = async () => {
      try {
        const t0 = Date.now();
        
        const res = await fetch('/api/timesync', { cache: 'no-store' });
        
        // ✅ SURGICAL FIX: Catch 404s, 405s, or 500s before they break the JSON parser!
        if (!res.ok) {
          throw new Error(`Server rejected timesync ping with status: ${res.status}`);
        }

        const { serverTime } = await res.json();
        const t3 = Date.now();

        if (!isActive) return;

        // NTP Math: Calculate round trip and one-way latency
        const roundTripTime = t3 - t0;
        const oneWayLatency = roundTripTime / 2;
        
        // Calculate what time it ACTUALLY is on the server right now
        const trueServerTime = serverTime + oneWayLatency;

        // Save the offset
        offsetRef.current = trueServerTime - t3;
        
        if (!isSynced) setIsSynced(true);
        
        // Optional: comment this out later if you don't want it logging every 10 seconds
        console.log(`⏱️ Clock synced. RTT: ${roundTripTime}ms | Offset: ${offsetRef.current}ms`);
      } catch (err) {
        console.warn("Timesync ping failed cleanly:", err);
      }
    };

    // Run immediately on mount
    syncClock();

    // Re-check network drift every 10 seconds quietly in the background
    const interval = setInterval(syncClock, 10000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [isSynced]);

  // The Live Page calls this continuously. It applies the calculated offset to the local clock.
  const getGlobalTime = () => Date.now() + offsetRef.current;

  return { isSynced, getGlobalTime };
}