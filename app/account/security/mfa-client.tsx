'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

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

  async function readSecurityState() {
    return Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
  }

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
  }, [supabase]);

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
    if (verifyError) { setError(verifyError.message); return; }
    setEnrollment(null); setCode('');
    await applyLatestSecurityState();
    window.location.assign(nextPath);
  }

  async function stepUp() {
    const factor = verifiedFactors[0];
    if (!factor || code.trim().length < 6) return;
    setError('');
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (verifyError) { setError(verifyError.message); return; }
    setCode('');
    await applyLatestSecurityState();
    window.location.assign(nextPath);
  }

  if (loading) return <p className="notice">Checking security status…</p>;
  if (currentLevel === 'aal2') return <div className="notice"><strong>Strong authentication active.</strong><br />This session is ready for sensitive Finance and ownership actions. <a href={nextPath}>Continue</a>.</div>;

  return <div className="action-panel">
    <p className="eyebrow">Authenticator app</p>
    <h2>{verifiedFactors.length ? 'Confirm it’s you' : 'Protect sensitive actions'}</h2>
    <p>{verifiedFactors.length ? 'Enter the current 6-digit code from your authenticator app to raise this session to AAL2.' : 'Set up a TOTP authenticator once. Finance payouts, dispute clearance, ownership transfer and other sensitive actions require this stronger session.'}</p>
    {error ? <p className="notice" role="alert">{error}</p> : null}
    {!verifiedFactors.length && !enrollment ? <button type="button" onClick={startEnrollment}>Set up authenticator</button> : null}

    {enrollment ? <div className="stack-form">
      <p>Scan this QR code using Google Authenticator, Microsoft Authenticator, 1Password, Authy, or another TOTP app.</p>
      <Image src={enrollment.qr} alt="Authenticator enrollment QR code" width={220} height={220} unoptimized />
      <details><summary>Can’t scan?</summary><p>Enter this secret manually in your authenticator app:</p><code>{enrollment.secret}</code></details>
      <label htmlFor="mfa-enroll-code">6-digit code</label>
      <input id="mfa-enroll-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" />
      <button type="button" onClick={verifyEnrollment}>Enable and continue</button>
    </div> : null}

    {verifiedFactors.length && !enrollment ? <div className="stack-form">
      <label htmlFor="mfa-stepup-code">Authenticator code</label>
      <input id="mfa-stepup-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" />
      <button type="button" onClick={stepUp}>Verify and continue</button>
    </div> : null}
  </div>;
}
