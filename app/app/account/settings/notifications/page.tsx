import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LINK_ARROW } from '@/components/discovery/tokens';
import {
  PreferenceMatrix,
  PreferenceNotice,
  PreferenceUnavailable,
} from '@/components/settings/NotificationPreferenceMatrix';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { NOTIFICATIONS_PATH, NOTIFICATION_SETTINGS_PATH } from '@/features/settings/paths';
import { preferenceFailureCode, PREFERENCE_FAILURE_COPY } from '@/features/settings/copy';
import { getMyNotificationPreferences } from '@/features/settings/notification-preferences';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Notification preferences — /settings/notifications.
 *
 * ⚠️ THE MATRIX IS THE WHOLE PAGE. No summary cards, no "recommended" preset, no bulk "turn everything off".
 * This is the screen where somebody with a specific reason — "stop emailing me about quotes, I read them in the
 * app" — comes to make a specific change, and a preset would take that control away while looking like it
 * added one.
 *
 * ⚠️ THE SAFETY EXCEPTION IS VISIBLE, NOT HIDDEN. Security, legal and payment-dispute rows carry a Mandatory
 * badge, their controls are disabled, and the reason is on the row rather than in a footnote — because the one
 * question this page has to answer is "why can I not switch this off", and it is answered where it is asked.
 */
export const metadata: Metadata = {
  title: 'Notification preferences',
  description: 'Which events reach you, on which channel.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; changed?: string }>;

export default async function NotificationSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: NOTIFICATION_SETTINGS_PATH }));

  const preferences = await getMyNotificationPreferences();
  const failure = preferenceFailureCode(params.failed);
  const changed = typeof params.changed === 'string' && params.changed.length > 0;

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Notification preferences
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Choose what reaches you and how. Each switch applies on its own the moment you press it — there is
          nothing to save, and nothing changes that you did not ask for.
        </p>
      </header>

      {failure ? <PreferenceNotice tone="warning">{PREFERENCE_FAILURE_COPY[failure]}</PreferenceNotice> : null}
      {changed ? (
        <PreferenceNotice tone="success">
          Saved. New notices of that kind will follow the new setting from here; anything already sent is not
          recalled.
        </PreferenceNotice>
      ) : null}

      {!preferences.available ? (
        <PreferenceUnavailable />
      ) : (
        <>
          <PreferenceMatrix preferences={preferences} />
          <p className="text-xs leading-relaxed text-slate-500">
            What has already happened is on{' '}
            <Link href={NOTIFICATIONS_PATH} className={LINK_ARROW}>
              the notifications page
            </Link>
            ; these settings decide what the platform sends you in future.
          </p>
        </>
      )}
    </div>
  );
}
