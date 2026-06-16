import type { Metadata } from "next";
import { EngineProvider } from "./context/EngineContext";
import Sidebar from "../components/Sidebar";
import DevFab from "../components/DevFab";
import "./globals.css";

export const metadata: Metadata = {
  title: "onPraise Stage Coordinator Framework",
  description: "Dynamic deployment plan matrix blocks management console",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#f8f9fa] min-h-screen text-zinc-950 antialiased">
        <EngineProvider>
          {/* Main Layout Wrap Container - Displays side-by-side layout */}
          <div className="flex min-h-screen w-full relative">
            
            {/* Minimal Left Icon Sidebar Column / Bottom Nav on Mobile */}
            <Sidebar />
            
            {/* FIX: Added 'pb-24 md:pb-0' to insulate list items from 
              getting blocked by the mobile global navigation panel overlay.
            */}
            <main className="flex-1 overflow-x-hidden relative min-w-0 pb-24 md:pb-0">
              {children}
            </main>

            {/* Persistent Developer Access Controller Widget Overlay */}
            <DevFab />
            
          </div>
        </EngineProvider>
      </body>
    </html>
  );
}