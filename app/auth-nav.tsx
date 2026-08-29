'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type SessionView = { signedIn: boolean; email?: string | null } | null;

export default function AuthNav() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<SessionView>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setSession({ signedIn: Boolean(data.user), email: data.user?.email });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession({ signedIn: Boolean(nextSession?.user), email: nextSession?.user?.email });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

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
