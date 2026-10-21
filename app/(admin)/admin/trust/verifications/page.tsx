import Link from 'next/link';
import { ArrowRight } from '@/components/ui/icons';
import { StatusBadge } from '@/components/admin/TrustSections';
import { ACCESS_NOTE } from '@/components/admin/trust-copy';
import { getAdminContext } from '@/features/admin/context';
import { maskContact } from '@/features/auth/post-auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Verification queue', robots: { index: false, follow: false } };

/**
 * /admin/trust/verifications — the verification review queue.
 *
 * ⚠️ THIS IS THE PAGE THE OLD /admin/verifications BECAME, AND THE OLD PATH REDIRECTS HERE. It moved because
 * a per-submission review hub needed a parent that could link to it, and the trust namespace is where the
 * credential queue and the case queue now live too. The owner's contact is masked here for the same reason it
 * is masked on the review hub: deciding a submission does not require an address on a screen operators share.
 *
 * ⚠️ IT READS THROUGH THE EXISTING RECORDS COMMAND rather than a new one. That read already returns every
 * submission with its provider, owner and review note; adding a second query for the same rows would be a
 * second place for the queue and the record to disagree.
 */
export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; status?: string }>;
}) {
  const query = await searchParams;
  const [context, supabase] = await Promise.all([getAdminContext(), createSupabaseServerClient()]);
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

  const { data, error } = await supabase.rpc('admin_verification_records_command', { p_limit: 100 });
  if (error) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>The queue could not be read</h1>
          <p>
            Either your role cannot read the verification queue — it needs the trust read or trust verify
            capability — or the read failed. Nothing has changed; reload to try again, and ask a trust lead if
            it keeps happening.
          </p>
        </section>
      </div>
    );
  }

  type Record = {
    id: string;
    provider_id: string;
    provider_name: string;
    account_id: string;
    owner_name: string;
    owner_email?: string | null;
    kind: string;
    status: string;
    jurisdiction_code?: string | null;
    reference_label?: string | null;
    created_at: string;
    reviewed_at?: string | null;
    review_note?: string | null;
    reviewer_name?: string | null;
  };

  const all = (Array.isArray(data) ? data : []) as Record[];
  const scoped = query.provider ? all.filter(record => record.provider_id === query.provider) : all;
  const pending = scoped.filter(record => record.status === 'pending');
  const settled = scoped.filter(record => record.status !== 'pending');

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Trust · verifications</p>
          <h1>Submissions waiting on a decision.</h1>
          <p>
            Each row opens the review hub: the claim, the document reference on file, the checks the platform
            ran and every decision already recorded against it.
          </p>
        </div>
        <Link className="secondary-button" href="/admin/trust">Trust overview</Link>
      </header>

      {query.provider ? (
        <p className="notice" role="status">
          Showing one provider&apos;s submissions ({scoped.length} of {all.length}).{' '}
          <Link href="/admin/trust/verifications">Show every provider</Link>.
        </p>
      ) : null}

      <section className="admin-section" aria-labelledby="pending-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="pending-heading">Awaiting review</h2>
            <p>Only a pending submission can be decided, and every decision needs a reason code.</p>
          </div>
          <span>{pending.length}</span>
        </div>

        {pending.length === 0 ? (
          <p className="empty-admin">
            Nothing is waiting. A submission appears here the moment a provider files one, and an approved or
            refused one moves to the history below.
          </p>
        ) : (
          <div className="admin-list">
            {pending.map(record => (
              <article key={record.id}>
                <div>
                  <strong>
                    {record.provider_name} · {record.kind.replaceAll('_', ' ')}
                    {' '}
                    <StatusBadge status={record.status} kind="verification" />
                  </strong>
                  <span>
                    {record.jurisdiction_code ? `Jurisdiction ${record.jurisdiction_code}` : 'No jurisdiction supplied'}
                    {record.reference_label ? ` · ref ${record.reference_label}` : ' · no reference given'}
                  </span>
                  <span>
                    Owner {record.owner_name}
                    {/* ⚠️ MASKED HERE TOO. The queue is a screen operators scroll through together, and the
                        raw address is one audited action away on the account page. */}
                    {maskContact(record.owner_email) ? ` · ${maskContact(record.owner_email)}` : ''}
                  </span>
                  <span>Submitted {new Date(record.created_at).toLocaleString('en-GB')}</span>
                </div>
                <Link className="text-button" href={`/admin/trust/verifications/${record.id}`}>
                  Open review <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-section" aria-labelledby="history-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="history-heading">Decided</h2>
            <p>
              Approved and refused submissions stay visible with the reviewer&apos;s note, because the note is
              what a later reviewer reads.
            </p>
          </div>
          <span>{settled.length}</span>
        </div>
        {settled.length === 0 ? (
          <p className="empty-admin">No verification has been decided yet.</p>
        ) : (
          <div className="admin-list">
            {settled.map(record => (
              <article key={record.id}>
                <div>
                  <strong>
                    {record.provider_name} · {record.kind.replaceAll('_', ' ')}
                    {' '}
                    <StatusBadge status={record.status} kind="verification" />
                  </strong>
                  {record.review_note ? <span>{record.review_note}</span> : <span>No note recorded</span>}
                  <span>
                    {record.reviewer_name ? `Decided by ${record.reviewer_name}` : 'Decision audited'}
                    {record.reviewed_at ? ` · ${new Date(record.reviewed_at).toLocaleString('en-GB')}` : ''}
                  </span>
                </div>
                <Link className="text-button" href={`/admin/trust/verifications/${record.id}`}>
                  Open the record
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
