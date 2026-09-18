import { PreviewSection } from '@/components/marketing/PageSections';

/**
 * RoutePreviews — the three concise bands that replaced the landing page's heavy
 * sections.
 *
 * WHAT WAS HERE BEFORE, AND WHERE IT WENT
 *
 *   ServiceVectors' three-step "how it works" block  → /how-it-works, which now
 *     carries the seven-stage customer and provider journeys the PRD specifies.
 *   TrustSection's four-card bento (agreement, payment hold, provider checks,
 *     the itemized-quote rationale)                 → /trust-and-safety, which
 *     adds the verification detail, safety guidance, reporting paths and the
 *     limitations that a bento card had no room to state.
 *   Nothing on pricing existed on the landing page, because the platform has no
 *     published fee schedule; /pricing now holds the fee structure, the tax and
 *     FX caveats and the effective-date states.
 *
 * Each band keeps the claim and drops the evidence, which is the point: the
 * evidence is one click away and the landing page stays a page you can read on a
 * phone on a bad connection (a PRD requirement for all three routes).
 *
 * The three use the same primitive, and deliberately so — they are the same kind
 * of object: a claim, the three things behind it, and the way to the detail.
 */
export function HowItWorksPreview() {
  return (
    <PreviewSection
      id="how-it-works"
      tone="canvas"
      accent="primary"
      eyebrow="How it works"
      title="From a description to finished work"
      lede="The same three beats on every job, from a leaking tap to a multi-stage fit-out — and the same eight states a request moves through behind them."
      points={[
        {
          title: 'Describe it',
          body: 'Write what needs doing in your own words. That description becomes the scope both sides work from.',
        },
        {
          title: 'Compare quotes',
          body: 'Verified providers quote against that same scope, itemized, so the numbers are answering the same question.',
        },
        {
          title: 'Approve, then pay',
          body: 'Payment is held and released against your approval, with a window to raise a problem first.',
        },
      ]}
      href="/how-it-works"
      linkLabel="Learn more about how it works"
    />
  );
}

export function TrustPreview() {
  return (
    <PreviewSection
      id="trust"
      tone="white"
      accent="emerald"
      eyebrow="No upfront risk"
      title="You pay when the work is approved"
      lede="No deposit into a stranger’s account, and no guessing what “done” means. Here is what is checked, what is held, and what none of it covers."
      points={[
        {
          title: 'Payment held',
          body: 'Your payment sits with the payment provider rather than being passed on — a hold, not a transfer.',
        },
        {
          title: 'Released on approval',
          body: 'Nothing is released until you approve the finished work, and a problem raised first can still change the outcome.',
        },
        {
          title: 'Providers checked',
          body: 'Identity before quoting, licence where the trade needs one, insurance where it applies — re-checked as details change.',
        },
      ]}
      href="/trust-and-safety"
      linkLabel="Read the trust & safety detail"
    />
  );
}

export function PricingPreview() {
  return (
    <PreviewSection
      id="pricing"
      tone="canvas"
      accent="amber"
      eyebrow="Pricing & fees"
      title="What it costs, and what it does not"
      lede="Two numbers decide a job: the provider’s quote, which the provider sets, and the platform’s own fee — which is published with its effective date or not quoted at all."
      points={[
        {
          title: 'Posting is free',
          body: 'Browsing, searching and posting a request cost nothing, and providers are not charged to be listed or to quote.',
        },
        {
          title: 'The quote is the price',
          body: 'Providers price their own work; the platform does not set trade rates. Itemized quotes are what make two of them comparable.',
        },
        {
          title: 'Fees are published or absent',
          body: 'No fee schedule is in force today, so no fee figure is quoted anywhere on this site. There is a page that says so in full.',
        },
        {
          title: 'Taxes and FX are not ours',
          body: 'Tax follows the provider’s jurisdiction and FX is handled by the payment provider and the bank, so both are stated as caveats instead of being buried in a total.',
        },
      ]}
      href="/pricing"
      linkLabel="See pricing & fees"
    />
  );
}
