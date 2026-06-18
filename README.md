# 🎸 OnPraise

OnPraise is a real-time, synchronized setlist and performance management platform designed for worship teams and live bands. It acts as a digital teleprompter, dynamic chord chart, and stage communication tool all rolled into one. 

With real-time WebSocket synchronization, the Music Director (MD) can control the flow of the setlist, driving auto-scrolling lyrics and beat-tracking across every connected device on stage instantly.

---

## ✨ Key Features

*   **Real-Time Stage Synchronization:** When the Music Director starts a song, jumps to a specific section (e.g., Bridge), or moves to the next track, every band member's screen follows instantly with zero-latency network syncing.
*   **Smart Teleprompter & Auto-Scrolling:** Lyrics and chords auto-scroll line-by-line based on the song's BPM, custom measure/beat timings, and arrangement structure. 
*   **On-the-Fly Transposition:** Shift the key of any song in the setlist instantly. The engine automatically transposes inline chords and complex slash chords (e.g., `B/D#` to `C/E`) without altering the original database record.
*   **Custom Arrangements:** Drag-and-drop structural blocks to create custom flow overrides for a specific weekend (e.g., Intro -> Verse 1 -> Chorus -> Chorus -> Instrumental) without affecting the master song library.
*   **Granular User Preferences:** Every musician can customize their own UI. Vocalists can hide chords entirely, while instrumentalists can tweak font sizes and line spacing for optimal readability on stage.
*   **Multi-Workspace & Role Management:** Built-in team switching, allowing users to bounce between different church branches or bands seamlessly, with strict role guards (Super Admin, Admin, Member, Tester).
*   **Developer Simulation Engine:** A built-in FAB (Floating Action Button) context that allows developers to instantly simulate different roles and account states without needing to juggle multiple login credentials.

---

## 🛠 Tech Stack

**Frontend Architecture**
*   **Framework:** [Next.js](https://nextjs.org/) (App Router)
*   **UI Library:** [React](https://reactjs.org/)
*   **Language:** [TypeScript](https://www.typescriptlang.org/) for strict type safety and interface modeling
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/) for rapid, utility-first UI design
*   **Bundler:** Turbopack for ultra-fast local HMR (Hot Module Replacement)

**Backend & Infrastructure**
*   **Database:** [Supabase](https://supabase.com/) (PostgreSQL)
*   **Authentication:** Supabase Auth (Magic Links, OAuth, Session Management)
*   **Real-time:** Supabase Realtime (WebSocket channels for presence tracking and stage broadcasting)
*   **Hosting/Deployment:** Vercel (Recommended)

---

## 🧠 How It Works (The Live Engine)

The heart of OnPraise is the `SetlistPerformanceRoomPage`. Here is a brief overview of how the engine handles live playback:

1.  **Presence & Lobby:** When a user enters the live view, they subscribe to a Supabase channel specific to that setlist (`setlist_lobby_[id]`).
2.  **The Music Director (MD) Lock:** By default, the setlist is in "Read-Only" mode. A user with appropriate permissions must click **Take Music Director Control** to unlock playback.
3.  **The Playback Clock:** Once the MD hits play, a high-performance `requestAnimationFrame` clock loop begins. It calculates the song's tempo, the duration of the current section (Measures × Beats), and determines exactly which line of lyrics to highlight.
4.  **Broadcast Syncing:** As the MD navigates the song, lightweight payload events (`START`, `STOP`, `JUMP`, `TRACK_CHANGE`, `QUEUE`) are broadcasted to the channel. 
5.  **Client Compensation:** Follower devices receive these pings, calculate network latency off the timestamp, and adjust their local visual auto-scrollers so that everyone on stage is highlighting the exact same word at the exact same millisecond.

---

## 🚀 Getting Started

### Prerequisites
*   Node.js 18.x or higher
*   A Supabase project instance

### Installation

1. **Clone the repository:**
```bash
   git clone [https://github.com/your-org/onpraise.git](https://github.com/your-org/onpraise.git)
   cd onpraise