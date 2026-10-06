import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Briefcase, CalendarClock, HardHat, Mail, MapPin, UsersRound } from '@/components/ui/icons';
import { SubmitButton } from '@/components/auth/AuthFormFields';
import { AUTH_LINK, AuthNotice, AuthShell } from '@/components/auth/AuthSections';
import { chooseJourneyAction } from '@/features/onboarding/actions';
import { getMyPendingInvitation } from '@/features/invitations/invitation';
import { getDefaultMarketSlug, getMarket } from '@/features/discovery/data/market-catalog';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Onboarding — /onboarding
 *
 * Where a newly verified account decides which journey it is on. It creates nothing: no second account,
 * no profile, no role. It records an intent and forwards the visitor into an existing flow, which is
 * the only reading of "choose your role without creating duplicate accounts" that this schema supports —
 * a person can hire on Monday and offer a trade later from the same account, and both journeys already
 * hang off that one identity.
 *
 * ⚠️ THREE CARDS WERE ASKED FOR. TWO ARE REAL.
 *
 *   Hire services     /work — the customer workspace, which exists.
 *   Offer services    /provider/onboarding — the provider journey, which exists.
 *   Manage team       There is no organisations table, no team membership, and no account that more
 *                     than one person signs in to. This card is rendered as unavailable rather than
 *                     omitted, because a visitor who was told to look for it would otherwise hunt for
 *                     a feature that is not missing by accident.
 *
 * THE MARKET IS CONFIRMED, NOT CHOSEN. The brief asks for a market selector; the catalogue contains one
 * market. A dropdown with a single option is a control that cannot do anything, so the page states which
 * market the account operates in and says plainly that the platform has not opened a second one.
 *
 * THE INVITATION SHORTCUT IS REAL, in both forms it can take. If the visitor arrived with a token —
 * `?invitation=…`, which is how an email link that has been through sign-in comes back — the banner
 * links straight to it. Otherwise the page asks the database whether the signed-in address has an
 * invitation pending, and if so says so and points at the email, because the token only ever exists in
 * the message itself and inventing a link to it is impossible.
 *
 * THE CHOICE IS A RADIO GROUP INSIDE THE FORM, on the same reasoning as the sign-up intent selector:
 * it is part of what gets submitted, it works without JavaScript, and it cannot fall out of step with
 * what the URL happens to say.
 */

export const metadata: Metadata = {
  title: 'Choose your journey',
  description: 'Pick how you want to use 101GlobalWork: hiring, offering services, or both.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ invitation?: string; redirect?: string }>;

export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Onboarding is meaningless without an identity to attach the choice to.
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent('/onboarding')}`);

  // The intent captured at sign-up pre-selects a card. It is a hint, not a decision: this page is where
  // the visitor can confirm or change it.
  const intent = user.user_metadata?.signup_intent === 'provider' ? 'provider' : 'customer';

  return (
    <AuthShell
      size="lg"
      eyebrow="Welcome to 101GlobalWork"
      title="How do you plan to use the platform?"
      lede="One account covers both sides of the work. Pick where you want to start — you can add the other journey later without creating a second account."
      footer={
        <>
          Just looking around?{' '}
          <Link href="/how-it-works" className={AUTH_LINK}>
            How it works
          </Link>{' '}
          and{' '}
          <Link href="/trust-and-safety" className={AUTH_LINK}>
            trust and safety
          </Link>{' '}
          explain the platform. Nothing is published about you either way.
        </>
      }
    >
      <Suspense fallback={<OnboardingSkeleton />}>
        <OnboardingBody intent={intent} invitationToken={params.invitation} />
      </Suspense>
    </AuthShell>
  );
}

/**
 * The reads that need the session.
 *
 * Split out so the card's identity — is anyone signed in, and which journey were they promised? — is
 * settled before the shell flushes, while the four catalogue and invitation reads stream behind a
 * skeleton. Same boundary rule as the discovery routes: a Suspense boundary is placed AFTER the guard,
 * never around it.
 */
async function OnboardingBody({
  intent,
  invitationToken,
}: {
  intent: 'customer' | 'provider';
  invitationToken?: string;
}) {
  const supabase = await createSupabaseServerClient();

  const [marketSlug, pending] = await Promise.all([getDefaultMarketSlug(), getMyPendingInvitation()]);
  const market = await getMarket(marketSlug);

  // Real signals about where this account already is, so the page can offer "continue" rather than
  // "set up" — and so nobody is asked to choose something they chose last week.
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .maybeSingle();

  let hasProvider = false;
  if (account?.id) {
    const { count } = await supabase
      .from('providers')
      .select('id', { count: 'exact', head: true })
      .eq('owner_account_id', account.id)
      .neq('status', 'closed');
    hasProvider = Boolean(count);
  }

  return (
    <div className="grid gap-5">
      {/* A real invitation outranks everything else on this page: it is time-limited and somebody is
          waiting on it. */}
      {pending || invitationToken ? (
        <AuthNotice tone="info" title="You have an invitation waiting.">
          {pending ? (
            <>
              {pending.inviterName} invited this address to hold administrative access as{' '}
              <span className="font-semibold">{pending.roleName}</span>
              {pending.expiresAt
                ? `, and it lapses ${new Date(pending.expiresAt).toLocaleDateString(undefined, { dateStyle: 'long' })}`
                : ''}
              .{' '}
            </>
          ) : (
            'An invitation came through with this visit. '
          )}
          {invitationToken ? (
            <Link
              href={`/invitations/${encodeURIComponent(invitationToken)}`}
              className={AUTH_LINK}
            >
              Accept invitation →
            </Link>
          ) : (
            <>
              Open the link in the invitation email to accept it — the link itself is the credential, so
              there is nothing to click from here.
            </>
          )}
        </AuthNotice>
      ) : null}

      <form action={chooseJourneyAction} className="grid gap-4">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2 block font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Where do you want to start?
          </legend>

          <div className="grid gap-2">
            <JourneyCard
              value="customer"
              selected={intent === 'customer'}
              icon={<Briefcase aria-hidden="true" className="h-5 w-5" />}
              title="Hire services"
              detail="Post requests, compare itemized quotes from verified local providers, and manage the work you commission."
              footnote={
                hasProvider
                  ? 'Your account already has a provider profile — choosing this starts the customer workspace alongside it.'
                  : null
              }
            />
            <JourneyCard
              value="provider"
              selected={intent === 'provider'}
              icon={<HardHat aria-hidden="true" className="h-5 w-5" />}
              title="Offer services"
              detail="Create your business profile, quote on requests in your area, and get paid when the work is approved."
              footnote={
                hasProvider
                  ? 'You already have a provider profile, so this continues it rather than starting again.'
                  : 'The next step collects your services, service area and verification — no profile is published until those are in place.'
              }
            />

            {/* Unavailable, and explicit. A disabled card with a reason is honest; a missing card is a
                feature the visitor keeps looking for. */}
            <div className="flex gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
              <UsersRound aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
              <div>
                <p className="text-sm font-semibold text-slate-500">
                  Manage a team <span className="font-sans text-[11px] font-bold tracking-wider uppercase">· not available</span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Multi-user accounts do not exist on this platform yet: every account here belongs to one
                  person, and there is no way to invite colleagues into yours. Rather than a card that
                  leads nowhere, this is the honest state of it.
                </p>
              </div>
            </div>
          </div>
        </fieldset>

        {/* Confirmed, not chosen — see the header. */}
        <div className="flex gap-3 rounded-lg border border-solid border-slate-200 bg-slate-50 p-3">
          <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Operating market: {market?.displayName ?? marketSlug.toUpperCase()}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
              {market?.currencyCode ? `Quotes and payments are in ${market.currencyCode}. ` : ''}
              This is the only market the platform operates in today, so there is nothing to choose —
              a selector with one option would be a control that cannot do anything. It becomes a
              question the day a second market opens.
            </p>
          </div>
        </div>

        <SubmitButton pendingLabel="Setting up your workspace…">Continue Setup</SubmitButton>
      </form>

      <p className="flex gap-2 border-t border-solid border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
        <Mail aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>
          Your choice sets which journey the workspace opens on. It is not a permission: provider
          capability is granted by the platform after verification, and nothing on this page can confer
          it.
        </span>
      </p>
    </div>
  );
}

/** One selectable journey. A label wrapping the radio, so the whole card is the target. */
function JourneyCard({
  value,
  selected,
  icon,
  title,
  detail,
  footnote,
}: {
  value: 'customer' | 'provider';
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  footnote?: string | null;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-solid border-slate-300 p-3 transition-colors has-checked:border-primary has-checked:bg-primary-surface hover:border-primary">
      <input
        type="radio"
        name="journey"
        value={value}
        defaultChecked={selected}
        className="mt-1 h-4 w-4 shrink-0 accent-secondary"
      />
      <span>
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <span className="text-primary">{icon}</span>
          {title}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-600">{detail}</span>
        {footnote ? (
          <span className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
            <CalendarClock aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
            {footnote}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** Two cards' worth of shape, so the card does not jump when the reads land. */
function OnboardingSkeleton() {
  return (
    <div className="grid gap-3" aria-hidden="true">
      {[0, 1].map((index) => (
        <div key={index} className="h-24 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
      ))}
      <div className="h-20 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
    </div>
  );
}
