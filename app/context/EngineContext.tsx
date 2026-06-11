"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { createClient } from "../../utils/supabase/client";

type RoleType = "admin" | "member" | "none";

interface EngineContextProps {
  simulatedRole: RoleType;
  simulatedUserId: string; 
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

  // Track the authentic user ID session in the background
  useEffect(() => {
    async function fetchRealUserSession() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setRealUserId(user.id);
        
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
      // SURGICAL FIX: Automatically swap to your true authentic user ID
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

  return (
    <EngineContext.Provider value={{ simulatedRole, simulatedUserId, setSimulatedRole }}>
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