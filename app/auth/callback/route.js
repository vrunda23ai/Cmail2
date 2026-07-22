import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side OAuth callback. Supabase redirects here with ?code=...
// We exchange it for a session (which writes the auth cookies on THIS response),
// then redirect the browser to /dashboard. This is the pattern that survives
// PKCE + SSR without the redirect loop you were hitting.
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/dashboard';
  const errorDescription = url.searchParams.get('error_description');

  const origin = process.env.NEXT_PUBLIC_BASE_URL || url.origin;

  if (errorDescription) {
    return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent(errorDescription)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth?error=missing_code`);
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // write onto BOTH the request cookie store (for any subsequent server work)
            // and the outgoing redirect response (this is what the browser actually keeps)
            try { cookieStore.set(name, value, options); } catch {}
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent(error.message)}`);
  }

  return response;
}
