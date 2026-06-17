import { EngineProvider } from "./context/EngineContext";
import ClientLayoutWrapper from "../components/ClientLayoutWrapper";
import "./globals.css";

// You can safely keep your export const metadata = { ... } here if you have one!

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#f8f9fa] min-h-screen text-zinc-950 antialiased">
        <EngineProvider>
          {/* ✅ SURGICAL FIX: Let the Client Wrapper handle the conditional layout */}
          <ClientLayoutWrapper>
            {children}
          </ClientLayoutWrapper>
        </EngineProvider>
      </body>
    </html>
  );
}