import { EngineProvider } from "./context/EngineContext";
import ClientLayoutWrapper from "../components/ClientLayoutWrapper";
import IOSInstallPrompt from "../components/IOSInstallPrompt"; 
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Script from 'next/script';
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

// ✅ SURGICAL FIX: Import the Client-Side Wrapper instead!
import FabWrapper from "../components/FabWrapper";

export const metadata: Metadata = {
  title: "Worship Matrix",
  description: "Live Setlist and Worship Management",
  manifest: "/manifest.json?v=2", // ✅ SURGICAL FIX: Re-linked with a cache-buster!
  appleWebApp: {
    capable: true,
    title: "Matrix",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, 
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#f8f9fa]" suppressHydrationWarning>
        <Script 
          id="service-worker-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                // ... your existing SW code
              }
            `
          }} 
        />

        <EngineProvider>
          <ClientLayoutWrapper>
            {children}
            {/* ✅ Will now safely mount only on the client! */}
            <SpeedInsights />
            <Analytics />
            <FabWrapper />
          </ClientLayoutWrapper>
        </EngineProvider>

        <IOSInstallPrompt />
      </body>
    </html>
  );
}