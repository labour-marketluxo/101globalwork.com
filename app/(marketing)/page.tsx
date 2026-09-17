import ClosingCta from '@/components/landing/ClosingCta';
import HeroSection from '@/components/landing/HeroSection';
import ServiceVectors from '@/components/landing/ServiceVectors';
import TradeVerticals from '@/components/landing/TradeVerticals';
import TrustSection from '@/components/landing/TrustSection';

/**
 * Landing page — the Stitch design, ported section for section.
 *
 *   1  HeroSection      full-bleed teal hero + prompt bar + trust strip
 *   2  ServiceVectors   two ways to get work done + the 3-step flow
 *   3  TradeVerticals   dark section, four photographed service categories
 *   4  TrustSection     bento grid on quote/approval/payment mechanics
 *   5  ClosingCta       final amber CTA
 *
 * Still a SERVER component. The only interactive piece is OutcomePromptBar,
 * which is a client component of its own — the same split the page used before,
 * so nothing here pulls the route onto the client.
 *
 * HEADER AND FOOTER: not rendered here. They come from app/layout.tsx via
 * MainNav/AuthNav/Footer, which is also why this page does not carry the
 * design's own `<header>`/`<footer>` markup. The hero compensates by starting
 * directly under the sticky header with no extra top offset.
 *
 * The sections' ids (`how-it-works`, `verticals`, `trust`, `get-started`) are
 * the anchor targets used by the header nav and the footer.
 *
 * SUPERSEDED, NOT DELETED: the previous composition used SearchWizard and
 * InteractivePhotoCards, and the one before that used HomeSections. All three
 * still exist in components/ and are now unreferenced, so this direction can be
 * reverted without archaeology.
 */
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <ServiceVectors />
      <TradeVerticals />
      <TrustSection />
      <ClosingCta />
    </>
  );
}
