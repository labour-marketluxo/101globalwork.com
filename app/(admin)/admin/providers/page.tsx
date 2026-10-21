import Link from 'next/link';
import { ProviderTable, AccessDenied } from '@/components/admin/AdminSections';
import { PROVIDER_QUEUES, adminFailureCopy } from '@/features/admin/copy';
import { getAdminContext } from '@/features/admin/context';
import { getProviderDirectory } from '@/features/admin/providers';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Providers', robots: { index: false, follow: false } };

/**
 * /admin/providers — the supply directory.
 *
 * ⚠️ THE QUEUES ARE DERIVED, AND THE PAGE NAMES WHAT EACH ONE MEANS. "Awaiting verification" counts
 * pending verification rows, "restricted" looks for a live hold, "credentials expiring" reads expiry
 * dates inside thirty days, "not published" reads the public profile. An operator filtering supply
 * should be able to predict what they will see, which is only true if the filter is a predicate over
 * rows rather than a label somebody remembers to keep up to date.
 *
 * ⚠️ "REQUEST INFORMATION" RECORDS A REQUEST; IT DOES NOT SEND ONE. The platform has no outbound
 * message to a provider, and the control says so rather than implying a notification was delivered. It
 * exists so "we are waiting on them" is a row on this directory that survives the operator who typed it.
 *
 * ⚠️ A RESTRICTION IS A RECORD, AND THE PAGE SAYS WHAT IT DOES NOT DO. It does not rewrite the
 * provider's own status or readiness — the command that owns an entitlement removes it. What this
 * directory guarantees is that the hold exists as a row, with a reason, an author and a date, and that
 * nothing lifts it by accident.
 */
export default async function AdminProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; queue?: string; market?: string; failed?: string; restricted?: string; lifted?: string; step_up?: string }>;
}) {
  const query = await searchParams;
  const queue = PROVIDER_QUEUES.some(option => option.value === query.queue) && query.queue ? query.queue : 'all';

  const supabase = await createSupabaseServerClient();
  const [context, directory, reasons, { data: markets }] = await Promise.all([
    getAdminContext(),
    getProviderDirectory({ search: query.q, queue, marketId: query.market }),
    getReasonCodes(),
    supabase.from('public_market_catalog').select('market_id,display_name,code').order('display_name'),
  ]);

  const failure = adminFailureCopy(query.failed);
  const canRead = Boolean(
    context?.has('platform.trust.read') || context?.has('platform.operations.read') || context?.has('platform.admin.manage'),
  );
  const canRestrict = Boolean(
    context?.has('platform.trust.moderate') || context?.has('platform.support.intervene') || context?.has('platform.admin.manage'),
  );

  // The same condition the command enforces: a factor exists but this session has not passed it.
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const stepUpPending = assurance.data?.nextLevel === 'aal2' && assurance.data?.currentLevel !== 'aal2';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Providers</p>
          <h1>What is in supply, and what is holding it back.</h1>
          <p>
            Onboarding progress, search readiness, service coverage, credential state and any operational hold
            in force. Readiness is the same number the provider sees on their own search-readiness page.
          </p>
        </div>
        <span className="admin-quick-note">Restrictions are reason-coded</span>
      </header>

      {failure ? (
        <p className="notice" role="alert">
          <strong>That did not save.</strong>
          <br />
          {failure}
        </p>
      ) : null}

      {query.step_up === '1' ? (
        <p className="notice" role="status">
          This session is now confirmed with your second factor. Try the action again — nothing was saved by
          the attempt that was refused.
        </p>
      ) : null}

      {query.restricted ? (
        <p className="notice" role="status">
          Restriction recorded. It is now the live hold on that provider, with your reason and note in the audit
          log — the provider&apos;s own status and readiness were not changed by it.
        </p>
      ) : null}

      {query.lifted ? (
        <p className="notice" role="status">
          Restriction lifted. The original row is kept, so the history of the hold — who placed it and why —
          survives alongside the reason it was lifted.
        </p>
      ) : null}

      {!canRead ? (
        <AccessDenied what="The supply directory" />
      ) : !directory.allowed ? (
        <section className="admin-section admin-panel" role="alert">
          <h2>Supply directory unavailable</h2>
          <p>
            {directory.unavailable
              ? 'The directory could not be read. Nothing has changed — reload to try again.'
              : 'Your role does not cover reading supply.'}
          </p>
        </section>
      ) : (
        <>
          <nav className="admin-queue-tabs" aria-label="Supply queues">
            {PROVIDER_QUEUES.map(option => {
              const href = `/admin/providers?queue=${option.value}${query.q ? `&q=${encodeURIComponent(query.q)}` : ''}${query.market ? `&market=${encodeURIComponent(query.market)}` : ''}`;
              return (
                <Link key={option.value} href={href} aria-current={option.value === queue ? 'true' : undefined}>
                  {option.label}
                </Link>
              );
            })}
          </nav>

          <form method="get" action="/admin/providers" className="admin-filters">
            <input type="hidden" name="queue" value={queue} />
            <div className="admin-field-group">
              <label className="admin-field-label" htmlFor="q">
                Search
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query.q ?? ''}
                placeholder="business name"
                className="admin-field"
              />
            </div>
            <div className="admin-field-group">
              <label className="admin-field-label" htmlFor="market">
                Market
              </label>
              <select id="market" name="market" defaultValue={query.market ?? ''} className="admin-field">
                <option value="">Every market</option>
                {(markets ?? []).map(market => (
                  <option key={market.market_id} value={market.market_id}>
                    {market.display_name} ({market.code})
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="secondary-button">
              Filter supply
            </button>
          </form>

          <p className="admin-incident-meta">
            <span>
              {directory.providers.length} provider{directory.providers.length === 1 ? '' : 's'} shown
            </span>
            <span>
              {canRestrict
                ? 'Placing or lifting a restriction needs a confirmed second factor on this session.'
                : 'Your role can read supply but not place a restriction on it.'}
            </span>
          </p>

          <section className="admin-section" aria-label="Providers">
            <ProviderTable
              providers={directory.providers}
              reasons={reasons.provider_restriction}
              canRestrict={canRestrict}
              stepUpPending={stepUpPending}
              queue={queue}
            />
          </section>

          <section className="admin-section admin-panel" aria-labelledby="lift-reasons-heading">
            <div className="admin-section-heading">
              <div>
                <h2 id="lift-reasons-heading">What a restriction does and does not do</h2>
                <p>
                  It records a decision: the kind of hold, the reason code, who placed it, when, and the note
                  they wrote. It does not by itself withdraw a credential, change the provider&apos;s readiness
                  score, or remove a published profile — those belong to the commands that own them, and this
                  directory links to the queues that decide them. A restriction with a review date is still in
                  force until somebody lifts it; the date is recorded, never enforced.
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
