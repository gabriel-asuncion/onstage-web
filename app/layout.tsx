import { EngineProvider } from "./context/EngineContext";
import ClientLayoutWrapper from "../components/ClientLayoutWrapper";
// ✅ SURGICAL ADDITION: Import the new iOS prompt component
import IOSInstallPrompt from "../components/IOSInstallPrompt"; 
import "./globals.css";
import type { Metadata, Viewport } from "next";

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
      <body className="bg-[#f8f9fa] min-h-screen text-zinc-950 antialiased" suppressHydrationWarning>
        
        {/* ✅ SURGICAL ADDITION: Register the Service Worker */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
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