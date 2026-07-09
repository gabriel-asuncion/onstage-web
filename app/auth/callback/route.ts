import { NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  
  // The 'code' is the secure token Google just handed us back
  const code = searchParams.get('code');
  
  // The 'next' param is an optional redirect path (defaults to dashboard)
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    
    // ⚡ THE MAGIC HAPPENS HERE: 
    // This exchanges the URL token for a secure server-side cookie!
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Success! Now that the cookie is baked, route them to the dashboard.
      return NextResponse.redirect(`${origin}${next}`);
    } else {
      console.error("Auth Callback Error:", error.message);
    }
  }

  // If something went wrong, kick them back to the login page with an error
  return NextResponse.redirect(`${origin}/?error=auth-failed`);
}