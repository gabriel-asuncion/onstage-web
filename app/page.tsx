"use client";

import { createClient } from '../utils/supabase/client';

export default function Home() {
  const supabase = createClient();

  const handleFacebookLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        // This tells Supabase where to send the user back to after logging in
        redirectTo: "http://localhost:3000/dashboard", 
      },
    });

    if (error) {
      console.error("Error logging in:", error.message);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg text-center border border-zinc-100">
        <h1 className="text-3xl font-bold mb-2 text-zinc-900">OnPraise Online</h1>
        <p className="text-zinc-500 mb-8">Worship planning and team collaboration.</p>

        <button
          onClick={handleFacebookLogin}
          className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {/* A simple SVG icon for Facebook */}
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Continue with Facebook
        </button>
      </div>
    </main>
  );
}