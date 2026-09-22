import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  ActionRequiredBanner,
  CustomerHero,
  DashboardGrid,
  DashboardSkeleton,
  DashboardUnavailable,
  NewCustomerBanner,
} from '@/components/customer/CustomerSections';
import { getCustomerDashboard } from '@/features/customer/requests';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The customer dashboard — /customer
 *
 * ⚠️ THIS SUPERSEDES /work, WHICH NOW REDIRECTS HERE. Two customer dashboards would be two answers to
 * "what is in progress", and the second one to be opened would always be the wrong one. `/work` is kept
 * alive as a redirect because it was linked from the header, the footer and every auth screen for
 * weeks.
 *
 * WHAT IS DERIVED RATHER THAN STORED, and why it matters on a dashboard: the status pills come from
 * `requests.state` through the same mapping the rest of the app uses, the quotes count counts only
 * quotes still awaiting a decision, and the money due comes from `payment_obligations` in its own
 * pending states. Nothing on this page is a cached total that could drift from the row behind it.
 */
export const metadata: Metadata = {
  title: 'Customer dashboard',
  description: 'Your requests, quotes, scheduled work and payments.',
  robots: { index: false, follow: false },
};

export default async function CustomerDashboardPage() {
  // The name is read here rather than in the layout so the greeting can stream with the page; the
  // layout already resolved the session, and a second `getUser` is a cached round trip.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const firstName = user?.email ? user.email.split('@')[0]?.split(/[._-]/)[0] ?? null : null;

  return (
    <div className="grid gap-6">
      <CustomerHero firstName={firstName} />

      {/* In-page Suspense, placed after the layout's guard: a route-level loading.tsx would flush a 200
          shell before the redirect in the layout could run, turning a signed-out visit into a soft 404. */}
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody />
      </Suspense>
    </div>
  );
}

async function DashboardBody() {
  const data = await getCustomerDashboard();

  if (data.unavailable) return <DashboardUnavailable />;
  if (data.isNewCustomer) return <NewCustomerBanner />;

  return (
    <>
      <ActionRequiredBanner paymentsDue={data.paymentsDue} awaitingApproval={data.awaitingApproval} />
      {data.drafts.length > 0 ? (
        <p className="text-xs leading-relaxed text-slate-500">
          {data.drafts.length} saved draft{data.drafts.length === 1 ? '' : 's'} below {data.drafts.length === 1 ? 'has' : 'have'} not
          been sent to anybody yet. Submit {data.drafts.length === 1 ? 'it' : 'them'} when the description is complete — only
          then can providers be matched.
        </p>
      ) : null}
      <DashboardGrid data={data} />
    </>
  );
}
