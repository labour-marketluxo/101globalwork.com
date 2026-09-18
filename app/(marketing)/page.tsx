import ClosingCta from '@/components/landing/ClosingCta';
import HeroSection from '@/components/landing/HeroSection';
import { HowItWorksPreview, PricingPreview, TrustPreview } from '@/components/landing/RoutePreviews';
import ServiceVectors from '@/components/landing/ServiceVectors';
import TradeVerticals from '@/components/landing/TradeVerticals';

/**
 * Landing page — the Stitch design, ported section for section, and now the
 * OVERVIEW of three dedicated public routes rather than the only place that
 * explains anything.
 *
 *   1  HeroSection         one-screen hero + prompt bar + trust strip
 *   2  ServiceVectors      two ways to get work done (quick service / project)
 *   3  HowItWorksPreview   concise band → /how-it-works
 *   4  TradeVerticals      dark section, four photographed service categories
 *   5  TrustPreview        concise band → /trust-and-safety
 *   6  PricingPreview      concise band → /pricing
 *   7  ClosingCta          final amber CTA
 *
 * WHAT MOVED, AND WHY THE PAGE IS STILL THIS LONG
 *
 * The three-step flow, the four-card trust bento and the (previously non-existent)
 * pricing content now live on their own routes, which carry far more detail than a
 * landing section could: seven-stage journeys on /how-it-works, verification types
 * and reporting paths on /trust-and-safety, and the fee/tax/FX states on /pricing.
 * What replaced them here are three compact preview bands — one claim, the three
 * things behind it, and a link to the detail.
 *
 * Section ids `verticals` and `get-started` remain anchor targets for the header
 * and footer. `how-it-works` and `trust` now point at their own routes instead of
 * at sections here; the previews keep those ids so old inbound links do not land in
 * the wrong place.
 *
 * Still a SERVER component. The only interactive piece is OutcomePromptBar, which
 * is a client component of its own — the same split the page used before, so nothing
 * here pulls the route onto the client.
 *
 * HEADER AND FOOTER: not rendered here. They come from app/layout.tsx via
 * MainNav/AuthNav/Footer, which is also why this page does not carry the design's
 * own `<header>`/`<footer>` markup. The hero compensates by starting directly under
 * the sticky header with no extra top offset.
 *
 * SUPERSEDED, NOT DELETED: the previous composition used SearchWizard and
 * InteractivePhotoCards, and the one before that used HomeSections. All three still
 * exist in components/ and are now unreferenced, so this direction can be reverted
 * without archaeology.
 */
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <ServiceVectors />
      <HowItWorksPreview />
      <TradeVerticals />
      <TrustPreview />
      <PricingPreview />
      <ClosingCta />
    </>
  );
}
