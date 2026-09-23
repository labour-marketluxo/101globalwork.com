import Link from 'next/link';
import { AccountTable, AccessDenied } from '@/components/admin/AdminSections';
import { ACCOUNT_STANDINGS, STANDING_COPY, adminFailureCopy } from '@/features/admin/copy';
import { getAccountDirectory } from '@/features/admin/accounts';
import { getAdminContext } from '@/features/admin/context';

export const metadata = { title: 'Accounts', robots: { index: false, follow: false } };

/**
 * /admin/accounts — the human-account directory.
 *
 * ⚠️ THE MASKS ARE REAL AND THE PAGE SAYS WHERE THE RAW VALUE IS. Email, phone and network addresses are
 * masked in SQL, so this page could not print one if it wanted to; obtain the raw value from the account
 * page, where the control is audited. Search still matches the raw value, because support is handed an
 * address by somebody on a call — a directory that cannot find the person it is for is not a directory.
 *
 * ⚠️ "UNDER REVIEW" IS NOT OFFERED, AND THE PAGE EXPLAINS WHY. `account_status` is active, suspended or
 * closed. A fourth option would filter to nothing while looking like a working control, so the filter
 * carries the three that exist and the note below says what is not there.
 */
export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; standing?: string; failed?: string }>;
}) {
  const query = await searchParams;
  const standing = ACCOUNT_STANDINGS.includes(query.standing as (typeof ACCOUNT_STANDINGS)[number])
    ? query.standing
    : undefined;

  const [context, directory] = await Promise.all([
    getAdminContext(),
    getAccountDirectory({ search: query.q, standing }),
  ]);

  const failure = adminFailureCopy(query.failed);
  const canRead = context?.has('platform.support.read') || context?.has('platform.admin.manage');

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Accounts</p>
          <h1>People, and what they are allowed to do.</h1>
          <p>
            Search by the contact detail somebody gives you, a name, or the first characters of an account ID.
            Contact values are masked everywhere by default; the account page is where a raw value can be
            revealed, against a reason that is written to the audit log.
          </p>
        </div>
        <span className="admin-quick-note">Contact details masked by default</span>
      </header>

      {failure ? (
        <p className="notice" role="alert">
          <strong>That did not save.</strong>
          <br />
          {failure}
        </p>
      ) : null}

      {!canRead ? (
        <AccessDenied what="The account directory" />
      ) : !directory.allowed ? (
        <section className="admin-section admin-panel" role="alert">
          <h2>Directory unavailable</h2>
          <p>
            {directory.unavailable
              ? 'The directory could not be read. Nothing has changed — reload to try again.'
              : 'Your role does not cover reading accounts.'}
          </p>
        </section>
      ) : (
        <>
          <form method="get" action="/admin/accounts" className="admin-filters">
            <div className="admin-field-group">
              <label className="admin-field-label" htmlFor="q">
                Search
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query.q ?? ''}
                placeholder="name, masked or full address, or an account ID"
                className="admin-field"
              />
            </div>
            <div className="admin-field-group">
              <label className="admin-field-label" htmlFor="standing">
                Standing
              </label>
              <select id="standing" name="standing" defaultValue={query.standing ?? ''} className="admin-field">
                <option value="">Any standing</option>
                {ACCOUNT_STANDINGS.map(value => (
                  <option key={value} value={value}>
                    {STANDING_COPY[value].label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="secondary-button">
              Search
            </button>
            {query.q || query.standing ? (
              <Link className="text-button" href="/admin/accounts">
                Clear
              </Link>
            ) : null}
          </form>

          <p className="admin-incident-meta">
            <span>
              {directory.accounts.length} account{directory.accounts.length === 1 ? '' : 's'} shown
            </span>
            <span>Standing is one of active, suspended or closed — &ldquo;under review&rdquo; is not a state this platform records</span>
          </p>

          <section className="admin-section" aria-label="Accounts">
            <AccountTable accounts={directory.accounts} />
          </section>

          <section className="admin-section admin-panel" aria-labelledby="recovery-heading">
            <div className="admin-section-heading">
              <div>
                <h2 id="recovery-heading">Support recovery</h2>
                <p>
                  The platform has no administrator-triggered password reset, and this page will not pretend
                  otherwise. What an operator can do is on the account page: end every session, and change the
                  standing if the account is compromised. The person then sets a new password themselves at{' '}
                  <Link href="/auth/recovery">account recovery</Link>, using the email address on the account.
                </p>
              </div>
            </div>
            <p className="admin-incident-meta">
              <span>
                A suspension takes effect at the database on the account&apos;s next request, not when its token
                expires: every read and write resolves the caller through `accounts.status = &apos;active&apos;`.
              </span>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
