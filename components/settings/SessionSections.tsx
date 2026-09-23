import Link from 'next/link';
import {
  CircleCheck,
  Clock,
  HelpCircle,
  Info,
  Laptop,
  Monitor,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { BADGE_SLATE, CARD, LINK_ARROW } from '@/components/discovery/tokens';
import ConfirmSubmit from '@/components/ui/ConfirmSubmit';
import { formatRelativeTime } from '@/features/settings/device-label';
import { revokeOtherSessionsAction, revokeSessionAction } from '@/features/settings/actions';
import type { SessionRecord, SessionsSummary } from '@/features/settings/sessions';

/**
 * The sessions page's own presentation, all server components.
 *
 * WHAT THIS PAGE CAN SAY AND WHAT IT CANNOT, because the difference is the whole design:
 *
 *   It CAN say which devices hold a live session, what each one claimed to be (GoTrue records the
 *   user agent), the address it connected from, and when it was created or last rotated a token.
 *
 *   It CANNOT say where any of them are. There is no geolocation service in this project and no data
 *   to derive one from, so the brief's "approximate geographical location (e.g. Lagos, Nigeria)" is
 *   replaced by the address itself plus one line saying the platform does not resolve addresses to
 *   places. A made-up city is exactly the kind of detail a person would use to decide "that one is
 *   not me" — inventing it here would be worse than useless.
 */

const DEVICE_ICONS = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: HelpCircle,
} as const;

function DeviceIcon({ session, className }: { session: SessionRecord; className: string }) {
  const Icon = DEVICE_ICONS[session.device.kind] ?? Laptop;
  return <Icon aria-hidden="true" className={className} />;
}

/** Teal, per the brief's "emerald/teal indicator tag" — the primary colour is this platform's teal. */
function CurrentBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
      <CircleCheck aria-hidden="true" className="h-3 w-3" />
      Current session
    </span>
  );
}

/**
 * One device's facts.
 *
 * "LAST ACTIVE" IS ONLY USED WHEN IT IS TRUE. GoTrue records when a session rotated its token
 * (`refreshed_at`) and when it was created. A session that has never refreshed has no activity
 * timestamp at all, and printing "Created 3 days ago" under the heading "Last active" would claim
 * the device was used three days ago when all that is known is that it signed in then. So the
 * fallback is labelled "Signed in" instead.
 */
function SessionFacts({ session, now }: { session: SessionRecord; now: Date }) {
  const activity = session.refreshedAt
    ? { label: 'Last active', value: formatRelativeTime(session.refreshedAt, now) }
    : { label: 'Signed in', value: formatRelativeTime(session.createdAt, now, 'Unknown') };

  return (
    <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
      <div>
        <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Device</dt>
        <dd className="mt-0.5 text-slate-700" title={session.device.raw ?? undefined}>
          {session.device.label}
        </dd>
      </div>
      <div>
        <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Address</dt>
        <dd className="mt-0.5 font-mono text-slate-700">{session.ip ?? 'Not recorded'}</dd>
      </div>
      <div>
        <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">{activity.label}</dt>
        <dd className="mt-0.5 flex items-center gap-1.5 text-slate-700">
          <Clock aria-hidden="true" className="h-3 w-3 text-slate-400" />
          {session.isCurrent ? 'Just now' : activity.value}
        </dd>
      </div>
    </dl>
  );
}

export function CurrentSessionPanel({
  session,
  now,
  stepUpPending,
}: {
  session: SessionRecord;
  now: Date;
  stepUpPending: boolean;
}) {
  return (
    <section aria-labelledby="current-session-heading" className={`${CARD} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <DeviceIcon session={session} className="h-5 w-5" />
          </span>
          <div>
            <h2 id="current-session-heading" className="text-sm font-bold tracking-tight text-slate-900">
              This device
            </h2>
            <p className="text-xs text-slate-500">{session.device.label}</p>
          </div>
        </div>
        <CurrentBadge />
      </div>

      <SessionFacts session={session} now={now} />

      {session.aal === 'aal2' ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-primary-surface p-3 text-xs leading-relaxed text-slate-600">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            This session has passed a second factor, which is what high-risk actions such as moving
            money require.
          </span>
        </p>
      ) : null}

      <div className="mt-5 border-t border-solid border-slate-200 pt-4">
        <form action={revokeSessionAction}>
          <input type="hidden" name="session_id" value={session.id} />
          <ConfirmSubmit
            label="Sign out this device"
            triggerClassName="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            icon="danger"
            title="Sign out of this device?"
            description={
              stepUpPending
                ? 'You will be signed out here immediately and returned to sign-in. Your other devices keep their sessions. Your account has a second factor, so signing in again will ask for it.'
                : 'You will be signed out here immediately and returned to sign-in. Your other devices keep their sessions.'
            }
            confirmLabel="Sign out here"
          />
        </form>
      </div>
    </section>
  );
}

export function SuspiciousActivityCallout({ summary }: { summary: SessionsSummary }) {
  if (!summary.multipleAddresses) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-solid border-secondary bg-secondary-light p-4"
    >
      <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />
      <div className="text-sm leading-relaxed text-amber-900">
        <p className="font-bold">
          This account is signed in from {summary.addresses.length} different addresses.
        </p>
        <p className="mt-1">
          That is not automatically a problem — a phone on mobile data and a laptop on wifi are two
          addresses, and a provider that reassigns your address can make one device look like many.
          It is worth reading the list below for a device you do not recognise, and if you find one,
          signing it out and{' '}
          <Link
            href="/auth/recovery"
            className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-800"
          >
            resetting your password
          </Link>{' '}
          is the order that helps: the new password ends every session that is not signed in again
          afterwards.
        </p>
        <p className="mt-1">
          This page cannot tell you where those addresses are. It shows each address as recorded
          rather than a city name, because the platform has no geolocation data to name one from.
        </p>
      </div>
    </div>
  );
}

export function OtherSessionsPanel({
  sessions,
  now,
  unavailable,
}: {
  sessions: SessionRecord[];
  now: Date;
  unavailable: boolean;
}) {
  return (
    <section aria-labelledby="other-sessions-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="other-sessions-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Other devices
        </h2>
        {sessions.length > 0 ? <span className={BADGE_SLATE}>{sessions.length} signed in</span> : null}
      </div>

      <div className="mt-3 grid gap-3">
        {unavailable ? (
          <div className="flex items-start gap-3 rounded-xl border border-solid border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p>
              The list could not be read, so this page cannot tell you whether another device is
              signed in. That is different from there being none — try reloading, and if it keeps
              failing, use{' '}
              <Link href="/auth/recovery" className={LINK_ARROW}>
                a password reset
              </Link>{' '}
              to end every session at once.
            </p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl border border-solid border-slate-200 bg-white p-6 text-center">
            <p className="text-sm font-semibold text-slate-700">No other active sessions found.</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              This account is signed in only on the device you are using. A device appears here again
              the moment it is used, and disappears once it is signed out and its token expires.
            </p>
          </div>
        ) : (
          sessions.map(session => (
            <article key={session.id} className={`${CARD} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <DeviceIcon session={session} className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight text-slate-900">
                      {session.device.label}
                    </h3>
                    <p className="font-mono text-xs text-slate-500">
                      Session {session.id.slice(0, 8)} · {session.aal === 'aal2' ? 'second factor' : 'password'}
                    </p>
                  </div>
                </div>

                <form action={revokeSessionAction}>
                  <input type="hidden" name="session_id" value={session.id} />
                  <ConfirmSubmit
                    label="Revoke access"
                    triggerClassName="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    title="Revoke access for this device?"
                    description={`${session.device.label} will lose access and disappear from this list. Its browser tab may still look signed in until it next needs a new token — which it will not get.`}
                    confirmLabel="Revoke access"
                  />
                </form>
              </div>

              <SessionFacts session={session} now={now} />
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export function DangerZone({
  otherCount,
  stepUpPending,
  unavailable,
}: {
  otherCount: number;
  stepUpPending: boolean;
  unavailable: boolean;
}) {
  return (
    <section
      aria-labelledby="danger-zone-heading"
      className="rounded-xl border border-solid border-slate-300 bg-slate-50 p-5 sm:p-6"
    >
      <h2 id="danger-zone-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Sign out everywhere else
      </h2>
      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600">
        Ends every session except this one. Each other device keeps working until it next needs a new
        token, which it will not be given — in practice, within the hour.
        {stepUpPending
          ? ' Your account has a second factor, so you will be asked for it before this runs.'
          : ' This account has no second factor, so the confirmation below is the only check the platform can make — there is no password re-entry step available to it.'}
      </p>

      <form action={revokeOtherSessionsAction} className="mt-4">
        <ConfirmSubmit
          label="Sign out all other devices"
          triggerClassName="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
          icon="danger"
          title="Sign out all other devices?"
          description={
            otherCount === 0
              ? 'No other device is signed in right now, so this will end nothing. The session you are using stays signed in.'
              : `${otherCount} other device${otherCount === 1 ? '' : 's'} will be signed out. The device you are using stays signed in.`
          }
          confirmLabel={otherCount === 0 ? 'Sign out other devices' : `Sign out ${otherCount} device${otherCount === 1 ? '' : 's'}`}
        />
      </form>

      {unavailable ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          The session list could not be read, so the number of devices this will end is unknown.
        </p>
      ) : null}
    </section>
  );
}

/**
 * The Suspense fallback.
 *
 * Shaped like the content it replaces — a card, then three rows — so the page does not jump when the
 * read lands. `motion-reduce:animate-none` because a pulsing row is motion, and this is a screen
 * somebody may be looking at because they are already alarmed.
 */
export function SessionsSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden="true">
      <div className="h-44 animate-pulse rounded-xl border border-solid border-slate-200 bg-white motion-reduce:animate-none" />
      <div className="grid gap-3">
        {[0, 1, 2].map(index => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-solid border-slate-200 bg-white motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

/** The one thing every visitor needs to know before reading a list of addresses. */
export function LocationDisclosure() {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        Addresses are shown exactly as the platform recorded them. It does not look them up or name a
        city for them, so a device you recognise will still show a number you may not.
      </span>
    </p>
  );
}

/** Shown after a successful action, as a quiet confirmation rather than a modal. */
export function SessionsActionNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-solid border-primary-subtle bg-primary-surface p-4 text-sm leading-relaxed text-slate-700"
    >
      <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>{children}</div>
    </div>
  );
}
