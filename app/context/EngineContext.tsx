"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { createClient } from "../../utils/supabase/client";

type RoleType = "admin" | "member" | "none";

interface EngineContextProps {
  simulatedRole: RoleType;
  activeRole: string;
  simulatedUserId: string; 
  userTeamId: string | null; // This now represents the ACTIVE workspace
  primaryTeamId: string | null; // Keeps track of their home base
  secondaryTeamIds: string[]; // List of other workspaces
  isSuperAdmin: boolean;
  setSimulatedRole: (role: RoleType) => void;
  switchWorkspace: (teamId: string) => void; // ✅ The switcher function
}

const EngineContext = createContext<EngineContextProps | undefined>(undefined);

const MOCK_UUIDS = {
  admin: "11111111-1111-1111-1111-111111111111",
  member: "22222222-2222-2222-2222-222222222222"
};

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [simulatedRole, setSimulatedRoleState] = useState<RoleType>("none");
  const [simulatedUserId, setSimulatedUserId] = useState<string>(MOCK_UUIDS.admin);
  const [realUserId, setRealUserId] = useState<string>("");
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [realRole, setRealRole] = useState<string>("member"); // ✅ ADD THIS
  const [primaryTeamId, setPrimaryTeamId] = useState<string | null>(null);
  const [secondaryTeamIds, setSecondaryTeamIds] = useState<string[]>([]);
  
  // ✅ SURGICAL ADDITION: Hold the team ID in global state
  const [userTeamId, setUserTeamId] = useState<string | null>(null);

  // Track the authentic user ID session in the background
  useEffect(() => {
    async function fetchRealUserSession() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setRealUserId(user.id);
        
        // ✅ SURGICAL FIX: Fetch the actual user's team ID from their profile in the background
        // Fetch the actual user's team ID and super admin status
        // Fetch the actual user's team ID, super admin status, and REAL ROLE
        // ✅ Fetch the secondary_team_ids array
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("team_id, secondary_team_ids, full_name, is_super_admin, role") 
          .eq("id", user.id)
          .maybeSingle();

        if (!profile || !profile.team_id) {
          if (typeof window !== "undefined" && !window.location.pathname.includes("/onboarding")) {
            window.location.href = "/onboarding";
          }
        } else {
          setPrimaryTeamId(profile.team_id);
          setSecondaryTeamIds(profile.secondary_team_ids || []);
          
          // ✅ Check local storage to see if they previously switched workspaces
          const savedWorkspace = localStorage.getItem("active_workspace_id");
          
          // Ensure the saved workspace is one they actually belong to (Security check)
          const isAuthorized = savedWorkspace === profile.team_id || (profile.secondary_team_ids || []).includes(savedWorkspace);
          
          if (savedWorkspace && isAuthorized) {
            setUserTeamId(savedWorkspace);
          } else {
            setUserTeamId(profile.team_id); // Default to home base
          }
          
          if (profile.is_super_admin) setIsSuperAdmin(true);
          if (profile.role) setRealRole(profile.role);
        }

        // If the cached startup role is 'none' or doesn't exist yet, map the real user ID immediately
        const cached = localStorage.getItem("onpraise_sim_role") as RoleType;
        if (cached === "none" || !cached) {
          setSimulatedUserId(user.id);
        }
      }
    }
    fetchRealUserSession();
  }, []);

  const setSimulatedRole = (role: RoleType) => {
    setSimulatedRoleState(role);
    
    if (role === "none") {
      // Automatically swap to your true authentic user ID
      setSimulatedUserId(realUserId || "00000000-0000-0000-0000-000000000000");
    } else {
      setSimulatedUserId(MOCK_UUIDS[role]);
    }
    
    if (typeof window !== "undefined") {
      localStorage.setItem("onpraise_sim_role", role);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("onpraise_sim_role") as RoleType;
      if (cached && ["admin", "member", "none"].includes(cached)) {
        setSimulatedRoleState(cached);
        if (cached !== "none") {
          setSimulatedUserId(MOCK_UUIDS[cached]);
        } else if (realUserId) {
          setSimulatedUserId(realUserId);
        }
      } else if (!cached && realUserId) {
        // Fallback baseline layout mapping for fresh un-cached user allocations
        setSimulatedUserId(realUserId);
      }
    }
  }, [realUserId]);

  const switchWorkspace = (teamId: string) => {
    setUserTeamId(teamId);
    localStorage.setItem("active_workspace_id", teamId); // Remember their choice
    window.location.reload(); // Hard reload to securely refresh all data scopes
  };

  const activeRole = simulatedRole === "none" ? realRole : simulatedRole;

  return (
    <EngineContext.Provider value={{ 
      simulatedRole, 
      activeRole,
      simulatedUserId, 
      userTeamId, 
      primaryTeamId,
      secondaryTeamIds,
      isSuperAdmin, 
      setSimulatedRole,
      switchWorkspace // ✅ Expose the function
    }}>
      {children}
    </EngineContext.Provider>
  );
}

export function useEngine() {
  const context = useContext(EngineContext);
  if (!context) {
    throw new Error("useEngine must be used within an EngineProvider block context.");
  }
  return context;
}