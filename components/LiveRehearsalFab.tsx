"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "../utils/supabase/client";

// ✅ SURGICAL FIX: Updated interface to accept flexible column names (title/name, date/event_date)
interface AssignedEvent {
  id: string;
  title?: string;
  name?: string;
  date?: string;
  event_date?: string;
}

export default function LiveRehearsalFab() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [assignedEvents, setAssignedEvents] = useState<AssignedEvent[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAssignedEvents() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // ✅ SURGICAL FIX: Ask for 'title' and 'date' instead of 'name' and 'event_date'
        const { data, error } = await supabase
          .from("event_rosters") 
          .select(`
            event_id,
            events (
              id,
              title,
              date
            )
          `)
          .eq("user_id", user.id);

        if (error) {
          console.error("🚨 FAB Query Error:", error.message);
          setLoading(false);
          return; 
        }

        if (data) {
          const validEvents = data
            .map((row: any) => {
              const joinedKey = Object.keys(row).find(k => typeof row[k] === 'object' && row[k] !== null);
              return joinedKey ? row[joinedKey] : (row.events || row.event || row.setlists);
            })
            .filter((e: any) => e !== null && e !== undefined) as AssignedEvent[];
          
          const uniqueEvents = Array.from(new Map(validEvents.map(e => [e.id, e])).values());
          
          setAssignedEvents(uniqueEvents);
        }
      } catch (err: any) {
        console.error("Failed to load rehearsal fab events:", err?.message || err);
      } finally {
        setLoading(false);
      }
    }

    fetchAssignedEvents();
  }, []);

  if (pathname?.includes("/live")) return null;
  if (loading || assignedEvents.length === 0) return null;

  const handleFabClick = () => {
    if (assignedEvents.length === 1) {
      router.push(`/events/${assignedEvents[0].id}/live`);
    } else {
      setIsMenuOpen(!isMenuOpen);
    }
  };

  return (
    <div className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-[100000] select-none flex flex-col items-end">
      
      {/* MULTI-EVENT SELECTION MENU */}
      {isMenuOpen && assignedEvents.length > 1 && (
        <div className="mb-4 bg-white border border-zinc-200 rounded-[1.25rem] shadow-2xl p-2 w-64 flex flex-col gap-1 animate-in slide-in-from-bottom-2 zoom-in-95 origin-bottom-right">
          <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-zinc-100 mb-1">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Select Rehearsal</h4>
          </div>
          
          <div className="max-h-[40vh] overflow-y-auto custom-scrollbar flex flex-col gap-1">
            {assignedEvents.map((ev) => {
              // ✅ SURGICAL FIX: Safely fallback to whichever column name your DB actually uses
              const displayTitle = ev.title || ev.name || "Unnamed Event";
              const rawDate = ev.date || ev.event_date;
              const displayDate = rawDate 
                ? new Date(rawDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                : "No date set";

              return (
                <button
                  key={ev.id}
                  onClick={() => {
                    setIsMenuOpen(false);
                    router.push(`/events/${ev.id}/live`);
                  }}
                  className="text-left px-3 py-2.5 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer group border border-transparent hover:border-blue-100"
                >
                  <span className="block text-[13px] font-black text-zinc-800 group-hover:text-blue-700 leading-tight">
                    {displayTitle}
                  </span>
                  <span className="block text-[10px] font-bold text-zinc-400 mt-0.5">
                    {displayDate}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* THE FLOATING ACTION BUTTON */}
      <button
        onClick={handleFabClick}
        className={`flex items-center gap-2.5 px-5 py-3.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer border ${
          isMenuOpen 
            ? "bg-zinc-950 text-white border-zinc-800" 
            : "bg-blue-600 hover:bg-blue-700 text-white border-blue-500"
        }`}
      >
        <div className="w-5 h-5 flex items-center justify-center">
          {isMenuOpen ? (
             <span className="font-black text-sm">✕</span>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </div>
        
        <div className="flex flex-col items-start leading-none text-left">
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">
            {assignedEvents.length > 1 ? "Assigned Events" : "Return To"}
          </span>
          <span className="text-[13px] font-bold">
            {isMenuOpen ? "Close Menu" : assignedEvents.length > 1 ? "Live Rehearsals" : "Live Rehearsal"}
          </span>
        </div>
        
        {assignedEvents.length > 1 && !isMenuOpen && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 border-2 border-white rounded-full flex items-center justify-center text-[9px] font-black shadow-sm">
            {assignedEvents.length}
          </div>
        )}
      </button>

    </div>
  );
}