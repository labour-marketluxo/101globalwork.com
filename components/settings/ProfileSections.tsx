import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, CircleAlert, CircleCheck, Mail, Phone, ShieldQuestion, Trash2 } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import ConfirmSubmit from '@/components/ui/ConfirmSubmit';
import AvatarUploader from '@/components/settings/AvatarUploader';
import { formatRelativeTime } from '@/features/settings/device-label';
import {
  addContactAction,
  changeSignInEmailAction,
  removeAvatarAction,
  removeContactAction,
  resendContactCodeAction,
  setPrimaryContactAction,
  updateProfileAction,
  verifyContactAction,
} from '@/features/settings/identity-actions';
import { CONTACT_KIND_LABELS } from '@/features/settings/copy';
import type { ContactMethod, IdentityRead } from '@/features/settings/identity';

/**
 * The profile editor's presentation, all server components except the picture picker.
 *
 * ⚠️ THREE DIFFERENT KINDS OF CONTACT, AND THEY ARE SHOWN AS THREE. Conflating them is the mistake this page
 * exists to avoid:
 *
 *   the SIGN-IN address     owned by the authentication provider. Changing it starts a confirmation the
 *                           provider runs; this page never writes it.
 *   ADDITIONAL contacts     addresses and numbers this platform can reach the account on. They start
 *                           unverified and are unusable until a code comes back.
 *   the WORKSPACES          not contacts at all, but the roles — customer, provider, organisation member —
 *                           the same sign-in can act as. The switcher lists them.
 *
 * ⚠️ IT SAYS WHAT IT CANNOT DO. There is no SMS transport on this deployment and no avatar store other than
 * the one bucket this platform owns, so the rows that would need them say so instead of offering a control
 * that cannot work.
 */
export function ProfileNotice({ tone, children }: { tone: 'success' | 'warning'; children: React.ReactNode }) {
  const isSuccess = tone === 'success';
  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      className={`flex items-start gap-3 rounded-xl border border-solid p-4 text-sm leading-relaxed ${
        isSuccess ? 'border-primary-subtle bg-primary-surface text-slate-700' : 'border-secondary bg-secondary-light text-amber-900'
      }`}
    >
      {isSuccess ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      ) : (
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
      )}
      <div>{children}</div>
    </div>
  );
}

export function ProfileUnavailable() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-solid border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <p className="font-semibold text-slate-900">Your profile could not be read.</p>
        <p className="mt-1">
          Nothing has been changed. Reload to try again — the form is not shown while the platform cannot tell
          you what it currently holds, because saving would then be a blind overwrite.
        </p>
      </div>
    </div>
  );
}

export function IdentityPanel({ identity }: { identity: IdentityRead }) {
  return (
    <section aria-labelledby="identity-heading" className={`${CARD} p-5 sm:p-6`}>
      <h2 id="identity-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Name, language and time
      </h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
        Your display name is what the other party sees on a project, a quote or a message. Language and timezone
        decide how dates and amounts are written for you.
      </p>

      <form action={updateProfileAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <label className={LABEL} htmlFor="display_name">
            Display name
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            required
            maxLength={80}
            defaultValue={identity.profile.displayName}
            className={FIELD}
          />
        </div>

        <div className="sm:col-span-1">
          <label className={LABEL} htmlFor="language_code">
            Preferred language
          </label>
          <select
            id="language_code"
            name="language_code"
            defaultValue={identity.profile.languageCode}
            className={FIELD}
          >
            {identity.languages.length === 0 ? (
              <option value="en">English</option>
            ) : (
              identity.languages.map(language => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="timezone">
            Timezone
          </label>
          <input
            id="timezone"
            name="timezone"
            type="text"
            required
            list="timezone-options"
            defaultValue={identity.profile.timezone}
            className={FIELD}
            autoComplete="off"
          />
          <datalist id="timezone-options">
            {identity.timezones.map(zone => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Start typing to search the database&rsquo;s own timezone list — for example &ldquo;Lagos&rdquo; or
            &ldquo;Europe/&rdquo;. A value it does not recognise is refused rather than stored.
          </p>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase transition-colors hover:bg-primary-dark"
          >
            Save identity
          </button>
        </div>
      </form>
    </section>
  );
}

export function AvatarPanel({
  identity,
  initials,
  displayName,
}: {
  identity: IdentityRead;
  initials: string;
  displayName: string;
}) {
  const version = identity.profile.avatarUpdatedAt ? new Date(identity.profile.avatarUpdatedAt).getTime() : null;

  return (
    <section aria-labelledby="avatar-heading" className={`${CARD} p-5 sm:p-6`}>
      <h2 id="avatar-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Photo
      </h2>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {identity.profile.hasAvatar ? (
          <Image
            src={`/settings/profile/avatar${version ? `?v=${version}` : ''}`}
            alt={`${displayName || 'Your'} profile photo`}
            width={64}
            height={64}
            unoptimized
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle font-mono text-lg font-bold text-primary"
          >
            {initials}
          </span>
        )}
        <p className="max-w-md text-xs leading-relaxed text-slate-600">
          {identity.profile.hasAvatar
            ? 'Your photo is shown here and beside your name in the workspace.'
            : 'You have no photo, so your initials are shown instead. Somebody who has not added one is never given a placeholder face — a stock image would be indistinguishable from a real person.'}
        </p>
      </div>

      <div className="mt-5 border-t border-solid border-slate-200 pt-5">
        <AvatarUploader hasAvatar={identity.profile.hasAvatar} />
      </div>

      {identity.profile.hasAvatar ? (
        <form action={removeAvatarAction} className="mt-4">
          <ConfirmSubmit
            label="Remove photo"
            triggerClassName="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
            icon="danger"
            title="Remove your photo?"
            description="Your initials are shown instead. The stored image is deleted, and anything that has already cached it will stop showing it the next time it is fetched."
            confirmLabel="Remove"
          />
        </form>
      ) : null}
    </section>
  );
}

export function SignInContactPanel({ identity }: { identity: IdentityRead }) {
  const { email, emailVerified, phone, phoneVerified, memberSince } = identity.signInContact;

  return (
    <section aria-labelledby="signin-heading" className={`${CARD} p-5 sm:p-6`}>
      <h2 id="signin-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Sign-in identity
      </h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
        This address is what you sign in with, and it belongs to the authentication provider rather than to this
        page. Changing it starts the provider&rsquo;s own confirmation, so the new address has to prove it can
        receive mail before it becomes your sign-in identity.
      </p>

      <dl className="mt-4 grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3.5 py-3">
          <dt className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Mail aria-hidden="true" className="h-4 w-4 text-slate-400" />
            Email
          </dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm text-slate-900">
            <span className="font-mono">{email ?? 'None on this account'}</span>
            {email ? (
              emailVerified ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-primary uppercase">
                  <BadgeCheck aria-hidden="true" className="h-3 w-3" />
                  Verified
                </span>
              ) : (
                <span className={BADGE_AMBER}>Not confirmed</span>
              )
            ) : null}
          </dd>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3.5 py-3">
          <dt className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Phone aria-hidden="true" className="h-4 w-4 text-slate-400" />
            Phone
          </dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm text-slate-900">
            {phone ? (
              <>
                <span className="font-mono">{phone}</span>
                {phoneVerified ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-primary uppercase">
                    <BadgeCheck aria-hidden="true" className="h-3 w-3" />
                    Verified
                  </span>
                ) : (
                  <span className={BADGE_AMBER}>Not confirmed</span>
                )}
              </>
            ) : (
              <span className="text-slate-500">
                No number on this account. Adding one needs an SMS transport, which this deployment does not
                have configured, so there is no field here that could only fail.
              </span>
            )}
          </dd>
        </div>
      </dl>

      {email ? (
        <details className="mt-4 border-t border-solid border-slate-200 pt-4">
          <summary className="cursor-pointer text-xs font-semibold text-primary">
            Change the sign-in email
          </summary>
          <form action={changeSignInEmailAction} className="mt-3 grid gap-3">
            <label className={LABEL} htmlFor="signin_email">
              New sign-in email
            </label>
            <input
              id="signin_email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className={FIELD}
            />
            <p className="text-xs leading-relaxed text-slate-500">
              The change is started here and finished by the provider: a confirmation goes to the new address,
              and on a deployment configured for secure email change the address you are leaving is asked to
              agree as well. Until then, nothing about how you sign in has changed.
            </p>
            <div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                Send the confirmation
              </button>
            </div>
          </form>
        </details>
      ) : null}

      {memberSince ? (
        <p className="mt-4 text-xs text-slate-400">
          Account created{' '}
          {new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date(memberSince))}.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Additional contacts.
 *
 * ⚠️ THE DELIVERY STATE IS SHOWN, NOT ASSUMED. The code is written to the platform's outbox; whether anything
 * has picked it up is read back from that queue row. A deployment with no mail publisher therefore says
 * "queued, nothing has tried to deliver it yet" instead of "check your inbox" — the same honesty the admin
 * operations page applies to its own queue, and the difference between a support ticket that says the code
 * never arrived and a page that already knew.
 */
export function ContactMethodsPanel({ identity, now }: { identity: IdentityRead; now: Date }) {
  return (
    <section aria-labelledby="contacts-heading" className={`${CARD} p-5 sm:p-6`}>
      <h2 id="contacts-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Other ways to reach you
      </h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
        Addresses and numbers for notices — an alert address that is not your sign-in identity. A contact is
        unusable until it is verified, and a code is the only thing that verifies it.
      </p>

      <ul className="mt-4 grid gap-3">
        {identity.contacts.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">
            No additional contacts yet.
          </li>
        ) : (
          identity.contacts.map(contact => (
            <li key={contact.id}>
              <ContactRow contact={contact} now={now} />
            </li>
          ))
        )}
      </ul>

      <form action={addContactAction} className="mt-5 grid gap-3 border-t border-solid border-slate-200 pt-5 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <div>
          <label className={LABEL} htmlFor="contact_kind">
            Kind
          </label>
          <select id="contact_kind" name="kind" className={FIELD} defaultValue="email">
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="contact_value">
            Address or number
          </label>
          <input
            id="contact_value"
            name="value"
            type="text"
            required
            placeholder="alerts@example.com or +2348031234567"
            className={FIELD}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Numbers must be in international format with a leading +. Spaces and dashes are removed before the
            value is stored.
          </p>
        </div>
        <div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase transition-colors hover:bg-primary-dark"
          >
            Send a code
          </button>
        </div>
      </form>
    </section>
  );
}

function ContactRow({ contact, now }: { contact: ContactMethod; now: Date }) {
  const deliveryNote = contact.delivery.published
    ? 'The message was handed to the delivery queue.'
    : contact.delivery.failed
      ? 'The delivery queue has tried and failed. Ask support to check the mail transport.'
      : 'Queued, and nothing has tried to deliver it yet on this deployment — if the code does not arrive, that is why.';

  return (
    <div className="rounded-lg border border-solid border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="font-mono break-all">{contact.value}</span>
            {contact.verified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-primary uppercase">
                <BadgeCheck aria-hidden="true" className="h-3 w-3" />
                Verified
              </span>
            ) : (
              <span className={BADGE_AMBER}>Unverified</span>
            )}
            {contact.isPrimary ? <span className={BADGE_SLATE}>Primary</span> : null}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {CONTACT_KIND_LABELS[contact.kind] ?? contact.kind} · added{' '}
            {formatRelativeTime(contact.verifiedAt, now, 'not yet verified')}
            {contact.verified && contact.verifiedAt ? ' as verified' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {contact.verified && !contact.isPrimary ? (
            <form action={setPrimaryContactAction}>
              <input type="hidden" name="contact_id" value={contact.id} />
              <button
                type="submit"
                className="rounded-lg border border-solid border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                Use first
              </button>
            </form>
          ) : null}
          <form action={removeContactAction}>
            <input type="hidden" name="contact_id" value={contact.id} />
            <ConfirmSubmit
              label="Remove"
              triggerClassName="inline-flex items-center gap-1.5 rounded-lg border border-solid border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
              icon="danger"
              title="Remove this contact?"
              description="It is deleted from your account and any queued verification for it is thrown away. A code that has already been sent stops working."
              confirmLabel="Remove"
            />
          </form>
        </div>
      </div>

      {!contact.verified ? (
        <div className="mt-3 border-t border-solid border-slate-200 pt-3">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldQuestion aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{deliveryNote}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <form action={verifyContactAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="contact_id" value={contact.id} />
              <div>
                <label className={LABEL} htmlFor={`code-${contact.id}`}>
                  Six-digit code
                </label>
                <input
                  id={`code-${contact.id}`}
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  className={`${FIELD} w-32 font-mono tracking-[0.3em]`}
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Verify
              </button>
            </form>
            <form action={resendContactCodeAction}>
              <input type="hidden" name="contact_id" value={contact.id} />
              <button
                type="submit"
                className="rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
              >
                Send a new code
              </button>
            </form>
            {contact.attempts > 0 ? (
              <p className="text-xs text-slate-500">
                {contact.attempts} failed attempt{contact.attempts === 1 ? '' : 's'}; five sends you a new code.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The workspace switcher.
 *
 * Not a cookie and not a preference: the list is the set of places this account actually holds a role, so
 * "switching" is following the link. The page says that rather than implying a setting is being saved.
 */
export function WorkspacesPanel({ identity }: { identity: IdentityRead }) {
  return (
    <section aria-labelledby="workspaces-heading" className={`${CARD} p-5 sm:p-6`}>
      <h2 id="workspaces-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Workspaces and roles
      </h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
        One sign-in can act as a customer, as a provider, and as a member of several organisations. These are
        the places this account holds a role; there is nothing to switch on or off, and a workspace you cannot
        see here is one you have no access to.
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {identity.workspaces.map(workspace => (
          <li key={`${workspace.kind}-${workspace.id}`}>
            <Link
              href={workspace.href}
              className="flex h-full flex-col justify-between gap-3 rounded-lg border border-solid border-slate-200 bg-white p-4 no-underline transition-shadow hover:shadow-md"
            >
              <div>
                <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  {workspace.kind === 'personal'
                    ? 'Personal'
                    : workspace.kind === 'provider'
                      ? 'Provider'
                      : 'Organisation'}
                </p>
                <p className="mt-0.5 text-sm font-bold tracking-tight text-slate-900">{workspace.label}</p>
              </div>
              <p className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>{workspace.role}</span>
                <span className={LINK_ARROW}>Open</span>
              </p>
            </Link>
          </li>
        ))}
        {identity.workspaces.length === 0 ? (
          <li className="text-xs text-slate-500">No workspaces are attached to this account.</li>
        ) : null}
      </ul>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <Trash2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          Leaving a workspace is not done from here: an organisation membership is managed by that
          organisation, and a provider profile has its own pages under the provider workspace.
        </span>
      </p>
    </section>
  );
}
