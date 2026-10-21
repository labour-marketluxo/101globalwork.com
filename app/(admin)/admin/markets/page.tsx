import { MarketDirectory } from '@/components/admin/TaxonomySections';
import { ACCESS_NOTE } from '@/components/admin/trust-copy';
import { getAdminContext } from '@/features/admin/context';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { getMarkets, resolveMarketSetting } from '@/features/admin/taxonomy';

export const metadata = { title: 'Markets', robots: { index: false, follow: false } };

/**
 * /admin/markets — global adapter configuration.
 *
 * ⚠️ MARKET BEHAVIOUR IS DATA. Address rules, tax adapters, payment routes and language support are `market_settings`
 * rows, so launching a market does not touch the core schema. The precedence chain is walked and SHOWN: global, then
 * market, then region, then organisation, and the page says plainly that the platform has no per-project store yet
 * rather than implying a level that does not exist.
 */
export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ setting?: string; market?: string; saved?: string; failed?: string; step_up?: string; changed?: string }>;
}) {
  const query = await searchParams;
  const [context, markets, reasons, resolution] = await Promise.all([
    getAdminContext(),
    getMarkets(),
    getReasonCodes(),
    query.setting ? resolveMarketSetting(query.setting, query.market) : Promise.resolve(null),
  ]);

  const canRead = Boolean(context?.has('platform.markets.read') || context?.has('platform.markets.manage') || context?.has('platform.admin.manage'));
  const canManage = Boolean(context?.has('platform.markets.manage') || context?.has('platform.admin.manage'));

  if (!canRead) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>{ACCESS_NOTE}</p>
        </section>
      </div>
    );
  }

  return (
    <MarketDirectory
      markets={markets}
      resolution={resolution}
      reasons={reasons.market_change}
      canManage={canManage}
      query={query}
    />
  );
}
