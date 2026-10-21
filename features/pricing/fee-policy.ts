import type { FeePolicy, Money } from './types';

/**
 * THE FEE POLICY — the single source of truth for every figure published on
 * /pricing. Nothing else in the app may hard-code a rate.
 *
 * ⚠️ THIS IS INTENTIONALLY UNPUBLISHED. `published: false` is not a placeholder
 * to be flipped casually — it is the honest state of the product: no fee
 * schedule has been agreed, so /pricing renders its "not yet in force" state and
 * quotes no numbers at all. That is also why there are no rates in this file to
 * copy from: inventing 5%/10% here would put an advertised commercial term in
 * front of customers, which is exactly what the rest of this codebase refuses to
 * do (see the removed proof-metrics in components/landing/*).
 *
 * TO PUBLISH A SCHEDULE
 *
 *   1. Set `published: true` and `effectiveFrom` to the ISO date the rates take
 *      effect (the PRD requires an effective date on this page — a schedule
 *      without one cannot be checked against a quote).
 *   2. Fill `customer` and/or `provider`. Use `percent` (of the agreed quote) or
 *      `flatMinor` (a fixed amount in minor units, e.g. kobo/cents), or both.
 *      Leave a side `null` if that side pays nothing.
 *   3. Add `examples` — the PRD asks for worked examples, and the page computes
 *      them from these quote amounts, so the arithmetic can never drift from the
 *      rates above.
 *   4. Set `reviewedAt`. The PRD lists "outdated pricing" as a state this page
 *      must handle; the page shows a staleness notice once `reviewedAt` is older
 *      than the window below, so a forgotten review is visible rather than
 *      silent.
 *
 * The PRD requirement this satisfies: "Values must come from configured market
 * policy."
 */

/** How long a published schedule may go unreviewed before the page warns. */
export const FEE_REVIEW_WINDOW_DAYS = 180;

export const FEE_POLICY: FeePolicy = {
  published: false,
  effectiveFrom: null,
  reviewedAt: null,
  customer: null,
  provider: null,
  examples: [],
  /** Caveats that apply to every market; market-specific ones go in `markets`. */
  notes: [],
};

/** Total fee for an amount, or null when the policy cannot price it yet. */
export function feeFor(amount: Money, side: 'customer' | 'provider'): Money | null {
  const rate = side === 'customer' ? FEE_POLICY.customer : FEE_POLICY.provider;
  if (!FEE_POLICY.published || !rate) return null;

  const percentPart = rate.percent === null ? 0 : Math.round((amount.amountMinor * rate.percent) / 100);
  const flatPart = rate.flatMinor ?? 0;
  return { amountMinor: percentPart + flatPart, currency: amount.currency };
}
