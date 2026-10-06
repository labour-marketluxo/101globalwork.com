/**
 * tokens.ts — the class strings every discovery surface shares.
 *
 * WHY A MODULE OF STRINGS. The market search page and the three taxonomy routes
 * are the same visual family, drawn from the landing page's vocabulary
 * (components/marketing/PageSections.tsx, components/navigation/AuthNav.tsx).
 * Four copies of the amber CTA is exactly how a design system drifts, and the
 * drift is invisible until the two buttons sit on the same screen — which they
 * now do (the search page's empty state and a service page's "Start request").
 * These are strings rather than components because several of them are applied
 * to `<Link>`, `<button>` and `<summary>` alike, and because strings cross no
 * client boundary.
 *
 * THREE THINGS THE CONTROL TOKENS BELOW ARE FIGHTING, all pre-existing and all
 * in the components layer of app/globals.css, so the utilities here win:
 *
 * 1. `.stack-form input` sets `font: inherit` under a bold `<label>`, so the
 *    controls inherited 700 weight and rendered bold. `font-normal` on the
 *    control rescinds that.
 * 2. `.stack-form input:focus` paints a teal `box-shadow`. `focus:ring-2` is
 *    also a box-shadow, so it REPLACES it rather than stacking with it.
 * 3. `:focus-visible` in the base layer draws a 3px teal outline. `outline-none`
 *    leaves the amber ring as the single focus indicator.
 *
 * AND ONE THING ABOUT ANCHORS: preflight is deliberately not imported in this
 * project, so there is no global `a { text-decoration: none }`. Every token here
 * that lands on an anchor carries `no-underline` and its own colour. The
 * unlayered app/entry-points.css is why `.button-link` / `.secondary-link` are
 * NOT used: being unlayered, they outrank every utility and cannot be restyled.
 */

/** Text/select control. Amber focus is the brand's interactive signal. */
export const FIELD =
  'w-full rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-900 transition-all outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';

/** Mono uppercase field legend — the metadata voice used across the landing sections. */
export const LABEL =
  'mb-1.5 block font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase';

/** Navbar CTA geometry, verbatim from AuthNav — the one filled amber control. */
export const CTA_AMBER =
  'inline-flex shrink-0 items-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-2.5 font-sans text-sm font-bold text-white no-underline shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95';

/**
 * Deep teal filled button (PageSections' `primary` variant). Used where amber
 * would compete with the page's single amber CTA: a filter panel's submit, or a
 * service page's secondary "view providers" action.
 */
export const CTA_PRIMARY =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white no-underline uppercase shadow-sm transition-colors hover:bg-primary-dark';

/**
 * Trailing-arrow text link. `gap` is owned by each variant rather than by a
 * base class, which is the only arrangement where `hover:gap-*` still wins the
 * cascade — a base `gap-2` would have already declared it at equal specificity.
 * `linkArrowSize` is the matching icon size; pass it to the ArrowRight.
 */
export const LINK_ARROW =
  'inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-primary no-underline transition-all hover:gap-2.5 hover:text-primary-dark';

/** The same link inverted for the deep-teal bands. Amber on dark is amber-300. */
export const LINK_ARROW_DARK =
  'inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-amber-300 no-underline transition-all hover:gap-2.5 hover:text-amber-200';

/** Card surface. `CARD_INTERACTIVE` adds the hover the brief asks for. */
export const CARD = 'rounded-xl border border-solid border-slate-200/80 bg-white shadow-sm';
export const CARD_INTERACTIVE = `${CARD} transition-shadow hover:shadow-md`;

/** Amber status badge on a light surface. Amber TEXT on white must be amber-800. */
export const BADGE_AMBER =
  'inline-flex items-center gap-1.5 rounded-full bg-secondary-light px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wider text-amber-800 uppercase';

/** Neutral status badge on a light surface. */
export const BADGE_SLATE =
  'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase';

/** Trailing-arrow link, but sized for a full card footer rather than a caption. */
export const LINK_ARROW_LG =
  'inline-flex items-center gap-2 font-sans text-xs font-semibold text-primary no-underline transition-all hover:gap-3 hover:text-primary-dark';

/** Pill on a deep-teal band (market badge, applied-filter chip, eyebrow). */
export const PILL_DARK =
  'inline-flex items-center gap-2 rounded-full border border-solid border-white/15 bg-white/10 px-2.5 py-1 font-sans text-xs font-bold tracking-wider text-amber-300 uppercase';

/** The blurred amber glow the landing hero and the CTA bands share. */
export const HERO_GLOW =
  'pointer-events-none absolute -top-32 -right-16 h-72 w-lg rounded-full bg-secondary/10 blur-[130px]';

/** The one band shape: full-bleed deep teal, continued from the sticky navbar. */
export const HERO_BAND = 'relative w-full overflow-hidden bg-primary';

/**
 * THE PUBLIC MEASURE — the same 1320px band every landing section sits in.
 *
 * PageSections' `Section`, ServiceVectors and TradeVerticals all wrap their
 * content in `max-w-[1320px] px-4 sm:px-6 lg:px-8`, so that is the width a
 * visitor has just been looking at when they land on a public page. Anything
 * narrower reads as a different site: the region hubs were on `max-w-5xl`
 * (1024px) and the market hub and search page on `max-w-6xl` (1152px), i.e.
 * 296px and 168px short of the landing.
 *
 * `PUBLIC_BAND` is the bare measure, for a container that supplies its own
 * gutters — a full-bleed hero band already carries `px-4 sm:px-6 lg:px-8`, so
 * its inner div must not repeat them or the padding doubles.
 * `PUBLIC_SHELL` is that measure with the page's gutters and rhythm, for a
 * page body that is not inside a band.
 */
export const PUBLIC_BAND = 'mx-auto w-full max-w-[1320px]';
export const PUBLIC_SHELL = 'mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10';

/** The taxonomy hero's inner container: the public band, on the band's own padding. */
export const HERO_INNER = `relative z-10 ${PUBLIC_BAND} px-4 py-8 sm:px-6 sm:py-10 lg:px-8`;

/**
 * Signed-in workspace container — deliberately NOT the public 1320 band.
 *
 * The dashboard pages are laid out for tables, sidebars and forms; the public
 * pages are laid out for browsing, and they follow the landing page's width
 * (`PUBLIC_SHELL`) instead. 7xl = 1280px, 40px tighter than the landing.
 */
export const PAGE_SHELL = 'mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10';
