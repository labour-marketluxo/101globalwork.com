import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  CurrentSessionPanel,
  DangerZone,
  LocationDisclosure,
  OtherSessionsPanel,
  SessionsActionNotice,
  SessionsSkeleton,
  SuspiciousActivityCallout,
} from '@/components/settings/SessionSections';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import {
  SESSION_FAILURE_COPY,
  SESSIONS_PATH,
  sessionFailureCode,
} from '@/features/settings/paths';
import { getMySessions, summariseSessions } from '@/features/settings/sessions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Active sessions and devices — /settings/security/sessions
 *
 * WHAT THE PLATFORM CAN AND CANNOT DO HERE, established by probing rather than assumed, because the
 * answer decides what this page is allowed to promise:
 *
 *   LIST  — no API. There is no session endpoint in this project's GoTrue (three candidates 404), and
 *           the JS client exposes only signOut(jwt, scope). The list therefore comes from GoTrue's own
 *           session table through get_my_sessions_command, scoped to auth.uid(). The full reasoning,
 *           including why the projection is an allowlist, is in the migration.
 *
 *   REVOKE ONE — same RPC family, and the mechanism had to be corrected mid-build: marking refresh
 *           tokens revoked left the device able to refresh (measured: 200 with a fresh access token),
 *           so revocation deletes the session row. Measured after the change: the same refresh returns
 *           400 refresh_token_not_found.
 *
 *   REVOKE ALL OTHERS — also the RPC family, for one reason worth stating: GoTrue's own
 *           signOut({ scope: 'others' }) would do this through the supported API, but @supabase/ssr
 *           clears the calling session's cookies on any signOut, which would sign out the device the
 *           visitor is holding — the one session the action is supposed to leave alone.
 *
 * NOINDEX, and not via robots.txt: a disallowed URL cannot be crawled, so its noindex tag can never
 * be read. Same reasoning as the /auth subtree.
 */
export const metadata: Metadata = {
  title: 'Active sessions & devices',
  description: 'Devices currently signed in to your account.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ revoked?: string; ended?: string; failed?: string }>;

export default async function ActiveSessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: SESSIONS_PATH }));

  const ended = Number.parseInt(params.ended ?? '', 10);
  const failure = sessionFailureCode(params.failed);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Active Sessions &amp; Devices
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Review devices currently signed in to your account and revoke access if anything looks
          suspicious.
        </p>
      </header>

      {failure ? <FailureNotice>{SESSION_FAILURE_COPY[failure]}</FailureNotice> : null}

      {params.revoked === '1' ? (
        <SessionsActionNotice>
          That device has been signed out and will not be given a new token. Its browser tab may keep
          looking signed in until it next tries to refresh, which is within the hour.
        </SessionsActionNotice>
      ) : null}

      {Number.isFinite(ended) ? (
        <SessionsActionNotice>
          {ended > 0
            ? `Signed out ${ended} other device${ended === 1 ? '' : 's'}. Each one keeps working until it next needs a token, and it will not get one.`
            : 'No other device was signed in, so nothing changed. This device is still signed in.'}
        </SessionsActionNotice>
      ) : null}

      {/* The boundary goes AFTER the guard, never around it: a route-level loading.tsx would flush a
          200 shell before the redirect above could run, turning a signed-out visit into a soft 404. */}
      <Suspense fallback={<SessionsSkeleton />}>
        <SessionsBody />
      </Suspense>

      <LocationDisclosure />
    </div>
  );
}

/**
 * The reads, behind the boundary.
 *
 * `now` is created once here rather than per row, so every relative label on the page is measured
 * against the same instant — two rows rendered a moment apart would otherwise be able to disagree.
 */
async function SessionsBody() {
  const now = new Date();
  const supabase = await createSupabaseServerClient();

  const [{ sessions, unavailable }, { data: assurance }] = await Promise.all([
    getMySessions(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  const summary = summariseSessions(sessions);

  /**
   * Whether the danger zone will be interrupted by a challenge. The same condition the action
   * enforces — `nextLevel` is aal2 because the account HAS a verified factor, `currentLevel` is not
   * because this session has not passed it yet. The page states this up front so nobody meets a
   * second-factor prompt they were not warned about.
   */
  const stepUpPending = assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2';

  return (
    <div className="grid gap-6">
      <SuspiciousActivityCallout summary={summary} />

      {summary.current ? (
        <CurrentSessionPanel session={summary.current} now={now} stepUpPending={stepUpPending} />
      ) : null}

      <OtherSessionsPanel sessions={summary.others} now={now} unavailable={unavailable} />

      {summary.current ? (
        <DangerZone
          otherCount={summary.others.length}
          stepUpPending={stepUpPending}
          unavailable={unavailable}
        />
      ) : null}
    </div>
  );
}

/** The amber failure box. `role="alert"` because the visitor just pressed a button. */
function FailureNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-solid border-secondary bg-secondary-light p-4 text-sm leading-relaxed text-amber-900"
    >
      <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
      <div>
        {children}
        <p className="mt-1">
          <Link
            href={SESSIONS_PATH}
            className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-800"
          >
            Reload this page
          </Link>{' '}
          to see the current list.
        </p>
      </div>
    </div>
  );
}
