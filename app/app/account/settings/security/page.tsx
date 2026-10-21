import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  FactorsPanel,
  PasswordPanel,
  RecoveryPanel,
  SecurityNotice,
  SecurityUnavailable,
  SessionsPanel,
} from '@/components/settings/SecuritySections';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { SECURITY_PATH } from '@/features/settings/paths';
import {
  securityFailureCode,
  securitySuccessCode,
  SECURITY_FAILURE_COPY,
  SECURITY_SUCCESS_COPY,
} from '@/features/settings/copy';
import { getMySecurityOverview, verifiedFactorTypes } from '@/features/settings/security';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Account protection — /settings/security.
 *
 * ⚠️ THE STEP-UP RULE IS STATED BEFORE IT IS INVOKED. Whether this session has passed the account's second
 * factor decides what happens when somebody presses Change password or Remove factor: they are either acting,
 * or they are about to be sent to /auth/challenge. The page reads that from the same assurance level the
 * actions read, so the warning and the behaviour cannot disagree.
 *
 * ⚠️ THE EMAIL COMES FROM THE SESSION, NOT FROM A QUERY. `auth.getUser()` already returns the address and its
 * confirmation timestamp, which is exactly what the recovery panel needs to say whether a recovery link could
 * reach anybody. Fetching the whole identity document for one field would pull a four-hundred-entry timezone
 * list onto this page for nothing.
 */
export const metadata: Metadata = {
  title: 'Security',
  description: 'Your password, second factor, recovery and signed-in devices.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; changed?: string }>;

export default async function SecuritySettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: SECURITY_PATH }));

  const security = await getMySecurityOverview();
  const failure = securityFailureCode(params.failed);
  const success = securitySuccessCode(params.changed);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Security
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Everything that stands between somebody else and your account, in one place — and, where the platform
          cannot do something, a plain statement of that rather than a control that would not work.
        </p>
      </header>

      {failure ? <SecurityNotice tone="warning">{SECURITY_FAILURE_COPY[failure]}</SecurityNotice> : null}
      {success ? <SecurityNotice tone="success">{SECURITY_SUCCESS_COPY[success]}</SecurityNotice> : null}

      {!security.available ? (
        <SecurityUnavailable />
      ) : (
        <>
          {security.assurance.stepUpRequired ? (
            <SecurityNotice tone="info">
              This session has not passed your second factor yet. Changing the password or removing a factor will
              ask for your authenticator code first, and land you back here afterwards.
            </SecurityNotice>
          ) : null}

          <PasswordPanel stepUpPending={security.assurance.stepUpRequired} />
          <FactorsPanel factors={security.factors} stepUpPending={security.assurance.stepUpRequired} />
          <RecoveryPanel
            email={user.email ?? null}
            emailVerified={Boolean(user.email_confirmed_at)}
            factorCount={verifiedFactorTypes(security.factors).length}
          />
          <SessionsPanel
            total={security.sessions.total}
            others={security.sessions.others}
            stepUpPending={security.assurance.stepUpRequired}
          />
        </>
      )}
    </div>
  );
}
