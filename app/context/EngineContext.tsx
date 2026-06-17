"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { createClient } from "../../utils/supabase/client";

type RoleType = "admin" | "member" | "none";

interface EngineContextProps {
  simulatedRole: RoleType;
  activeRole: string; // ✅ THE NEW GOLD STANDARD FOR YOUR PAGES
  simulatedUserId: string; 
  userTeamId: string | null;
  isSuperAdmin: boolean;
  setSimulatedRole: (role: RoleType) => void;
}

const EngineContext = createContext<EngineContextProps | undefined>(undefined);

const MOCK_UUIDS = {
  admin: "11111111-1111-1111-1111-111111111111",
  member: "22222222-2222-2222-2222-222222222222"
};

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [simulatedRole, setSimulatedRoleState] = useState<RoleType>("admin");
  const [simulatedUserId, setSimulatedUserId] = useState<string>(MOCK_UUIDS.admin);
  const [realUserId, setRealUserId] = useState<string>("");
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [realRole, setRealRole] = useState<string>("member"); // ✅ ADD THIS
  
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
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("team_id, full_name, is_super_admin, role") // ✅ ADDED 'role'
          .eq("id", user.id)
          .maybeSingle();

        if (!profile || !profile.team_id) {
          if (typeof window !== "undefined" && !window.location.pathname.includes("/onboarding")) {
            window.location.href = "/onboarding";
          }
        } else {
          setUserTeamId(profile.team_id);
          
          if (profile.is_super_admin) setIsSuperAdmin(true);
          
          // ✅ Save their true database role
          if (profile.role) setRealRole(profile.role);
        }
        
        // If the cached startup role is 'none', map the real user ID immediately
        const cached = localStorage.getItem("onpraise_sim_role") as RoleType;
        if (cached === "none") {
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
        }
      }
    }
  }, [realUserId]);

  // ✅ MAGIC: If simulating, use simulation. If 'none', use their real database role!
  const activeRole = simulatedRole === "none" ? realRole : simulatedRole;

  return (
    <EngineContext.Provider value={{ 
      simulatedRole, 
      activeRole, // ✅ EXPOSE IT HERE
      simulatedUserId, 
      userTeamId, 
      isSuperAdmin, 
      setSimulatedRole 
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