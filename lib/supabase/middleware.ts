import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isUiPreview } from '@/lib/ui-preview';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSupabaseSession(request: NextRequest) {
  // UI PREVIEW MODE: skip every cookie read, session refresh and redirect below. The gate is
  // NODE_ENV=development + NEXT_PUBLIC_ENABLE_UI_PREVIEW=true (lib/ui-preview.ts), so a production
  // build can never reach this line. Everything under it is untouched.
  if (isUiPreview) return NextResponse.next();

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    /**
     * The same forwarding as lib/supabase/server.ts, for a different reason: THIS is where sessions get
     * refreshed, and GoTrue rewrites the session's recorded user agent on every refresh. Without the
     * browser's own header here, a device would be labelled correctly at sign-in and then silently
     * relabelled "node" the first time its token rotated — which in this app is within the hour.
     */
    global: {
      headers: (() => {
        const forwarded: Record<string, string> = {};
        const userAgent = request.headers.get('user-agent');
        if (userAgent) forwarded['User-Agent'] = userAgent;
        const address = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip');
        if (address) forwarded['X-Forwarded-For'] = address;
        return forwarded;
      })(),
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // A server-confirmed lookup avoids trusting spoofable cookie contents.
  await supabase.auth.getUser();
  return response;
}
