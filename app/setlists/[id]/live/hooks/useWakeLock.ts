import { useEffect } from "react";

export function useWakeLock() {
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await (navigator as any).wakeLock.request("screen");
          console.log("Wake Lock active: Screen will not sleep.");
          wakeLock.addEventListener("release", () => {
            console.log("Wake Lock released (Tab hidden or battery critical).");
          });
        }
      } catch (err: any) {
        console.warn(`Wake lock failed: ${err.message}`);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLock !== null) wakeLock.release().catch(console.error);
    };
  }, []);
}