import { EngineProvider } from "./context/EngineContext";
import ClientLayoutWrapper from "../components/ClientLayoutWrapper";
// ✅ SURGICAL ADDITION: Import the new iOS prompt component
import IOSInstallPrompt from "../components/IOSInstallPrompt"; 
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Script from 'next/script';

export const metadata: Metadata = {
  title: "Worship Matrix",
  description: "Live Setlist and Worship Management",
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
        {/* ✅ SURGICAL ADDITION: Register the Service Worker */}
        {/* ✅ SURGICAL FIX: Use Next.js Script component */}
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
          </ClientLayoutWrapper>
        </EngineProvider>

        <IOSInstallPrompt />
      </body>
    </html>
  );
}