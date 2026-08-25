'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function safeNext(value: FormDataEntryValue | null, fallback = '/') {
  const next = String(value ?? '').trim();
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  if (!host) throw new Error('Unable to resolve site origin');
  return `${proto}://${host}`;
}

export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('display_name') ?? '').trim();
  const next = safeNext(formData.get('next'), '/provider/onboarding');

  if (!email || password.length < 10) redirect(`/sign-up?error=${encodeURIComponent('Use a valid email and a password of at least 10 characters.')}&next=${encodeURIComponent(next)}`);

  const supabase = await createSupabaseServerClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  // Keep public errors intentionally generic to reduce account enumeration.
  if (error) redirect(`/sign-up?error=${encodeURIComponent('We could not complete sign up. Check your details and try again.')}&next=${encodeURIComponent(next)}`);
  redirect(`/sign-up?check_email=1&next=${encodeURIComponent(next)}`);
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'), '/');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/sign-in?error=${encodeURIComponent('Email or password was not accepted.')}&next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function signInWithGoogleAction(formData: FormData) {
  const next = safeNext(formData.get('next'), '/');
  const supabase = await createSupabaseServerClient();
  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { access_type: 'offline', prompt: 'select_account' },
    },
  });
  if (error || !data.url) redirect(`/sign-in?error=${encodeURIComponent('Google sign-in is not available right now.')}&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const supabase = await createSupabaseServerClient();
  const origin = await siteOrigin();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/account/update-password')}`,
  });
  // Always return the same result whether the account exists or not.
  redirect('/forgot-password?sent=1');
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm_password') ?? '');
  if (password.length < 10 || password !== confirm) redirect(`/account/update-password?error=${encodeURIComponent('Passwords must match and contain at least 10 characters.')}`);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/account/update-password');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/account/update-password?error=${encodeURIComponent('Password could not be updated. Please request a new recovery link.')}`);
  redirect('/?password_updated=1');
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/');
}
