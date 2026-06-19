"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client"; // Adjust path if needed
import { useEngine } from "@/app/context/EngineContext"; // Adjust path if needed

export default function CreateTeamPage() {
  const supabase = createClient();
  const router = useRouter();
  const { realUserId, userTeamId } = useEngine(); // Pulling from your context

  const [teamName, setTeamName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Optional: Restrict access to Lone Wolves or specific roles if desired!
  // If they already have a team, you might want to warn them that creating a new one will move them.

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (keyword.trim().length !== 4) {
      setError("Keyword must be exactly 4 letters.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Generate the unique join code (e.g., gith-85915)
      const randomNum = Math.floor(10000 + Math.random() * 90000); // 5 random digits
      const formattedCode = `${keyword.toLowerCase().trim()}-${randomNum}`;

      // 2. Insert the new team into the database
      const { data: newTeam, error: insertError } = await supabase
        .from("teams")
        .insert({
          name: teamName.trim(),
          join_code: formattedCode,
        })
        .select("id")
        .single();

      if (insertError || !newTeam) throw insertError;

      // 3. Assign the creator to this new team (and optionally make them an admin!)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ 
          team_id: newTeam.id,
          role: "admin" // Automatically promote the creator to Admin!
        })
        .eq("id", realUserId);

      if (profileError) throw profileError;

      // 4. Force a hard reload so the Engine Context picks up the new workspace
      window.location.href = "/events";

    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to create team. That keyword might be taken!");
      setIsSubmitting(false);
    }
  }

  return (
    // 1. MASTER WRAPPER: Notice there is NO `p-6` or padding here! It snaps strictly to the edges.
    <div className="h-[calc(100dvh-4rem)] md:h-screen w-full flex flex-col bg-[#f8f9fa] relative animate-in fade-in duration-200">
      
      {/* 2. STICKY HEADER: Now spans 100% full width and stays pinned to the top */}
      <header className="sticky top-0 z-[50] w-full flex-shrink-0 bg-white border-b border-zinc-200 shadow-sm supports-[backdrop-filter]:bg-white/95 supports-[backdrop-filter]:backdrop-blur-md">
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex justify-between items-center px-4 md:px-8 py-4 md:py-5">
            <div className="flex items-center gap-4">
              <button 
                type="button"
                onClick={() => router.back()}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors"
                title="Go Back"
              >
                <span className="font-bold text-sm leading-none block transform -translate-y-[1px]">←</span>
              </button>
              <h1 className="text-2xl md:text-3xl font-black text-zinc-950 tracking-tight flex items-center gap-2" style={{ fontFamily: "Georgia, serif" }}>
                <span>🏛️</span> Create Workspace
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* 3. MAIN CONTENT SCROLL: The padding is applied HERE so the content breathes, but the header doesn't! */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar pb-24 md:pb-8 w-full">
        <div className="max-w-3xl mx-auto w-full">
          
          <div className="bg-white border border-zinc-200 p-6 md:p-8 rounded-2xl shadow-sm">
            <div className="mb-8 border-b border-zinc-100 pb-6">
              <h2 className="text-lg font-black text-zinc-900 tracking-tight">Register a New Church Team</h2>
              <p className="text-xs font-bold text-zinc-400 mt-1">
                Create an isolated workspace. You will automatically be assigned as the Super Admin of this new team.
              </p>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Church / Team Name</label>
                <input
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Mother Church"
                  className="w-full bg-zinc-50 border border-zinc-200/80 rounded-xl px-4 py-3 text-sm font-bold text-zinc-800 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">4-Letter Join Keyword</label>
                  <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-widest border border-blue-100">
                    Preview: {keyword.trim().length === 4 ? `${keyword.toUpperCase()}-12345` : "GITH-12345"}
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value.replace(/[^A-Za-z]/g, ""))}
                  placeholder="GITH"
                  className="w-full bg-zinc-50 border border-zinc-200/80 rounded-xl px-4 py-3 text-lg font-black tracking-widest uppercase text-zinc-800 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner text-center"
                />
                <p className="text-[10px] font-bold text-zinc-400">This keyword will be attached to a 5-digit code that your members will use to join your team during onboarding.</p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-red-600 text-xs font-bold text-center animate-in fade-in">{error}</p>
                </div>
              )}

              <div className="pt-6 mt-6 border-t border-zinc-100 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="px-6 py-3.5 bg-white border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 text-zinc-500 font-black text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || keyword.length !== 4 || !teamName.trim()}
                  className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                >
                  {isSubmitting ? "Creating..." : "Confirm & Create"}
                </button>
              </div>
            </form>
          </div>

        </div>
      </main>
    </div>
  );
}