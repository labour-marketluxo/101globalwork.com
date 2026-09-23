import { redirect } from 'next/navigation';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * The retired payout page — kept alive as a redirect.
 *
 * ⚠️ ONE HOP, AND THE OLD URL STAYS ALIVE. `/provider/payouts` was linked from the workspace header, the readiness
 * checklist, onboarding and anything a provider had bookmarked, and it is exactly where somebody who is waiting for
 * money will type. A 404 there would read as "the platform lost my payout account".
 *
 * ⚠️ AND WHY IT MOVED. The brief's navigation is Earnings › Payouts, and one page that both summarises the money
 * and changes the account it leaves through is how a provider ends up editing a destination while looking at a
 * figure that has nothing to do with it.
 */
export default async function RetiredProviderPayoutsPage() {
  redirect(PROVIDER_PATHS.payouts);
}
