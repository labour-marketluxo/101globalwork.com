'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LABEL } from '@/components/discovery/tokens';
import { AUTH_CTA, AUTH_TEXT_BUTTON, AuthNotice } from '@/components/auth/AuthSections';
import { OtpInput } from '@/components/auth/OtpInput';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * The TOTP authenticator flow — enrol a factor, or raise the session to AAL2.
 *
 * TWO CALL SITES, ONE COMPONENT, which is why it no longer lives inside a route folder:
 *
 *   /account/security   where a signed-in person sets up or manages their factor
 *   /auth/challenge     where sign-in sends someone who already has one, before the session is
 *                       allowed near the destination they asked for
 *
 * It sits in components/auth rather than beside one of those pages because cross-importing a
 * colocated route file is how two pages end up with two copies of a security flow, and the second
 * copy is the one that misses a fix.
 *
 * WHY THIS ONE IS CLIENT-SIDE when the rest of the auth surface is server-rendered: the challenge
 * has to run against the browser's own session, and `challengeAndVerify` rotates the access token
 * in that session. Doing it server-side would mean passing a one-time code through a form action and
 * then keeping two session stores in step. The cost is that this page needs JavaScript to complete;
 * the password sign-in that leads to it does not.
 */

type Enrollment = { factorId: string; qr: string; secret: string } | null;
type Factor = { id: string; friendly_name?: string | null; status?: string };

export default function MfaClient({ nextPath }: { nextPath: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [currentLevel, setCurrentLevel] = useState<string>('aal1');
  const [verifiedFactors, setVerifiedFactors] = useState<Factor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  /** Which enrolled authenticator is being used. Only meaningful when there is more than one. */
  const [factorIndex, setFactorIndex] = useState(0);
  /**
   * Failed verifications in this session.
   *
   * The provider rate-limits repeated attempts rather than locking the account, so this counter is
   * the platform's own — it exists to give guidance before the provider starts refusing outright
   * ("try again in a moment" is a better experience than a wall after the fifth try), and to point
   * at account recovery once it is clear the device is not going to produce a working code.
   */
  const [attempts, setAttempts] = useState(0);

  const readSecurityState = useCallback(
    () =>
      Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]),
    [supabase],
  );

  async function applyLatestSecurityState() {
    setLoading(true);
    const [aal, factors] = await readSecurityState();
    if (aal.error) setError(aal.error.message);
    if (factors.error) setError(factors.error.message);
    setCurrentLevel(aal.data?.currentLevel ?? 'aal1');
    setVerifiedFactors((factors.data?.totp ?? []).filter(factor => factor.status === 'verified') as Factor[]);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    void readSecurityState().then(([aal, factors]) => {
      if (!active) return;
      if (aal.error) setError(aal.error.message);
      if (factors.error) setError(factors.error.message);
      setCurrentLevel(aal.data?.currentLevel ?? 'aal1');
      setVerifiedFactors((factors.data?.totp ?? []).filter(factor => factor.status === 'verified') as Factor[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [readSecurityState, supabase]);

  async function startEnrollment() {
    setError('');
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: '101GlobalWork authenticator' });
    if (enrollError) { setError(enrollError.message); return; }
    setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verifyEnrollment() {
    if (!enrollment || code.trim().length < 6) return;
    setError('');
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: code.trim() });
    if (verifyError) { setError(verifyError.message); setCode(''); return; }
    setEnrollment(null); setCode('');
    await applyLatestSecurityState();
    window.location.assign(nextPath);
  }

  async function stepUp() {
    // The selected factor, not simply the first one: someone with two authenticators enrolled (an
    // old phone and a new one) needs to be able to say which is producing the code.
    const factor = verifiedFactors[factorIndex] ?? verifiedFactors[0];
    if (!factor || code.trim().length < 6) return;
    setError('');
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (verifyError) {
      setError(verifyError.message);
      // Clear the field: a rejected code is useless, and leaving it in place invites a second
      // submit of the same six digits. The next code is 30 seconds away.
      setCode('');
      setAttempts((count) => count + 1);
      return;
    }
    setCode('');
    await applyLatestSecurityState();
    window.location.assign(nextPath);
  }

  if (loading) return <p className="text-sm text-slate-600" role="status">Checking security status…</p>;
  if (currentLevel === 'aal2') return (
    <div className="grid gap-4">
      <AuthNotice tone="success" title="Strong authentication is active.">
        This session is ready for sensitive finance and ownership actions, and nothing else is
        needed here.
      </AuthNotice>
      <Link href={nextPath} className={AUTH_CTA}>
        Continue
      </Link>
    </div>
  );

  const activeFactor = verifiedFactors[factorIndex] ?? verifiedFactors[0];

  return <div className="grid gap-5">
    <div>
      <p className={LABEL}>{verifiedFactors.length ? 'Authenticator app' : 'Protect sensitive actions'}</p>
      <h2 className="text-lg font-bold tracking-tight text-slate-900">
        {verifiedFactors.length ? 'Enter the current code' : 'Set up an authenticator'}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        {verifiedFactors.length
          ? 'Open your authenticator app and type the 6-digit code it is showing for 101GlobalWork. The code changes every 30 seconds.'
          : 'Set up a TOTP authenticator once. Finance payouts, dispute clearance, ownership transfer and other sensitive actions require this stronger session.'}
      </p>
    </div>

    {error ? (
      <AuthNotice tone="error">
        {error}
        {attempts >= 3 ? (
          <>
            {' '}
            Repeated failures usually mean the app and the server have drifted apart — check the
            time on the device, or remove and re-add the factor from{' '}
            <Link href="/account/security" className="font-semibold underline underline-offset-2">
              account security
            </Link>
            .
          </>
        ) : null}
      </AuthNotice>
    ) : null}

    {!verifiedFactors.length && !enrollment ? (
      <div>
        <button type="button" onClick={startEnrollment} className={AUTH_CTA}>
          Set up authenticator
        </button>
      </div>
    ) : null}

    {enrollment ? (
      <div className="grid gap-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password, Authy, or
          another TOTP app.
        </p>
        <Image
          src={enrollment.qr}
          alt="Authenticator enrolment QR code"
          width={220}
          height={220}
          unoptimized
          className="rounded-lg border border-solid border-slate-200"
        />
        <details>
          <summary className="cursor-pointer font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Can&rsquo;t scan it?
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Enter this secret in your authenticator app by hand:
          </p>
          <code className="mt-1 block break-all rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-800">
            {enrollment.secret}
          </code>
        </details>
        <OtpInput label="6-digit code" autoFocus onValueChange={setCode} />
        <button type="button" onClick={verifyEnrollment} disabled={code.length < 6} className={AUTH_CTA}>
          Enable &amp; Continue
        </button>
      </div>
    ) : null}

    {verifiedFactors.length && !enrollment ? (
      <div className="grid gap-4">
        <OtpInput label="Authenticator code" autoFocus onValueChange={setCode} />
        <button type="button" onClick={stepUp} disabled={code.length < 6} className={AUTH_CTA}>
          Verify Challenge
        </button>

        {/* Only rendered when there IS another authenticator to switch to. A "try another method"
            affordance with one method behind it is a button that cannot do anything, which is
            worse than no button at all. */}
        {verifiedFactors.length > 1 ? (
          <button
            type="button"
            onClick={() => { setFactorIndex((index) => (index + 1) % verifiedFactors.length); setCode(''); setError(''); }}
            className={AUTH_TEXT_BUTTON}
          >
            Try another method ({activeFactor?.friendly_name ?? `authenticator ${factorIndex + 1}`} ·{' '}
            {factorIndex + 1} of {verifiedFactors.length})
          </button>
        ) : null}
      </div>
    ) : null}

    {verifiedFactors.length ? (
      <p className="border-t border-solid border-slate-200 pt-4 text-xs leading-relaxed text-slate-600">
        <span className="font-semibold text-slate-900">No backup codes.</span> The platform does not
        issue them: the authentication provider has no such concept, so offering a &ldquo;use a
        backup code&rdquo; link here would be a dead end at the worst possible moment. Recovery is
        by account recovery with access to the email address, or by asking support to remove the
        factor — which needs someone who can already sign in, and that is the point of it.
      </p>
    ) : null}
  </div>;
}
