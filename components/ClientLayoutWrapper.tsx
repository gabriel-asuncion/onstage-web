"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import DevFab from "./DevFab";
import { useEngine } from "../app/context/EngineContext";

export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isSuperAdmin } = useEngine(); // ✅ 2. Pull the boolean from Context

  const isFullscreenRoute = pathname === "/" || pathname === "/onboarding";

  if (isFullscreenRoute) {
    return (
      <main className="min-h-screen w-full relative">
        {children}
        {/* ✅ 3. Conditionally render */}
        {isSuperAdmin && <DevFab />} 
      </main>
    );
  }

  return (
    <div className="flex min-h-screen w-full relative">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden relative min-w-0 pb-24 md:pb-0">
        <div className="w-full max-w-7xl">
          {children}
        </div>
        {/* {children} */}
      </main>
      {/* ✅ 3. Conditionally render */}
      {isSuperAdmin && <DevFab />}
    </div>
  );
}