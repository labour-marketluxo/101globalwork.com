'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type SessionView = { signedIn: boolean; email?: string | null } | null;

export default function AuthNav() {
  const [session, setSession] = useState<SessionView>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    try {
      // Browser auth is created only after hydration so static/public pages can
      // prerender in CI without requiring browser credentials there.
      const supabase = createSupabaseBrowserClient();
      void supabase.auth.getUser().then(({ data }) => {
        if (active) setSession({ signedIn: Boolean(data.user), email: data.user?.email });
      });
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (active) setSession({ signedIn: Boolean(nextSession?.user), email: nextSession?.user?.email });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Anonymous navigation is already the passive fallback when browser auth
      // configuration is absent (for example in static CI prerendering).
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  if (session?.signedIn) {
    return <nav aria-label="Primary navigation">
      <Link href="/services" className="nav-discovery">Find services</Link>
      <Link href="/provider">Provider workspace</Link>
      <Link href="/account/security" title={session.email ?? undefined}>Account</Link>
    </nav>;
  }

  return <nav aria-label="Primary navigation">
    <Link href="/services" className="nav-discovery">Find services</Link>
    <Link href="/providers">Become a provider</Link>
    <Link href="/sign-in">Sign in</Link>
    <Link href="/sign-up?intent=customer&next=/" className="header-cta">Create account</Link>
  </nav>;
}
