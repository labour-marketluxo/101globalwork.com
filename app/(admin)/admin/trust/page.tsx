import Link from 'next/link';
import { ACCESS_NOTE } from '@/components/admin/trust-copy';
import { getAdminContext } from '@/features/admin/context';
import { getCredentialQueue, getTrustCases } from '@/features/admin/trust';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Trust and safety', robots: { index: false, follow: false } };

/**
 * /admin/trust — the way into the three trust queues.
 *
 * ⚠️ THE COUNTS COME FROM THE SAME READS THE QUEUES USE. A hub that computed "pending verifications" its own
 * way would be the first place the number and the queue disagreed, and the hub is where somebody decides
 * whether to open the queue at all.
 */
export default async function TrustHubPage() {
  const supabase = await createSupabaseServerClient();
  const [context, verifications, credentials, cases] = await Promise.all([
    getAdminContext(),
    supabase.rpc('admin_verification_records_command', { p_limit: 200 }),
    getCredentialQueue({ status: 'pending' }),
    getTrustCases({}),
  ]);

  const canRead = Boolean(context?.has('platform.trust.read') || context?.has('platform.trust.verify') || context?.has('platform.trust.moderate') || context?.has('platform.admin.manage'));
  if (!canRead) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>{ACCESS_NOTE}</p>
        </section>
      </div>
    );
  }

  // ⚠️ A FAILED READ IS NOT A ZERO. The records command accepts the trust read and verify capabilities while
  // this hub is reachable by moderate and administrator roles too, so a refusal here must not render as "0
  // awaiting review" — that is a number an operator would believe.
  const verificationCount = verifications.error
    ? 'not readable by your role'
    : `${(Array.isArray(verifications.data) ? verifications.data as { status?: string }[] : []).filter(record => record.status === 'pending').length} awaiting review`;
  const credentialCount = credentials.allowed
    ? `${credentials.credentials.length} awaiting review`
    : 'not readable by your role';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Trust &amp; safety</p>
          <h1>Review, verify and moderate.</h1>
          <p>
            Three queues, each with its own history: the claims providers make about themselves, the licences
            they hold, and the cases where somebody has raised a concern about a person or a business.
          </p>
        </div>
        <span className="admin-quick-note">Decisions are reason-coded</span>
      </header>

      <section className="admin-section">
        <div className="admin-module-grid">
          <Link href="/admin/trust/verifications">
            <strong>Verification queue</strong>
            <span>
              {verificationCount} · identity, business and address claims, with the checks the platform can run
              and every decision already recorded
            </span>
          </Link>
          <Link href="/admin/trust/credentials">
            <strong>Credential queue</strong>
            <span>
              {credentialCount} · licences, certifications and insurance, with the service categories each one
              covers
            </span>
          </Link>
          <Link href="/admin/trust/cases">
            <strong>Moderation &amp; safety cases</strong>
            <span>
              {cases.counts.open + cases.counts.investigating + cases.counts.escalated + cases.counts.awaitingResponse} open
              {cases.counts.overdue > 0 ? ` · ${cases.counts.overdue} past SLA` : ''}
              {cases.counts.held > 0 ? ` · ${cases.counts.held} under legal hold` : ''}
            </span>
          </Link>
        </div>
      </section>

      <section className="admin-section admin-panel" aria-labelledby="limits-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="limits-heading">What these consoles can and cannot check</h2>
            <p>
              The platform stores the reference a provider types and makes no call to an identity service, a
              business registry or an issuer. Every decision here is a person&apos;s judgement, recorded with the
              reason code, the note and the policy version it was made under — and the checks shown beside a
              claim are comparisons over the platform&apos;s own rows, not a risk score.
            </p>
          </div>
        </div>
        <p className="admin-incident-meta">
          <span>
            Deciding a verification or a credential, holding a case and restricting an account each need a
            confirmed second factor on your session. If your account has no authenticator enrolled, those
            controls will tell you so and point at account security rather than failing silently.
          </span>
        </p>
      </section>
    </div>
  );
}
