import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OnPraise-Online',
    short_name: 'OPOnline',
    description: 'Live Setlist and Worship Management',
    start_url: '/',
    display: 'standalone',
    background_color: '#1954D5',
    theme_color: '#009DFE',
    // ✅ SURGICAL ADDITION: Registering the custom protocol
    protocol_handlers: [
      {
        protocol: "web+onpraise",
        url: "/?mode=%s"
      }
    ] as any, // 'as any' prevents Next.js strict typing from throwing a false error here
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}