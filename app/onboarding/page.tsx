"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

const MINISTRY_OPTIONS = [
  "Pastor",
  "Music Leader",
  "Musician",
  "Backup",
  "Tech & Media",
  "Usher / Greeter",
  "General Member"
];

export default function OnboardingPage() {
  const supabase = createClient();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Wizard State Tracker
  const [step, setStep] = useState(1);
  
  // Form Data States
  const [fullName, setFullName] = useState("");
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);

  const [joinCode, setJoinCode] = useState<string>("");
  const [joinError, setJoinError] = useState<string>("");

  // ✅ PHASE 2 FIX: Lookup the team by Join Code and assign the user
  async function handleJoinTeam() {
    setJoinError("");
    
    if (!joinCode.trim()) {
      setJoinError("Please enter a valid join code.");
      return;
    }

    // 1. Get the securely authenticated user ID directly from Supabase
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setJoinError("Authentication error. Please log in again.");
      return;
    }

    // 2. Lookup the UUID of the team using the join code
    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .select("id, name")
      .eq("join_code", joinCode.toLowerCase().trim())
      .maybeSingle();

    if (teamError || !teamData) {
      setJoinError("Invalid code. Please check your spelling and try again.");
      return;
    }

    // 3. Assign the user's profile to the hidden UUID using the real user.id
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ team_id: teamData.id })
      .eq("id", user.id); 

    if (profileError) {
      setJoinError("Failed to join the team. Please try again.");
      return;
    }

    // 4. Send them to the dashboard!
    setStep(3); // CHANGE THIS to whatever your state is called (e.g., setCurrentStep(3), nextStep(), etc.)
  }

  // ✅ PHASE 2 FIX: Allow users to skip and wander around with a NULL team_id
  async function handleSkipTeamSelection() {
    // We just safely route them to the dashboard. Their team_id remains NULL.
    setStep(3); // CHANGE THIS to match your local state
  }

  useEffect(() => {
    async function fetchInitialData() {
      // 1. Get the authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);

      // 2. Fetch their existing name to pre-fill Step 1
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      
      if (profile?.full_name) {
        setFullName(profile.full_name);
      }

      // 3. Fetch available teams from the database
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name")
        .order("name", { ascending: true });
        
      if (teamsData) setTeams(teamsData);
      setLoading(false);
    }
    fetchInitialData();
  }, [router, supabase]);

  const handleToggleMinistry = (ministry: string) => {
    setSelectedMinistries(prev => 
      prev.includes(ministry) 
        ? prev.filter(m => m !== ministry) 
        : [...prev, ministry]
    );
  };

  const handleCompleteOnboarding = async () => {
    // ✅ SURGICAL FIX: Removed `!selectedTeamId` so "Lone Wolf" users who skipped Step 2 can still finish!
    if (!userId || selectedMinistries.length === 0 || !fullName.trim()) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          full_name: fullName.trim(), 
          ministries: selectedMinistries 
          // ✅ SURGICAL FIX: Removed team_id from the payload so we don't accidentally overwrite Step 2
        })
        .eq("id", userId);

      if (error) throw error;

      // Force a hard reload to the dashboard so the EngineContext picks up the new data
      window.location.href = "/dashboard"; 
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Failed to save profile. Please try again.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center font-sans">
        <div className="animate-pulse text-xs font-black uppercase tracking-widest text-blue-600">
          Preparing your workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        
        {/* Dynamic Progress Indicator */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-zinc-100">
          <div 
            className="h-full bg-blue-600 transition-all duration-500 ease-out" 
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* STEP 1: CONFIRM NAME */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="text-center space-y-2 mb-8 mt-2">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-xl font-black mx-auto shadow-md mb-4">
                👋
              </div>
              <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Verify Your Identity</h1>
              <p className="text-xs font-bold text-zinc-500">How would you like your name to appear to the rest of the team?</p>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block ml-1">
                  Full Name
                </label>
                <input 
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name..."
                  className="w-full p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 text-sm font-bold text-zinc-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                  autoFocus
                />
              </div>

              <button
                type="button"
                disabled={!fullName.trim()}
                onClick={() => setStep(2)}
                className="w-full py-4 rounded-xl bg-zinc-950 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Continue to Team
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: CHOOSE TEAM */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="text-center space-y-2 mb-8">
          <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md text-xl">
            🏛️
          </div>
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Enter your Church ID</h2>
          <p className="text-xs font-bold text-zinc-500">Ask your Music Director for your 10-character join code.</p>
        </div>

        <div className="space-y-4 mb-8">
          <div>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. gith-12345"
              className="w-full text-center text-lg font-black tracking-widest uppercase border border-zinc-200 rounded-xl p-4 shadow-inner focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              maxLength={10}
            />
            {joinError && (
              <p className="text-red-500 text-xs font-bold text-center mt-2 animate-in slide-in-from-top-1">{joinError}</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            type="button"
            onClick={handleSkipTeamSelection}
            className="flex-1 py-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm"
          >
            Skip For Now
          </button>
          
          <button
            type="button"
            onClick={handleJoinTeam}
            disabled={joinCode.trim().length < 10}
            className={`flex-1 py-4 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm ${
              joinCode.trim().length === 10
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                : "bg-zinc-500 hover:bg-zinc-600 text-white/50 cursor-not-allowed"
            }`}
          >
            Continue
          </button>
        </div>
          </div>
        )}

        {/* STEP 3: CHOOSE MINISTRIES */}
        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="text-center space-y-2 mb-8 mt-2">
              <div className="w-12 h-12 bg-purple-600 text-white rounded-2xl flex items-center justify-center text-xl font-black mx-auto shadow-md mb-4">
                🎸
              </div>
              <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Your Ministries</h1>
              <p className="text-xs font-bold text-zinc-500">Select all the roles or departments you serve in.</p>
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap gap-2 justify-center">
                {MINISTRY_OPTIONS.map(min => {
                  const isSelected = selectedMinistries.includes(min);
                  return (
                    <button
                      key={min}
                      type="button"
                      onClick={() => handleToggleMinistry(min)}
                      className={`px-4 py-3 rounded-xl border text-xs font-bold transition-all ${
                        isSelected 
                          ? "bg-purple-600 border-purple-500 text-white shadow-md ring-4 ring-purple-500/20 scale-105" 
                          : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      {isSelected ? "✓ " : ""}{min}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="col-span-1 py-4 rounded-xl bg-zinc-100 text-zinc-700 font-black text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={selectedMinistries.length === 0 || saving}
                  onClick={handleCompleteOnboarding}
                  className="col-span-2 py-4 rounded-xl bg-purple-600 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? "Finalizing..." : "Complete Setup"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}