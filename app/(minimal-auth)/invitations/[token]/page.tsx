import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock, MailCheck, ShieldAlert, ShieldCheck, UserCog } from '@/components/ui/icons';
import {
  AUTH_CTA,
  AUTH_CTA_SECONDARY,
  AUTH_LINK,
  AUTH_TEXT_BUTTON,
  AuthNotice,
  AuthShell,
} from '@/components/auth/AuthSections';
import {
  acceptInvitationAction,
  declineInvitationAction,
  switchInvitationAccountAction,
} from '@/features/invitations/actions';
import {
  daysUntil,
  describeCapabilities,
  getInvitationByToken,
  invitationErrorMessage,
  invitationErrorCode,
} from '@/features/invitations/invitation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Invitation — /invitations/{token}
 *
 * ⚠️ WHAT THIS INVITES YOU TO, because the brief describes something this platform does not have.
 *
 * The brief asks for invitations to join an ORGANISATION or a PROJECT, with roles like "Manager" and
 * "Team Member" behind them. There is no organisations table here, no team membership and no
 * per-organisation role — so there is nothing that could honestly be rendered as "Manager". What the
 * platform does have is `platform_admin_invitations`: an invitation to hold an ADMINISTRATIVE role on
 * the platform itself (support, trust, finance, operations, discovery, or the owner role), which grants
 * real, permission-checked, audited powers over the platform's own operations.
 *
 * This page therefore renders the real invitation, in the real vocabulary. It does not borrow
 * "organisation" wording, because the single most important thing on this page is that the recipient
 * understands what they are accepting.
 *
 * THE STATES, and why each one exists:
 *
 *   unavailable     the read itself failed — different from a bad token, and the page says so rather
 *                   than blaming the link for the platform's problem.
 *   invalid         the token matched nothing: clipped, retyped, or from another environment.
 *   expired         reported, never written — a page that expires an invitation by being visited is a
 *                   page that a mail client's link preview could trigger.
 *   accepted / revoked / declined   the invitation is spent, and each has its own cause and its own
 *                   next step, because "already used" and "withdrawn by an administrator" are not the
 *                   same story to the person reading it.
 *   pending, signed out       the details plus both routes in, with the token preserved.
 *   pending, wrong account    a warning BEFORE the accept button, not an error after it. The database
 *                   refuses this case, so offering the button would be offering a failure.
 *   pending, correct account  accept or decline.
 *
 * NOINDEX, NOFOLLOW, and the metadata lives on the page rather than in a layout because the route is
 * the only page beneath /invitations — a layout for one page is a directory for one page.
 */

export const metadata: Metadata = {
  title: 'Invitation',
  description: 'An invitation to hold an administrative role on 101GlobalWork.',
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;
type SearchParams = Promise<{ error?: string; declined?: string }>;

export default async function InvitationPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { token } = await params;
  const query = await searchParams;

  const invitation = await getInvitationByToken(token);
  const code = invitationErrorCode(query.error);
  const declined = query.declined === '1';

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const here = `/invitations/${encodeURIComponent(token)}`;
  const signInHref = `/auth/sign-in?next=${encodeURIComponent(here)}`;
  const signUpHref = `/auth/sign-up?redirect=${encodeURIComponent(here)}`;

  const remaining = daysUntil(invitation.expiresAt);
  const expiryText = invitation.expiresAt
    ? new Date(invitation.expiresAt).toLocaleString(undefined, {
        dateStyle: 'full',
        timeStyle: 'short',
      })
    : null;

  /* ------------------------------------------------------------- nothing to decide */

  if (invitation.status !== 'pending') {
    const state = SPENT_STATES[invitation.status] ?? SPENT_STATES.invalid;
    const isUnavailable = invitation.status === 'unavailable';

    return (
      <AuthShell
        size="lg"
        eyebrow="Invitation"
        title={state.title}
        lede={state.lede}
        notice={
          isUnavailable ? (
            <AuthNotice tone="error">{invitationErrorMessage('unavailable')}</AuthNotice>
          ) : null
        }
        footer={
          <>
            Already have an account?{' '}
            <Link href={signInHref} className={AUTH_LINK}>
              Sign in
            </Link>
            .
          </>
        }
      >
        <div className="grid gap-4">
          <p className="text-sm leading-relaxed text-slate-600">{state.whatToDo}</p>
          <p className="border-t border-solid border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
            {isUnavailable
              ? 'Nothing has changed about the invitation itself — reload, and if it keeps failing the platform is the problem rather than the link.'
              : 'Only an administrator of this platform can issue an invitation, so a replacement has to come from the person who sent this one. There is no self-service way to request another, and this page will not pretend otherwise.'}
          </p>
        </div>
      </AuthShell>
    );
  }

  /* ------------------------------------------------------------------ the decision */

  const areas = describeCapabilities(invitation.capabilities);
  const wrongAccount = Boolean(user) && !invitation.emailMatchesSignedIn;

  return (
    <AuthShell
      size="lg"
      eyebrow="Invitation"
      title={`Join as ${invitation.roleName ?? 'an administrator'}`}
      lede={`${invitation.inviterName ?? 'A platform administrator'}${
        invitation.inviterIsOwner ? ' (the platform owner)' : ''
      } has invited ${invitation.emailMasked ?? 'you'} to hold an administrative role on 101GlobalWork.`}
      notice={
        code ? (
          <AuthNotice tone="error">{invitationErrorMessage(code)}</AuthNotice>
        ) : declined ? (
          <AuthNotice tone="success" title="Declined.">
            The invitation is closed and its link no longer works. Nothing was added to your account,
            and the person who invited you will see that it was declined rather than unanswered.
          </AuthNotice>
        ) : wrongAccount ? (
          <AuthNotice tone="error" title="This invitation is for a different address.">
            {invitationErrorMessage('wrong_account')}
          </AuthNotice>
        ) : remaining !== null && remaining <= 1 ? (
          <AuthNotice tone="error" title="This invitation expires soon.">
            It lapses {expiryText}, under a day away. Accept now or ask for a new one — an expired
            invitation cannot be revived, only replaced.
          </AuthNotice>
        ) : null
      }
      footer={
        <>
          Not expecting this?{' '}
          <Link href="/trust-and-safety" className={AUTH_LINK}>
            Trust and safety
          </Link>{' '}
          explains how the platform verifies people. An unexpected invitation is worth treating as
          phishing: do not use it, and{' '}
          <span className="font-semibold text-slate-900">decline it</span> below, which disables the
          link for everyone.
        </>
      }
    >
      <div className="grid gap-5">
        {/* What the invitation is for */}
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-solid border-slate-200 bg-slate-50 p-4">
            <dt className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <UserCog aria-hidden="true" className="h-3.5 w-3.5" />
              Role
            </dt>
            <dd className="mt-1.5 text-sm font-bold text-slate-900">
              {invitation.roleName ?? 'Administrator'}
            </dd>
          </div>
          <div className="rounded-lg border border-solid border-slate-200 bg-slate-50 p-4">
            <dt className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <MailCheck aria-hidden="true" className="h-3.5 w-3.5" />
              Invited address
            </dt>
            <dd className="mt-1.5 text-sm font-bold text-slate-900">
              {invitation.emailMasked ?? '—'}
            </dd>
          </div>
          <div className="rounded-lg border border-solid border-slate-200 bg-slate-50 p-4 sm:col-span-2">
            <dt className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
              Expires
            </dt>
            <dd className="mt-1.5 text-sm font-bold text-slate-900">
              {expiryText ?? 'No expiry recorded'}
              {remaining !== null ? (
                <span className="ml-2 font-normal text-slate-600">
                  ({remaining} day{remaining === 1 ? '' : 's'} left)
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        {/* What accepting grants — the reason this page exists rather than an email button */}
        <section aria-labelledby="invitation-powers">
          <h2
            id="invitation-powers"
            className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase"
          >
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
            What accepting gives you
          </h2>
          {areas.length ? (
            <ul className="mt-3 grid gap-3">
              {areas.map((area) => (
                <li key={area.label} className="flex gap-3">
                  <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{area.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                      {area.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              This role holds no capabilities that this page can list. That is unusual enough to be
              worth checking with the person who invited you before accepting.
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Administrative access is separate from your normal account and is not public: nothing about
            accepting this appears on any public page. Every administrative action is permission-checked
            and recorded, and the access can be revoked later without touching your account.
          </p>
        </section>

        {/* The decision */}
        <div className="grid gap-3 border-t border-solid border-slate-200 pt-5">
          {wrongAccount ? (
            <>
              <p className="text-sm leading-relaxed text-slate-600">
                You are signed in{user?.email ? ` as ${user.email}` : ''}, which is not the address this
                was sent to. Sign in with the invited address to accept — or decline, if this invitation
                is not for you.
              </p>
              <form action={switchInvitationAccountAction}>
                <input type="hidden" name="token" value={token} />
                <button type="submit" className={AUTH_CTA}>
                  Sign in as a different user →
                </button>
              </form>
            </>
          ) : user ? (
            <form action={acceptInvitationAction}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className={AUTH_CTA}>
                Accept Invitation →
              </button>
            </form>
          ) : (
            <>
              <Link href={signInHref} className={AUTH_CTA}>
                Sign in to accept →
              </Link>
              <Link href={signUpHref} className={AUTH_CTA_SECONDARY}>
                Create an account instead
              </Link>
              <p className="text-xs leading-relaxed text-slate-500">
                Accepting needs an account whose email address matches the invitation — the database
                checks that, not this page. Either route brings you straight back here with the
                invitation intact.
              </p>
            </>
          )}

          <form action={declineInvitationAction}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className={AUTH_TEXT_BUTTON}>
              Decline Invitation
            </button>
          </form>
        </div>

        {/* The one honest limit of this page */}
        <p className="border-t border-solid border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-900">There is no &ldquo;report invitation&rdquo; button</span>{' '}
          — the platform has no reporting mechanism, and a button that emailed nobody would be worse than
          saying so. Declining is the action that does something real: it disables this link. If the
          invitation itself looks fraudulent, report the message in your email client and do not open its
          attachments.
        </p>
      </div>
    </AuthShell>
  );
}

/** Copy for every state that is not a live decision. */
const SPENT_STATES: Record<string, { title: string; lede: string; whatToDo: string }> = {
  invalid: {
    title: 'That invitation link did not work',
    lede: 'No invitation matches this link. Nothing is wrong with your account.',
    whatToDo:
      'Invitation links are long and single-use, and a link that was copied, wrapped or retyped by hand has usually lost a character somewhere. Open the original message and use its link directly rather than retyping the address.',
  },
  expired: {
    title: 'This invitation has expired',
    lede: 'Invitations are time-limited, and this one is past its date.',
    whatToDo:
      'An expired invitation cannot be reactivated — the platform only issues new ones. Ask the person who invited you to send a fresh invitation; it takes them a moment.',
  },
  accepted: {
    title: 'This invitation has already been accepted',
    lede: 'Whoever it was addressed to has already joined with administrative access.',
    whatToDo:
      'If that was you, the access is on your account: sign in and open the administrative workspace. If it was not, treat it as worth a conversation with the person who invited you.',
  },
  revoked: {
    title: 'This invitation was withdrawn',
    lede: 'An administrator cancelled it before it was accepted.',
    whatToDo:
      'Withdrawn invitations cannot be reinstated. If you were expecting access, ask the person who invited you whether it was withdrawn deliberately — the platform keeps a record of who withdrew it and when.',
  },
  declined: {
    title: 'This invitation was declined',
    lede: 'Someone asked not to receive it, and the link no longer works.',
    whatToDo:
      'Nothing further is needed. If you did not decline it and you still want the access, ask the person who invited you for a new invitation — the old link stays dead.',
  },
  unavailable: {
    title: 'We could not check this invitation',
    lede: 'The platform could not read the invitation just now. This is not a verdict on the link.',
    whatToDo:
      'Reload the page. If it keeps happening the platform is unwell rather than the invitation being wrong — and the invitation itself has not been used or altered by this attempt.',
  },
};
