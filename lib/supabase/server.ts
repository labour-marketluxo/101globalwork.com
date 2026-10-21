import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { IS_MOCK_MODE, createMockSupabaseClient } from '@/lib/supabase/mock';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * The browser's identifying headers, forwarded to GoTrue.
 *
 * ⚠️ WITHOUT THIS, EVERY SESSION THIS APP CREATES IS RECORDED AS "node". Sign-in happens in a server
 * action, so the request that reaches GoTrue comes from the Next.js server; GoTrue faithfully records
 * THE SERVER as the device. The result is a session list where every row says "node" — which is worse
 * than useless on the one page whose entire purpose is letting somebody recognise their own devices,
 * and it was visible in the browser during that page's own verification.
 *
 * The same applies to the address: behind a proxy the server's outbound IP is not the visitor's, so
 * the recorded address would be a datacentre rather than the network somebody can recognise. GoTrue
 * honours X-Forwarded-For (verified against this project: a session created with
 * `X-Forwarded-For: 203.0.113.9` recorded exactly that address).
 *
 * Both values are display-only in this app — they are shown back to the account that owns the session
 * and never used for a decision — so a forged header can only mislabel the sender's own device. The
 * alternative, leaving them out, mislabels EVERY device for EVERYBODY.
 */
async function clientHeaders(): Promise<Record<string, string>> {
  const incoming = await headers();
  const forwarded: Record<string, string> = {};

  const userAgent = incoming.get('user-agent');
  if (userAgent) forwarded['User-Agent'] = userAgent;

  const address = incoming.get('x-forwarded-for') ?? incoming.get('x-real-ip');
  if (address) forwarded['X-Forwarded-For'] = address;

  return forwarded;
}

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  // MOCK MODE: no network, no env, no cookies. See lib/supabase/mock.ts for the single switch.
  if (IS_MOCK_MODE) return createMockSupabaseClient();

  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error('Supabase environment variables are not configured.');
  }

  return createServerClient(url, publishableKey, {
    global: { headers: await clientHeaders() },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot persist cookies; middleware/actions refresh them.
        }
      },
    },
  });
}
