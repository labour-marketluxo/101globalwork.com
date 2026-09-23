import Link from 'next/link';
import { ArrowRight, Building2, ShieldCheck, TriangleAlert, UserMinus, Users } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PendingButton } from '@/components/provider/ProviderControls';
import {
  ORG_ROLE_COPY,
  ORG_ROLE_OPTIONS,
  PREFERENCE_STATUS_COPY,
  type OrgDirectory,
  type OrgInvitation,
  type OrgMember,
} from '@/features/organisations/directory';
import {
  addPreferredProviderAction,
  inviteMemberAction,
  removePreferredProviderAction,
  setLocationArchivedAction,
  setMemberStatusAction,
  updateLocationAction,
  updateMemberAction,
} from '@/features/organisations/directory-actions';

/**
 * The member directory, the site directory and the vendor network.
 *
 * ⚠️ CONTROLS APPEAR ONLY FOR AN OWNER OR ADMINISTRATOR, AND THE COMMANDS REFUSE EVERYBODY ELSE. The rules that
 * matter are in SQL: nobody widens their own site scope, an owner cannot be demoted or suspended here, and a member
 * cannot suspend themselves.
 *
 * ⚠️ A SITE'S ADDRESS IS TEXT, NOT A COORDINATE. The platform has no geocoding service and no coordinates for its
 * locations, so the fields are country-agnostic free text validated against the area catalog — never a US-style
 * state/ZIP pair, which would be wrong in most of the markets this platform operates in.
 */

function roleBadge(role: string) {
  return <span className={BADGE_SLATE}>{ORG_ROLE_COPY[role] ?? role.replaceAll('_', ' ')}</span>;
}

export function MembersTable({
  organisationId,
  directory,
  canAdminister,
}: {
  organisationId: string;
  directory: OrgDirectory;
  canAdminister: boolean;
}) {
  return (
    <div className="grid gap-4">
      {directory.members.map((member: OrgMember) => (
        <article key={member.accountId} className={`${CARD} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                <Users aria-hidden="true" className="h-4 w-4 text-primary" />
                {member.name}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {member.scopeLocationIds.length === 0
                  ? 'Every site in this organisation'
                  : member.scopeNames.join(', ') || 'Scoped to sites'}
                {member.scopeNote ? ' · ' + member.scopeNote : ''}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {member.lastActivityAt
                  ? 'Last recorded activity ' + new Date(member.lastActivityAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'No recorded activity since joining'}
                {member.joinedAt ? ' · joined ' + new Date(member.joinedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''}
              </p>
            </div>
            <span className="flex flex-wrap items-center gap-1.5">
              {roleBadge(member.role)}
              {member.status === 'suspended' ? <span className={BADGE_AMBER}>Suspended</span> : null}
            </span>
          </div>

          {canAdminister && member.role !== 'owner' ? (
            <div className="mt-4 grid gap-3 border-t border-solid border-slate-200 pt-4 lg:grid-cols-2">
              <form action={updateMemberAction} className="grid gap-2">
                <input type="hidden" name="organisation_id" value={organisationId} />
                <input type="hidden" name="account_id" value={member.accountId} />
                <input type="hidden" name="next" value={`/org/${organisationId}/members`} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`role_${member.accountId}`} className={LABEL}>Role</label>
                    <select id={`role_${member.accountId}`} name="role" defaultValue={member.role} className={FIELD}>
                      {ORG_ROLE_OPTIONS.filter(role => role !== 'owner').map(role => (
                        <option key={role} value={role}>{ORG_ROLE_COPY[role]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`scope_${member.accountId}`} className={LABEL}>Site scope (empty means all)</label>
                    <select id={`scope_${member.accountId}`} name="scope_location_ids" multiple size={3} defaultValue={member.scopeLocationIds} className={FIELD}>
                      {directory.locations.map(location => (
                        <option key={location.id} value={location.locationId}>{location.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <input name="scope_note" maxLength={200} placeholder="Scope note (optional)" className={FIELD} defaultValue={member.scopeNote ?? ''} />
                <p className="text-xs leading-relaxed text-slate-500">
                  Changing a role or a scope asks for your second factor when the account has one. An administrator
                  cannot change their own scope — that rule is enforced by the database, not by hiding the form.
                </p>
                <div>
                  <PendingButton
                    idle="Save role and scope"
                    pending="Saving…"
                    className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </form>
              <form action={setMemberStatusAction} className="grid gap-2">
                <input type="hidden" name="organisation_id" value={organisationId} />
                <input type="hidden" name="account_id" value={member.accountId} />
                <input type="hidden" name="status" value={member.status === 'suspended' ? 'active' : 'suspended'} />
                <input type="hidden" name="next" value={`/org/${organisationId}/members`} />
                <p className="text-xs leading-relaxed text-slate-500">
                  Suspending keeps the membership and its history; the person simply cannot act for the organisation
                  while it is suspended.
                </p>
                <div>
                  <PendingButton
                    idle={member.status === 'suspended' ? 'Reactivate member' : 'Suspend member'}
                    pending="Saving…"
                    icon={<UserMinus aria-hidden="true" className="h-4 w-4" />}
                    className="inline-flex w-fit items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </form>
            </div>
          ) : null}
        </article>
      ))}

      <section className={`${CARD} p-5`} aria-labelledby="invitations-heading">
        <h2 id="invitations-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Invitations
        </h2>
        {directory.invitations.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-600">Nobody has been invited yet.</p>
        ) : (
          <ul className="mt-3 grid gap-2 text-xs">
            {directory.invitations.map((invitation: OrgInvitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
                <span className="text-slate-700">
                  <strong className="font-semibold">{invitation.email}</strong> · {ORG_ROLE_COPY[invitation.role] ?? invitation.role}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-slate-500">
                  <span>{invitation.status}</span>
                  {invitation.expiresAt ? (
                    <span>
                      expires {new Date(invitation.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          The platform sends no email of its own. When you invite somebody, the link is shown once here — pass it to
          them yourself. They accept it by signing in with that same address.
        </p>
      </section>

      {canAdminister ? (
        <form action={inviteMemberAction} className={`${CARD} grid gap-4 p-5`}>
          <input type="hidden" name="organisation_id" value={organisationId} />
          <input type="hidden" name="next" value={`/org/${organisationId}/members`} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Invite a member</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Choose the role and the sites they may act on. A grant like this asks for your second factor when your
              account has one.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="member_email" className={LABEL}>Email</label>
              <input id="member_email" name="email" type="email" required maxLength={160} className={FIELD} />
            </div>
            <div>
              <label htmlFor="member_role" className={LABEL}>Role</label>
              <select id="member_role" name="role" required defaultValue="member" className={FIELD}>
                {ORG_ROLE_OPTIONS.filter(role => role !== 'owner').map(role => (
                  <option key={role} value={role}>{ORG_ROLE_COPY[role]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="expires_in_days" className={LABEL}>Expires in (days, max 30)</label>
              <input id="expires_in_days" name="expires_in_days" type="number" min="1" max="30" defaultValue="7" className={FIELD} />
            </div>
          </div>
          <div>
            <label htmlFor="invite_scope" className={LABEL}>Sites they may act on (empty means every site)</label>
            <select id="invite_scope" name="scope_location_ids" multiple size={4} className={FIELD}>
              {directory.locations.map(location => (
                <option key={location.id} value={location.locationId}>{location.name}</option>
              ))}
            </select>
          </div>
          <div>
            <PendingButton
              idle="Create the invitation"
              pending="Creating…"
              icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function InvitationLinkPanel({ token, link }: { token: string; link: string }) {
  return (
    <div className="rounded-xl border border-solid border-primary-subtle bg-primary-surface p-3.5 text-xs leading-relaxed text-slate-700">
      <p className="font-semibold text-slate-900">The invitation link — shown once</p>
      <p className="mt-1 break-all font-mono text-[11px] text-primary">{link}</p>
      <p className="mt-1">
        Nothing stores this token in a readable form and no email is sent. Copy it now; if it is lost, invite the
        address again and the earlier invitation is revoked.
      </p>
      <input type="hidden" name="token" value={token} />
    </div>
  );
}

export function LocationsDirectory({
  organisationId,
  directory,
  canAdminister,
}: {
  organisationId: string;
  directory: OrgDirectory;
  canAdminister: boolean;
}) {
  if (directory.locations.length === 0) {
    return <EmptyState title="No sites yet">Add one from the overview, and its details appear here.</EmptyState>;
  }
  return (
    <div className="grid gap-4">
      {directory.locations.map(location => (
        <article key={location.id} className={`${CARD} p-5 ${location.archived ? 'opacity-70' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                <Building2 aria-hidden="true" className="h-4 w-4 text-primary" />
                {location.name}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {location.kind} · matched area {location.areaName}
                {location.isPrimary ? ' · primary' : ''}
                {location.timezone ? ' · ' + location.timezone : ''}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {[location.addressLine1, location.addressLine2, location.locality, location.region, location.postalCode, location.countryCode]
                  .filter(Boolean)
                  .join(', ') || 'No address recorded'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {location.siteManagerName ? 'Site manager: ' + location.siteManagerName : 'No site manager recorded'}
                {location.siteManagerPhone ? ' · ' + location.siteManagerPhone : ''}
              </p>
            </div>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={BADGE_SLATE}>
                {location.activeProjects} active · {location.totalProjects} total
              </span>
              {location.archived ? <span className={BADGE_SLATE}>Archived</span> : null}
            </span>
          </div>

          <p className="mt-2">
            <Link href={`/org/${organisationId}/projects?site=${encodeURIComponent(location.areaName)}`} className={LINK_ARROW}>
              View site projects
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </p>

          {location.accessNotes || location.safetyNotes ? (
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              {location.accessNotes ? (
                <div className="rounded-xl border border-solid border-slate-200 p-3">
                  <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Getting in</dt>
                  <dd className="mt-0.5 text-slate-700">{location.accessNotes}</dd>
                </div>
              ) : null}
              {location.safetyNotes ? (
                <div className="rounded-xl border border-solid border-secondary bg-secondary-light p-3">
                  <dt className="font-mono font-bold tracking-wider text-amber-800 uppercase">Safety notes</dt>
                  <dd className="mt-0.5 text-amber-900">{location.safetyNotes}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {canAdminister ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600">Edit branch details</summary>
              <form action={updateLocationAction} className="mt-3 grid gap-3 border-t border-solid border-slate-200 pt-3">
                <input type="hidden" name="organisation_id" value={organisationId} />
                <input type="hidden" name="location_row_id" value={location.id} />
                <input type="hidden" name="next" value={`/org/${organisationId}/locations`} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor={`label_${location.id}`} className={LABEL}>Branch name</label>
                    <input id={`label_${location.id}`} name="label" required defaultValue={location.name} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`line1_${location.id}`} className={LABEL}>Address line 1</label>
                    <input id={`line1_${location.id}`} name="address_line1" maxLength={160} defaultValue={location.addressLine1 ?? ''} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`line2_${location.id}`} className={LABEL}>Address line 2</label>
                    <input id={`line2_${location.id}`} name="address_line2" maxLength={160} defaultValue={location.addressLine2 ?? ''} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`locality_${location.id}`} className={LABEL}>City or locality</label>
                    <input id={`locality_${location.id}`} name="locality" maxLength={120} defaultValue={location.locality ?? ''} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`region_${location.id}`} className={LABEL}>Region or state (your own wording)</label>
                    <input id={`region_${location.id}`} name="region" maxLength={120} defaultValue={location.region ?? ''} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`postal_${location.id}`} className={LABEL}>Postal code (optional, any format)</label>
                    <input id={`postal_${location.id}`} name="postal_code" maxLength={20} defaultValue={location.postalCode ?? ''} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`country_${location.id}`} className={LABEL}>Country code</label>
                    <input id={`country_${location.id}`} name="country_code" maxLength={2} placeholder="NG" defaultValue={location.countryCode ?? ''} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`tz_${location.id}`} className={LABEL}>Local timezone</label>
                    <input id={`tz_${location.id}`} name="timezone" maxLength={60} placeholder="Africa/Lagos" defaultValue={location.timezone ?? ''} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`mgr_${location.id}`} className={LABEL}>Site manager</label>
                    <input id={`mgr_${location.id}`} name="site_manager_name" maxLength={120} defaultValue={location.siteManagerName ?? ''} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`mgrphone_${location.id}`} className={LABEL}>Site manager phone</label>
                    <input id={`mgrphone_${location.id}`} name="site_manager_phone" maxLength={40} defaultValue={location.siteManagerPhone ?? ''} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`access_${location.id}`} className={LABEL}>Access notes</label>
                    <input id={`access_${location.id}`} name="access_notes" maxLength={500} defaultValue={location.accessNotes ?? ''} className={FIELD} />
                  </div>
                  <div>
                    <label htmlFor={`safety_${location.id}`} className={LABEL}>Safety notes</label>
                    <input id={`safety_${location.id}`} name="safety_notes" maxLength={500} defaultValue={location.safetyNotes ?? ''} className={FIELD} />
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  The address is recorded as you type it and never resolved to a coordinate: this platform has no
                  geocoding service and holds none for its own locations. Matching uses the area above, which is why
                  that field cannot be edited here.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <PendingButton
                    idle="Save branch details"
                    pending="Saving…"
                    className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </form>
              <form action={setLocationArchivedAction} className="mt-3">
                <input type="hidden" name="organisation_id" value={organisationId} />
                <input type="hidden" name="location_row_id" value={location.id} />
                <input type="hidden" name="archived" value={location.archived ? '0' : '1'} />
                <input type="hidden" name="next" value={`/org/${organisationId}/locations`} />
                <PendingButton
                  idle={location.archived ? 'Restore site' : 'Archive site'}
                  pending="Saving…"
                  className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span className="ml-3 text-xs leading-relaxed text-slate-500">
                  A site with work in progress cannot be archived.
                </span>
              </form>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function PreferredProvidersDirectory({
  organisationId,
  directory,
  canAdminister,
  availableProviders,
}: {
  organisationId: string;
  directory: OrgDirectory;
  canAdminister: boolean;
  availableProviders: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-4">
      <p className="flex items-start gap-2 rounded-xl border border-solid border-secondary bg-secondary-light p-3.5 text-xs leading-relaxed text-amber-900">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
        <span>
          <strong className="font-semibold">A preference is not a permission.</strong> It puts a provider in your own
          directory; it does not bypass verification, credential requirements, safety checks or matching eligibility.
          The badges below are read live from the provider&apos;s own records, and a provider whose credential has since
          expired shows as unverified now — with what the platform saw when you chose them beside it.
        </span>
      </p>

      {directory.providers.length === 0 ? (
        <EmptyState title="No preferred providers yet">
          Add one below. The platform will record the verification state it saw at the time, so the entry cannot later
          read as though they were vetted when they were chosen.
        </EmptyState>
      ) : (
        directory.providers.map(provider => {
          const status = PREFERENCE_STATUS_COPY[provider.status] ?? { label: provider.status, tone: 'slate' as const };
          return (
            <article key={provider.id} className={`${CARD} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                    <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
                    {provider.name}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {provider.services.join(', ') || 'No active services'}
                    {' · '}
                    {provider.areas.slice(0, 3).join(', ') || 'No areas'}
                    {provider.areas.length > 3 ? ' +' + String(provider.areas.length - 3) + ' more' : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {provider.jobsForUs} job{provider.jobsForUs === 1 ? '' : 's'} for this organisation
                    {provider.readinessScore !== null ? ' · readiness ' + String(Math.round(provider.readinessScore)) + '/100' : ''}
                    {provider.contractReference ? ' · contract ' + provider.contractReference : ''}
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={status.tone === 'teal' ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase' : status.tone === 'amber' ? BADGE_AMBER : BADGE_SLATE}>
                    {status.label}
                  </span>
                  {provider.identityVerified ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
                      Identity verified
                    </span>
                  ) : (
                    <span className={BADGE_AMBER}>Identity not verified</span>
                  )}
                  <span className={BADGE_SLATE}>
                    {provider.verifiedCredentials} verified credential{provider.verifiedCredentials === 1 ? '' : 's'}
                  </span>
                </span>
              </div>

              <p className="mt-2 text-xs text-slate-500">
                At the time you added them, the platform recorded:{' '}
                {provider.verificationAtAdd.identity_verified === true ? 'identity verified' : 'identity not verified'}
                {' · '}
                {String(provider.verificationAtAdd.verified_credentials ?? 0)} verified credentials
                {provider.addedAt ? ' · ' + new Date(provider.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <Link href={`/org/${organisationId}/projects`} className={LINK_ARROW}>
                  Invite to a project
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
                {provider.providerStatus === 'active' ? (
                  <Link href={`/providers`} className={LINK_ARROW}>
                    Public profile
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <span className="text-xs text-slate-500">No public profile: this provider is not published.</span>
                )}
              </div>

              {canAdminister ? (
                <form action={removePreferredProviderAction} className="mt-3 border-t border-solid border-slate-200 pt-3">
                  <input type="hidden" name="organisation_id" value={organisationId} />
                  <input type="hidden" name="provider_id" value={provider.providerId} />
                  <input type="hidden" name="next" value={`/org/${organisationId}/providers`} />
                  <PendingButton
                    idle="Remove preference"
                    pending="Removing…"
                    className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </form>
              ) : null}
            </article>
          );
        })
      )}

      {canAdminister ? (
        <form action={addPreferredProviderAction} className={`${CARD} grid gap-4 p-5`}>
          <input type="hidden" name="organisation_id" value={organisationId} />
          <input type="hidden" name="next" value={`/org/${organisationId}/providers`} />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Add a preferred provider</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Only published providers can be added: an unpublished profile is not in the marketplace, so the
              organisation would be keeping a note about somebody nobody can hire.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="provider_id" className={LABEL}>Provider</label>
              <select id="provider_id" name="provider_id" required defaultValue="" className={FIELD}>
                <option value="" disabled>Choose a provider</option>
                {availableProviders.map(provider => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="preference_status" className={LABEL}>Relationship</label>
              <select id="preference_status" name="status" required defaultValue="preferred" className={FIELD}>
                <option value="preferred">Preferred</option>
                <option value="contract">Under contract</option>
                <option value="watch">Watch list</option>
              </select>
            </div>
            <div>
              <label htmlFor="contract_reference" className={LABEL}>Contract reference (optional)</label>
              <input id="contract_reference" name="contract_reference" maxLength={120} className={FIELD} />
            </div>
          </div>
          <div>
            <label htmlFor="preference_note" className={LABEL}>Why they are on the list (optional)</label>
            <input id="preference_note" name="note" maxLength={500} className={FIELD} />
          </div>
          <div>
            <PendingButton
              idle="Add to the directory"
              pending="Saving…"
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </form>
      ) : null}
    </div>
  );
}
