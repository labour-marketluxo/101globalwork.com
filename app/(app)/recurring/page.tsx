import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Repeat } from '@/components/ui/icons';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import AccountSettingsHeader from '@/components/settings/AccountSettingsHeader';
import {
  BillingDisclosure,
  NewPlanPanel,
  PlanCard,
  PlansEmpty,
  RecurringNotice,
  RecurringUnavailable,
} from '@/components/recurring/RecurringSections';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { RECURRING_PATH } from '@/features/recurring/paths';
import { getAccountShell } from '@/features/settings/shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMyRecurringPlans } from '@/features/recurring/plans';
import {
  recurringFailureCode,
  recurringSuccessCode,
  RECURRING_FAILURE_COPY,
  RECURRING_SUCCESS_COPY,
} from '@/features/recurring/copy';

/**
 * Recurring work — /recurring
 *
 * ⚠️ THE PAGE OPENS WITH WHAT THE PRICE IS NOT. The single most dangerous misreading of a scheduling surface
 * is that it bills: a customer who believes a standing charge is running when nothing is charged, or worse
 * believes nothing will be charged when something might be, is a support case either way. So the disclosure is
 * above the plans and repeated on every card, and it is a statement about this platform rather than a general
 * warning — there is no card on file and no mandate, so there is nothing here that could charge anybody.
 *
 * ⚠️ THERE IS NO PROVIDER-SIDE ENTRY POINT OF ITS OWN, AND THAT IS A LIMIT WORTH NAMING. A provider reaches
 * this page through their account and sees the plans they are party to, with the one action that is theirs —
 * deciding a cadence request. They cannot create a plan here, because a plan is created by the account that is
 * commissioning the work. A provider-side diary is a different surface and is not built.
 */
export const metadata: Metadata = {
  title: 'Recurring work',
  description: 'Standing maintenance agreements and their scheduled visits.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; saved?: string }>;

export default async function RecurringWorkPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: RECURRING_PATH }));

  const [shell, read] = await Promise.all([getAccountShell(), getMyRecurringPlans()]);

  const failure = recurringFailureCode(params.failed);
  const success = recurringSuccessCode(params.saved);
  const now = new Date();

  const active = read.plans.filter((plan) => plan.status === 'active');
  const paused = read.plans.filter((plan) => plan.status === 'paused');
  const ended = read.plans.filter((plan) => plan.status === 'ended');

  return (
    <div className={PAGE_SHELL}>
      <AccountSettingsHeader shell={shell} showAccountNav current="recurring" />

      <header className="mt-6">
        <h1 className="flex items-center gap-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          <Repeat aria-hidden="true" className="h-6 w-6 text-primary" />
          Recurring work
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Standing arrangements for work that repeats: the platform keeps the calendar, the site and the agreed
          price in one place, and either side can pause it or ask for a different cadence.
        </p>
      </header>

      <div className="mt-5 grid gap-4">
        {failure ? <RecurringNotice tone="warning">{RECURRING_FAILURE_COPY[failure]}</RecurringNotice> : null}
        {success ? <RecurringNotice tone="success">{RECURRING_SUCCESS_COPY[success]}</RecurringNotice> : null}
        {read.available ? <BillingDisclosure note={read.billingNote} /> : null}
      </div>

      {!read.available ? (
        <div className="mt-6">
          <RecurringUnavailable />
        </div>
      ) : (
        <div className="mt-6 grid gap-8">
          {read.plans.length === 0 ? (
            <PlansEmpty />
          ) : (
            <>
              {[
                { key: 'active', heading: 'Active plans', plans: active },
                { key: 'paused', heading: 'Paused', plans: paused },
                { key: 'ended', heading: 'Ended', plans: ended },
              ]
                .filter((group) => group.plans.length > 0)
                .map((group) => (
                  <section key={group.key} aria-labelledby={`group-${group.key}`} className="grid gap-3">
                    <h2 id={`group-${group.key}`} className="text-lg font-bold tracking-tight text-slate-900">
                      {group.heading}
                      <span className="ml-2 font-sans text-xs font-normal text-slate-500">
                        {group.plans.length}
                      </span>
                    </h2>
                    <ul className="grid gap-4">
                      {group.plans.map((plan) => (
                        <li key={plan.id}>
                          <PlanCard plan={plan} billingNote={read.billingNote} now={now} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </>
          )}

          <NewPlanPanel
            providers={read.providers}
            assets={read.assets}
            projects={read.projects}
            defaultCurrency={read.defaultCurrency}
          />
        </div>
      )}
    </div>
  );
}
