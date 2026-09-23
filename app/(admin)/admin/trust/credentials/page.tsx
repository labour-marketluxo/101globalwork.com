import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { StatusBadge } from '@/components/admin/TrustSections';
import { ACCESS_NOTE } from '@/components/admin/trust-copy';
import { getAdminContext } from '@/features/admin/context';
import { getCredentialQueue } from '@/features/admin/trust';

export const metadata = { title: 'Credential queue', robots: { index: false, follow: false } };

/**
 * /admin/trust/credentials — licence and certification submissions.
 *
 * ⚠️ THE QUEUE SHOWS WHAT DECIDING EACH ONE WOULD COST. How many service categories a credential covers, and
 * whether it has already lapsed, are the two facts that change how quickly somebody should look at it — and
 * both come from the credential row rather than from a summary somebody maintains.
 */
export default async function CredentialQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const query = await searchParams;
  const status = ['pending', 'verified', 'rejected', 'expired', 'not_started'].includes(query.status ?? '')
    ? query.status
    : 'all';

  const [context, queue] = await Promise.all([
    getAdminContext(),
    getCredentialQueue({ status, search: query.q }),
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

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Trust · credentials</p>
          <h1>Licences, certifications and insurance.</h1>
          <p>
            Each row opens the validation hub: the issuing body, the jurisdiction, the document reference on
            file, the categories it covers and every decision recorded against it.
          </p>
        </div>
        <Link className="secondary-button" href="/admin/trust">Trust overview</Link>
      </header>

      <nav className="admin-queue-tabs" aria-label="Credential status">
        {[
          { value: 'all', label: 'Every credential' },
          { value: 'pending', label: 'Awaiting review' },
          { value: 'verified', label: 'Verified' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'expired', label: 'Expired' },
        ].map(option => {
          const href = `/admin/trust/credentials?status=${option.value}${query.q ? `&q=${encodeURIComponent(query.q)}` : ''}`;
          return (
            <Link key={option.value} href={href} aria-current={option.value === status ? 'true' : undefined}>
              {option.label}
            </Link>
          );
        })}
      </nav>

      <form method="get" action="/admin/trust/credentials" className="admin-filters">
        <input type="hidden" name="status" value={status} />
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={query.q ?? ''} placeholder="provider or issuing body" className="admin-field" />
        </div>
        <button type="submit" className="secondary-button">Search</button>
        {query.q ? <Link className="text-button" href={`/admin/trust/credentials?status=${status}`}>Clear</Link> : null}
      </form>

      {!queue.allowed ? (
        <section className="admin-section admin-panel" role="alert">
          <h2>{queue.unavailable ? 'The credential queue could not be read' : 'Not available to your role'}</h2>
          <p>
            {queue.unavailable
              ? 'Nothing has changed. Reload the page to try again.'
              : ACCESS_NOTE}
          </p>
        </section>
      ) : queue.credentials.length === 0 ? (
        <p className="empty-admin">
          No credential matches that filter. Providers file these from their own credentials screen, and each
          one appears here as soon as it is submitted.
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Credential submissions awaiting or having had review</caption>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Credential</th>
                <th scope="col">Issuer and jurisdiction</th>
                <th scope="col">Expiry</th>
                <th scope="col">Impact</th>
                <th scope="col">State</th>
                <th scope="col">Open</th>
              </tr>
            </thead>
            <tbody>
              {queue.credentials.map(item => (
                <tr key={item.credentialId}>
                  <td>
                    <strong>{item.providerName}</strong>
                    <small>Provider is {item.providerStatus.replaceAll('_', ' ')}</small>
                  </td>
                  <td>
                    <small>{item.credentialType.replaceAll('_', ' ')}</small>
                    <small>{item.referenceLabel ?? 'No reference given'}</small>
                  </td>
                  <td>
                    <small>{item.issuingBody}</small>
                    <small>{item.jurisdictionCode ?? 'Jurisdiction not supplied'}</small>
                  </td>
                  <td>
                    <small>
                      {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString('en-GB') : 'No expiry recorded'}
                      {item.expired ? ' · expired' : item.expiringSoon ? ' · expiring soon' : ''}
                    </small>
                  </td>
                  <td>
                    <small>
                      {item.serviceCount === 0
                        ? 'Covers the whole business as far as the platform knows'
                        : `${item.serviceCount} service categor${item.serviceCount === 1 ? 'y' : 'ies'}`}
                    </small>
                    <small>{item.decisionCount} decision{item.decisionCount === 1 ? '' : 's'} recorded</small>
                  </td>
                  <td>
                    <StatusBadge status={item.status} kind="credential" />
                    {item.reviewNote ? <small>{item.reviewNote}</small> : null}
                  </td>
                  <td>
                    <Link className="text-button" href={`/admin/trust/credentials/${item.credentialId}`}>
                      Open review <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
