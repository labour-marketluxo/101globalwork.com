import Link from 'next/link';
import { ArrowRight, ExternalLink, ShieldAlert } from 'lucide-react';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import { acknowledgeIncidentAction, applyProviderRestrictionAction, liftProviderRestrictionAction } from '@/features/admin/actions';
import {
  INCIDENT_AREAS,
  RESTRICTION_KIND_COPY,
  SEVERITY_COPY,
  STANDING_COPY,
  type ReasonCode,
} from '@/features/admin/copy';
import type { IncidentItem } from '@/features/admin/incidents';
import type { AccountDirectoryItem } from '@/features/admin/accounts';
import type { ProviderDirectoryItem } from '@/features/admin/providers';

/**
 * The administrator workspace's shared pieces.
 *
 * ⚠️ THEY LIVE IN ONE FILE BECAUSE THREE PAGES SHARE THE SAME THREE VOCABULARIES — a standing, a
 * severity and a restriction kind. A second copy of "Suspended" in amber is how a console starts
 * disagreeing with itself about what colour a state is.
 *
 * ⚠️ EVERY DESTRUCTIVE CONTROL IS A REASON-CODED FORM, NEVER A LINK. A GET that changes state is a URL a
 * browser may prefetch, a chat client may unfurl, and a crawler may follow; the modal controller submits
 * a POST to a server action, which is the only shape that cannot be triggered by accident.
 */

export function SeverityBadge({ severity }: { severity: string }) {
  const copy = SEVERITY_COPY[severity as keyof typeof SEVERITY_COPY] ?? { label: severity, tone: 'slate' as const };
  return (
    <span className="admin-severity" data-severity={severity}>
      {copy.tone === 'amber' ? <ShieldAlert aria-hidden="true" className="h-3 w-3" /> : null}
      {copy.label}
    </span>
  );
}

export function StandingBadge({ standing }: { standing: string }) {
  const copy = STANDING_COPY[standing as keyof typeof STANDING_COPY];
  return (
    <span className="admin-severity" data-severity={standing === 'suspended' ? 'high' : 'low'}>
      {copy?.label ?? standing}
    </span>
  );
}

export function RestrictionBadge({ kind }: { kind: string }) {
  const copy = RESTRICTION_KIND_COPY[kind];
  return (
    <span className="admin-severity" data-severity={copy?.tone === 'amber' ? 'high' : 'low'}>
      {copy?.label ?? kind}
    </span>
  );
}

export function formatWhen(iso: string | null, fallback = 'never'): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return fallback;
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatAge(iso: string | null, now: Date, fallback = 'not recorded'): string {
  if (!iso) return fallback;
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return fallback;
  const minutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * One incident card.
 *
 * ⚠️ THE CARD SAYS WHICH COLUMN THE COUNT WAS MEASURED ON, AND WHETHER A MARKET FILTER APPLIED TO IT.
 * An operator filtering by market needs to know that "rejected provider events" ignored their filter,
 * and that "credentials expiring" was measured on the expiry date rather than on when the row was
 * written — otherwise they read a stale number as a fresh one.
 */
export function IncidentCard({
  item,
  now,
  reasons,
  canAcknowledge,
  filters,
}: {
  item: IncidentItem;
  now: Date;
  reasons: ReasonCode[];
  canAcknowledge: boolean;
  /** The filters the operator is looking through, carried into the acknowledgement so the page returns unchanged. */
  filters: { market?: string; window?: string; severity?: string };
}) {
  const clear = item.count === 0;
  const state = clear ? 'clear' : item.acknowledged && !item.recurred ? 'acknowledged' : 'open';

  return (
    <article className="admin-incident" data-state={state}>
      <div className="admin-incident-head">
        <div>
          <div className="admin-incident-meta">
            <SeverityBadge severity={item.severity} />
            <span>{INCIDENT_AREAS[item.area] ?? item.area}</span>
          </div>
          <h3>{item.title}</h3>
        </div>
        <div className="admin-incident-count">
          <strong>{item.count}</strong>
          <span className="admin-incident-meta">{clear ? 'nothing outstanding' : 'items in the window'}</span>
        </div>
      </div>

      <p>{item.detail}</p>

      <div className="admin-incident-meta">
        <span>Measured on {item.windowBasis}</span>
        <span>{item.marketScoped ? 'Narrowed by the market filter' : 'Not market-scoped'}</span>
        {!clear ? <span>Oldest {formatAge(item.oldestAt, now)}</span> : null}
      </div>

      <div className="admin-incident-ack">
        <span>
          {item.acknowledged
            ? item.recurred
              ? `Acknowledged at ${item.acknowledgedCount} item(s) and has grown since.`
              : `Acknowledged by ${item.acknowledgedBy ?? 'an administrator'} ${formatAge(item.acknowledgedAt, now)}.`
            : 'Not acknowledged.'}
        </span>
        <span className="admin-row-actions">
          <Link className="text-button" href={item.deepLink}>
            {item.actionLabel}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
          {canAcknowledge ? (
            <form action={acknowledgeIncidentAction}>
              {filters.market ? <input type="hidden" name="market" value={filters.market} /> : null}
              {filters.window ? <input type="hidden" name="window" value={filters.window} /> : null}
              {filters.severity ? <input type="hidden" name="severity" value={filters.severity} /> : null}
              <input type="hidden" name="incident_key" value={item.key} />
              <input type="hidden" name="area" value={item.area} />
              <input type="hidden" name="severity" value={item.severity} />
              <input type="hidden" name="count" value={String(item.count)} />
              <input type="hidden" name="next" value="/admin" />
              <ReasonCodeControl
                triggerLabel="Acknowledge"
                triggerClassName="admin-trigger-quiet"
                title={`Acknowledge: ${item.title}`}
                description={`This records that you looked at ${item.count} item(s) in this queue, with your reason. It changes nothing in the queue itself — the items are still there.`}
                confirmLabel="Record acknowledgement"
                confirmClassName="admin-confirm-amber"
                reasons={reasons}
                noteLabel="What you found"
                tone="standard"
                disabled={item.count === 0}
                disabledReason="Nothing outstanding to acknowledge."
              />
            </form>
          ) : null}
        </span>
      </div>
    </article>
  );
}

/**
 * The accounts table.
 *
 * ⚠️ THE CONTACT COLUMN IS A MASK AND IT IS LABELLED AS ONE. Printing a masked address without saying so
 * invites an operator to read `t***s@example.com` as the address on file and paste it into a reply.
 * The column says which of the two it is, and whether it is confirmed.
 */
export function AccountTable({ accounts }: { accounts: AccountDirectoryItem[] }) {
  if (accounts.length === 0) {
    return <p className="empty-admin">No account matched. Try the masked contact, a name, or the first characters of an account ID.</p>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <caption className="sr-only">Accounts, with contact details masked</caption>
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Standing</th>
            <th scope="col">Roles &amp; memberships</th>
            <th scope="col">Verification</th>
            <th scope="col">Last sign-in</th>
            <th scope="col">Open</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(account => (
            <tr key={account.accountId}>
              <td>
                <strong>{account.displayName}</strong>
                <small>
                  {account.contactMasked
                    ? `${account.contactKind === 'email' ? 'Email' : 'Phone'} on file: ${account.contactMasked}${account.contactConfirmed ? ' · confirmed' : ' · not confirmed'}`
                    : 'No email or phone on file'}
                </small>
                <small>
                  {account.providerCount} provider identit{account.providerCount === 1 ? 'y' : 'ies'} · {account.requestCount} request{account.requestCount === 1 ? '' : 's'}
                </small>
              </td>
              <td><StandingBadge standing={account.accountStatus} /></td>
              <td>
                {account.adminRoles.length ? (
                  <small>{account.adminRoles.map(role => `${role.name} (${role.status})`).join(', ')}</small>
                ) : (
                  <small>No platform role</small>
                )}
                {account.organisations.length ? (
                  <small>
                    {account.organisations.map(org => `${org.name} · ${org.role.replaceAll('_', ' ')}`).join('; ')}
                  </small>
                ) : (
                  <small>No organisation</small>
                )}
              </td>
              <td>
                {account.verification.pending + account.verification.verified + account.verification.other === 0 ? (
                  <small>No submissions</small>
                ) : (
                  <small>
                    {account.verification.verified} verified · {account.verification.pending} pending
                    {account.verification.other > 0 ? ` · ${account.verification.other} other` : ''}
                  </small>
                )}
              </td>
              <td><small>{formatWhen(account.lastSignInAt, 'never signed in')}</small></td>
              <td>
                <div className="admin-row-actions">
                  <Link className="text-button" href={`/admin/accounts/${account.accountId}`}>
                    Open account
                  </Link>
                  {/* ⚠️ "SUPPORT RECOVERY" IS A PLACE, NOT A BUTTON THAT DOES ANYTHING ON ITS OWN. The platform
                      has no administrator-triggered password reset; what an operator can actually do is end
                      the sessions and change the standing, and both live in the recovery panel this links to. */}
                  <Link
                    className="text-button"
                    href={`/admin/accounts/${account.accountId}#recovery`}
                    title="End every session and change the standing — the two recovery steps this platform can perform"
                  >
                    Support recovery
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The supply directory.
 *
 * ⚠️ THE RESTRICTION COLUMN SHOWS THE ROW THAT IS ACTUALLY IN FORCE, INCLUDING ITS AGE. A hold placed by
 * somebody who has since left is the failure this table exists to surface, so an old `applied_at` is
 * printed rather than a status word that reads as current.
 */
export function ProviderTable({
  providers,
  reasons,
  canRestrict,
  stepUpPending,
  queue,
}: {
  providers: ProviderDirectoryItem[];
  reasons: ReasonCode[];
  canRestrict: boolean;
  stepUpPending: boolean;
  queue: string;
}) {
  if (providers.length === 0) {
    return <p className="empty-admin">No provider matched this queue and search.</p>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <caption className="sr-only">Providers in supply, with readiness, credentials and restrictions</caption>
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col">Readiness</th>
            <th scope="col">Categories</th>
            <th scope="col">Credentials</th>
            <th scope="col">Restriction</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {providers.map(provider => (
            <tr key={provider.providerId}>
              <td>
                <strong>{provider.displayName}</strong>
                <small>
                  {provider.isPublic ? 'Published' : 'Not published'} · provider status {provider.providerStatus.replaceAll('_', ' ')}
                  {provider.marketName ? ` · ${provider.marketName}` : ''}
                </small>
                {provider.pendingVerifications > 0 ? (
                  <small>{provider.pendingVerifications} verification(s) pending</small>
                ) : provider.lastVerificationAt ? (
                  <small>Last verification {formatWhen(provider.lastVerificationAt)}</small>
                ) : (
                  <small>No verification submitted</small>
                )}
              </td>
              <td>
                <small>
                  {provider.readinessScore === null ? 'Not scored yet' : `${provider.readinessScore}/100 ${provider.readinessState ? `(${provider.readinessState.replaceAll('_', ' ')})` : ''}`}
                </small>
                <small>Setup {provider.setupPercent === null ? 'unknown' : `${provider.setupPercent}%`}</small>
              </td>
              <td>
                {provider.categories.length ? (
                  <small>{provider.categories.slice(0, 4).map(category => category.name).join(', ')}{provider.categories.length > 4 ? ` +${provider.categories.length - 4}` : ''}</small>
                ) : (
                  <small>No service category</small>
                )}
              </td>
              <td>
                <small>
                  {provider.credentialCount} on file
                  {provider.credentialPending > 0 ? ` · ${provider.credentialPending} awaiting review` : ''}
                </small>
                {provider.credentialExpired > 0 ? <small>{provider.credentialExpired} already expired</small> : null}
                {provider.credentialExpiring > 0 ? <small>{provider.credentialExpiring} expiring within 30 days</small> : null}
              </td>
              <td>
                {provider.restriction ? (
                  <>
                    <RestrictionBadge kind={provider.restriction.kind} />
                    <small>Applied {formatWhen(provider.restriction.appliedAt)} · {provider.restriction.reasonCode.replaceAll('_', ' ')}</small>
                    {provider.restriction.reviewBy ? (
                      <small>Review by {formatWhen(provider.restriction.reviewBy)} — recorded, not enforced automatically</small>
                    ) : null}
                    {provider.restriction.note ? <small>{provider.restriction.note}</small> : null}
                  </>
                ) : (
                  <small>None in force</small>
                )}
              </td>
              <td>
                <div className="admin-row-actions">
                  {provider.publicSlug ? (
                    <Link className="text-button" href={`/providers/${provider.publicSlug}`} target="_blank" rel="noreferrer">
                      Public profile <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                  <Link className="text-button" href={`/admin/trust/verifications?provider=${provider.providerId}`}>
                    Open provider review
                  </Link>

                  {provider.restriction ? (
                    <form action={liftProviderRestrictionAction}>
                      <input type="hidden" name="restriction_id" value={provider.restriction.id} />
                      <input type="hidden" name="queue" value={queue} />
                      <input type="hidden" name="next" value={`/admin/providers?queue=${encodeURIComponent(queue)}`} />
                      <ReasonCodeControl
                        triggerLabel="Lift restriction"
                        triggerClassName="admin-trigger-quiet"
                        title={`Lift the restriction on ${provider.displayName}`}
                        description="The original restriction row is kept — this closes it, with your reason, rather than deleting the history of the hold."
                        confirmLabel="Lift restriction"
                        confirmClassName="admin-confirm-amber"
                        reasons={reasons}
                        noteLabel="Why it can be lifted"
                        disabled={!canRestrict || stepUpPending}
                        disabledReason={
                          stepUpPending
                            ? 'Confirm it is you on this session first.'
                            : 'Your administrator role does not cover provider operations.'
                        }
                      />
                    </form>
                  ) : (
                    <form action={applyProviderRestrictionAction}>
                      <input type="hidden" name="provider_id" value={provider.providerId} />
                      <input type="hidden" name="queue" value={queue} />
                      <input type="hidden" name="next" value={`/admin/providers?queue=${encodeURIComponent(queue)}`} />
                      <ReasonCodeControl
                        triggerLabel="Apply restriction"
                        triggerClassName="admin-trigger-danger"
                        title={`Place an operational restriction on ${provider.displayName}`}
                        description="This records the hold, its reason and its lifetime against the provider. It does not by itself change what the provider can do — the entitlement a restriction is meant to remove is removed by the command that owns it."
                        confirmLabel="Apply restriction"
                        confirmClassName="admin-confirm-danger"
                        reasons={reasons}
                        noteLabel="What this restriction is for"
                        disabled={!canRestrict || stepUpPending}
                        disabledReason={
                          stepUpPending
                            ? 'Confirm it is you on this session first.'
                            : 'Your administrator role does not cover restricting providers.'
                        }
                        extraFields={
                          <>
                            <label className="admin-field-label" htmlFor={`kind-${provider.providerId}`}>
                              Restriction
                            </label>
                            <select
                              id={`kind-${provider.providerId}`}
                              name="kind"
                              required
                              defaultValue="information_required"
                              className="admin-field"
                            >
                              {Object.entries(RESTRICTION_KIND_COPY).map(([value, copy]) => (
                                <option key={value} value={value}>{copy.label}</option>
                              ))}
                            </select>
                            <label className="admin-field-label" htmlFor={`severity-${provider.providerId}`}>
                              Severity
                            </label>
                            <select
                              id={`severity-${provider.providerId}`}
                              name="severity"
                              defaultValue="medium"
                              className="admin-field"
                            >
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                            <label className="admin-field-label" htmlFor={`expires-${provider.providerId}`}>
                              Review by (optional — recorded, never enforced)
                            </label>
                            <input id={`expires-${provider.providerId}`} name="expires_at" type="date" className="admin-field" />
                          </>
                        }
                      />
                    </form>
                  )}

                  <form action={applyProviderRestrictionAction}>
                    <input type="hidden" name="provider_id" value={provider.providerId} />
                    <input type="hidden" name="queue" value={queue} />
                    <input type="hidden" name="next" value={`/admin/providers?queue=${encodeURIComponent(queue)}`} />
                    <ReasonCodeControl
                      triggerLabel="Request information"
                      triggerClassName="admin-trigger-quiet"
                      title={`Request information from ${provider.displayName}`}
                      description="This records that the platform is waiting on something from this provider. The platform has no outbound message to a provider, so this is a record on the supply directory — tell them through whatever channel you already use, and say so here."
                      confirmLabel="Record the request"
                      confirmClassName="admin-confirm-amber"
                      reasons={reasons}
                      noteLabel="What is needed, and where you asked"
                      tone="standard"
                      disabled={!canRestrict || stepUpPending || provider.restriction !== null}
                      disabledReason={
                        provider.restriction
                          ? 'A restriction is already in force; lift it or use its note.'
                          : stepUpPending
                            ? 'Confirm it is you on this session first.'
                            : 'Your administrator role does not cover provider operations.'
                      }
                      extraFields={
                        <>
                          <input type="hidden" name="kind" value="information_required" />
                          <input type="hidden" name="severity" value="low" />
                        </>
                      }
                    />
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A raw identifier, behind a disclosure.
 *
 * ⚠️ IT IS A `<details>`, NOT A BUTTON, AND IT IS NOT AUDITED — the difference matters. This is an ID the
 * operator can already see in the URL of the page they are on, so an audit row for expanding it would
 * be noise that makes the real audit trail harder to read. Contact details are the opposite case and
 * get the audited control.
 */
export function RawIdentifier({ label, value }: { label: string; value: string }) {
  return (
    <details className="identity-details">
      <summary>{label}</summary>
      <code>{value}</code>
    </details>
  );
}

export function AccessDenied({ what }: { what: string }) {
  return (
    <section className="admin-section admin-panel" role="alert">
      <h2>Not available to your role</h2>
      <p>
        {what} is behind a capability your administrator role does not hold. Nothing here is broken, and
        nothing has changed — ask a platform owner or administrator if you need it.
      </p>
    </section>
  );
}
