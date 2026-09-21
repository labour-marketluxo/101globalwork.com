import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, safeInternalPath } from '@/features/auth/post-auth';

/**
 * The shared landing point for every link the auth provider sends back: email confirmation, magic
 * links, password recovery and the Google redirect.
 *
 * It exchanges whatever credential arrived (a PKCE `code`, or a `token_hash` with a `type`) for a
 * session, then forwards the visitor to the destination that rode through the flow in `next`.
 *
 * ON FAILURE IT GOES TO SIGN-IN WITH A CODE, not a sentence. The code is `link_expired`, whose copy
 * covers both reasons an email link fails — already used, or past its expiry — and the sign-in page
 * renders it from its own vocabulary. A caller-supplied string would be discarded there anyway (the
 * parameter is user-editable and echoing it inside the sign-in card is a phishing primitive; see
 * the header of post-auth.ts), so this is the same information in the form the page accepts.
 *
 * 303, not 307: the answer to a GET that consumed a one-time token must not be replayed, and 303
 * makes every client follow up with a GET of the destination rather than re-issuing the original
 * request. The old path validation that used to live here is now `safeInternalPath`, shared with
 * the actions — it was already the second copy of that rule.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeInternalPath(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const supabase = await createSupabaseServerClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  const target = request.nextUrl.clone();
  target.pathname = ok ? next : AUTH_PATHS.signIn;
  target.search = ok ? '' : '?error=link_expired';
  return NextResponse.redirect(target, 303);
}
