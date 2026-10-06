import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  Info,
  MapPin,
  SearchX,
  SlidersHorizontal,
  TriangleAlert,
} from '@/components/ui/icons';
import type { MarketLocation, MarketProvider, MarketService } from '@/features/discovery/data/market-catalog';
import { BADGE_AMBER, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';

/**
 * MarketSections — the pieces the two market routes are built from.
 *
 * `/{market}/services` and `/{market}/search` are the market-scoped siblings of the
 * location hubs in HubSections.tsx, and they were originally dressed like them
 * (tokens, `max-w-5xl`, `.pill`, `.notice`, `.need-form`).
 *
 * THEY NOW WEAR THE LANDING PAGE'S CLOTHES INSTEAD (restyled 2026-09-20): the
 * search page is where a visitor arrives from the hero prompt bar, so it has to
 * continue that page rather than switch dialects halfway through a session. The
 * vocabulary comes from components/marketing/PageSections.tsx and
 * components/navigation/AuthNav.tsx — `rounded-xl`/`-2xl` cards on slate-200
 * hairlines with `shadow-sm`, mono for metadata, amber strictly for action and
 * status. The `.pill`/`.notice`/`.button-link` classes these components used to
 * carry are all still defined; they are simply no longer used here, because
 * `.button-link` and `.secondary-link` live in the UNLAYERED entry-points.css
 * and would have outranked every utility the brand styling needs.
 *
 * NO CLIENT COMPONENTS ANYWHERE, deliberately. The filter panel is the only thing
 * that looks interactive, and it does not need JavaScript: a `<details>` element is
 * a collapse control the browser already ships, and filtering is a plain
 * `GET` form, so the result is a shareable URL, the back button works, and the
 * whole page renders on the server. Since this project imports no preflight and has
 * no global `a` reset, every anchor states `no-underline` and its own colour.
 *
 * THE DUPLICATED FILTER FORM: the mobile drawer and the desktop sidebar are two
 * instances of the same form rather than one element repositioned by CSS. Forcing
 * `<details>` content open at one breakpoint is not something CSS can do reliably
 * (the hiding happens above the slotted child), and a duplicate is cheaper than a
 * checkbox-hack that misbehaves. Both instances label their controls implicitly —
 * the input sits inside its `<label>` — so there are no duplicate `id` attributes,
 * and the hidden one is `display: none` and therefore out of the accessibility tree.
 */

/**
 * The shared control/metric class strings now live in ./tokens.ts, because the
 * taxonomy routes in TaxonomySections.tsx render the same buttons, cards and
 * badges — see that file for why they are strings and what they are overriding.
 */

export type FilterState = {
  query: string;
  category: string;
  area: string;
  acceptingOnly: boolean;
  sort: string;
};

export function activeFilterCount(state: FilterState): number {
  return [state.query, state.category, state.area].filter(Boolean).length + (state.acceptingOnly ? 1 : 0);
}

/** Label for a filter option, so region/city/locality are never confused. */
function locationLabel(location: MarketLocation): string {
  const type = location.type === 'locality' ? 'area' : location.type;
  return `${location.name} (${type})`;
}

/**
 * NOTE — `MarketSearchBar` and `ServiceCategoryGrid` were removed from this file
 * when the service directory was rebuilt on the taxonomy (2026-09-20). Both existed
 * only for /{market}/services, and both were superseded: the search box by
 * TaxonomySearchForm (same market search destination, plus the optional area
 * filter) and the category grid by DirectoryBody's category and service cards
 * (which read the real taxonomy instead of restating the service catalog). They
 * were deleted rather than left in place because an orphaned export that duplicates
 * a live component is how two versions of the same card start to drift.
 */

/** Quick links into the search, one per location in the market's catalog. */
export function AreaQuickLinks({
  marketSlug,
  locations,
}: {
  marketSlug: string;
  locations: MarketLocation[];
}) {
  if (!locations.length) return null;

  return (
    <section className="mt-14">
      <h2 className="text-2xl font-bold tracking-tight text-ink">Areas we cover</h2>
      <p className="mt-1 max-w-3xl text-ink-soft">
        Every area in this market&rsquo;s catalog. Choosing a city includes the areas inside it.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {locations
          .filter((location) => location.type !== 'country')
          .map((location) => (
            <Link
              key={location.locationId}
              href={`/${marketSlug}/search?area=${encodeURIComponent(location.code)}`}
              className="pill no-underline text-accent-strong hover:border-accent hover:bg-accent-soft"
            >
              {locationLabel(location)}
            </Link>
          ))}
      </div>
    </section>
  );
}

/**
 * A styled `<select>`.
 *
 * `appearance-none` strips the OS widget so the radius, border and focus ring
 * are ours rather than the platform's — which means the arrow has to be drawn
 * back in, and that is what the absolutely-positioned ChevronDown is for. It is
 * `pointer-events-none` so the click still lands on the select underneath, and
 * the select carries `pr-9` so its text can never run under the arrow.
 *
 * Still a native `<select>`: no listbox to reimplement, keyboard and screen
 * reader behaviour unchanged, and it works with the GET form and no JavaScript.
 */
function SelectField({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <span className="relative block">
        <select className={`${FIELD} appearance-none pr-9`} name={name} defaultValue={value}>
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
      </span>
    </label>
  );
}

/**
 * The filter form. Rendered twice — see the file header for why.
 *
 * Only dimensions backed by a real column appear here. There is no price filter and
 * no rating filter because no price or rating exists to filter on; the note under
 * the results says so rather than showing dead controls.
 */
function FilterForm({
  marketSlug,
  marketName,
  services,
  locations,
  state,
}: {
  marketSlug: string;
  marketName: string;
  services: MarketService[];
  locations: MarketLocation[];
  state: FilterState;
}) {
  return (
    <form className="stack-form gap-4" action={`/${marketSlug}/search`} method="get">
      <label className="block">
        <span className={LABEL}>Keyword</span>
        <input
          className={FIELD}
          type="search"
          name="q"
          defaultValue={state.query}
          autoComplete="off"
          placeholder="Headline or description"
        />
      </label>

      <SelectField label="Service" name="category" value={state.category}>
        <option value="">All services</option>
        {services.map((service) => (
          <option key={service.canonicalKey} value={service.canonicalKey}>
            {service.displayName}
          </option>
        ))}
      </SelectField>

      <SelectField label="Area" name="area" value={state.area}>
        <option value="">Anywhere in {marketName}</option>
        {locations
          .filter((location) => location.type !== 'country')
          .map((location) => (
            <option key={location.locationId} value={location.code}>
              {locationLabel(location)}
            </option>
          ))}
      </SelectField>

      {/* The checkbox is inside `.stack-form`, whose input rule forces
          `min-height:50px` — harmless on a text field, a 50px-tall checkbox
          here. `min-h-0 p-0` are utilities, so they take it back. */}
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-solid border-slate-200 bg-slate-50 px-3 py-2.5 transition-colors hover:border-amber-200 hover:bg-amber-50/50">
        <input
          className="h-4 w-4 min-h-0 shrink-0 p-0 accent-secondary"
          type="checkbox"
          name="availability"
          value="open"
          defaultChecked={state.acceptingOnly}
        />
        <span className="text-sm font-medium text-slate-700">
          Only providers accepting new work
        </span>
      </label>

      <SelectField label="Sort by" name="sort" value={state.sort}>
        <option value="readiness">Platform readiness</option>
        <option value="experience">Years of experience</option>
      </SelectField>

      {/* Deep teal, the brand's primary button (PageSections' `primary` variant),
          rather than the amber CTA: amber is the CTA colour, and the page already
          spends it on "Post an open request". Filled teal keeps the sidebar
          actionable without a second focal point. */}
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 justify-self-stretch rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark"
      >
        Apply filters
      </button>

      {activeFilterCount(state) > 0 ? (
        <Link
          href={`/${marketSlug}/search`}
          className="justify-self-start rounded-lg px-2 py-1 font-sans text-xs font-semibold text-slate-500 no-underline transition-colors hover:bg-amber-50 hover:text-amber-700"
        >
          Clear filters
        </Link>
      ) : null}
    </form>
  );
}

export function MarketFilterPanel({
  marketSlug,
  marketName,
  services,
  locations,
  state,
}: {
  marketSlug: string;
  marketName: string;
  services: MarketService[];
  locations: MarketLocation[];
  state: FilterState;
}) {
  const applied = activeFilterCount(state);

  return (
    <>
      {/* Mobile/tablet: the same form behind a native <details>, so nothing here
          needs JavaScript. `list-none` + the marker pseudo-element strip the
          default disclosure triangle on both engines; the chevron replaces it
          and flips while the panel is open. */}
      <details className="group lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-solid border-slate-200/80 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-slate-300 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2.5 text-sm font-bold text-slate-900">
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-primary" />
            Filters
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {applied > 0 ? <span className={BADGE_AMBER}>{applied} applied</span> : null}
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="mt-3 rounded-xl border border-solid border-slate-200/80 bg-white p-5 shadow-sm">
          <FilterForm
            marketSlug={marketSlug}
            marketName={marketName}
            services={services}
            locations={locations}
            state={state}
          />
        </div>
      </details>

      <div className="hidden lg:block">
        <div className="rounded-xl border border-solid border-slate-200/80 bg-white p-5 shadow-sm">
          {/* THE HEADER IS THE ROW ITSELF — no wrapper box around the label, so
              the hairline is the only rule between it and the form and the
              heading sits flush with the card's own padding. `mt-0` cancels the
              UA h2 margin (this project ships no preflight), `mb-4` puts the
              spacing back where it is wanted, and `ml-auto` keeps the applied
              count on the right now that `justify-between` is gone. */}
          <h2 className="mt-0 mb-4 flex items-center gap-2 border-b border-slate-100 pb-4 text-base font-bold text-slate-900">
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-primary" />
            Filters
            {/* Amber on white has to be amber-800: --color-secondary (#d97706)
                measures ~3.1:1 here and fails AA. */}
            {applied > 0 ? <span className={`${BADGE_AMBER} ml-auto`}>{applied} applied</span> : null}
          </h2>
          <FilterForm
            marketSlug={marketSlug}
            marketName={marketName}
            services={services}
            locations={locations}
            state={state}
          />
        </div>
      </div>
    </>
  );
}

/**
 * One result.
 *
 * There is no "from ₦X" and no star rating on this card, because neither exists in
 * the database. What is shown is what a public visitor can actually read: the
 * provider's own headline and description, the service and area they are eligible
 * for, their stated experience, whether they are taking work, and whether their
 * identity check has passed. Readiness is labelled as a platform signal so it is not
 * mistaken for a customer rating.
 *
 * Cards are NOT links: `/{market}/providers/{slug}` does not exist, and the real
 * profile route lives at `/providers/{slug}` off the global root. Linking a market
 * card into it would break the market context, so the card is content, and the
 * market's own search remains the path.
 */
export function ProviderResultCard({
  provider,
  sample = false,
  profileHref,
}: {
  provider: MarketProvider;
  /** Marks a card rendered from the dev-only preview list. Never true in production. */
  sample?: boolean;
  /**
   * Where this provider's public profile lives, when the caller can offer one.
   *
   * Omitted on the market search page on purpose: `/{market}/providers/{slug}` does
   * not exist, and the real profile route is `/providers/{slug}` off the global root,
   * so linking from a market-scoped card would either 404 or drop the market context.
   * The local discovery page passes it, because there the profile is the next step a
   * visitor wants and the global route is the correct destination.
   */
  profileHref?: string;
}) {
  return (
    <article className="rounded-xl border border-solid border-slate-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight text-slate-900">
            {provider.headline ?? provider.slug.replace(/-/g, ' ')}
          </h3>
          {/* Services and areas are no longer one `·`-joined string: they are
              different claims — what this provider is eligible for, and where —
              so they get different chips. Teal = the service catalog the page
              filters on; a pin = a place. */}
          {provider.services.length || provider.areas.length ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {provider.services.map((service) => (
                <span
                  key={service}
                  className="rounded-full border border-solid border-primary-subtle bg-primary-surface px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {service}
                </span>
              ))}
              {provider.areas.map((area) => (
                <span
                  key={area}
                  className="inline-flex items-center gap-1 rounded-full border border-solid border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600"
                >
                  <MapPin aria-hidden="true" className="h-3 w-3 text-slate-400" />
                  {area}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {sample ? <span className={BADGE_AMBER}>Sample</span> : null}
          {provider.verified ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wide text-primary uppercase">
              <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
              Identity checked
            </span>
          ) : null}
        </div>
      </div>

      {provider.description ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{provider.description}</p>
      ) : null}

      {/* Facts strip. Mono on the labels only — the values are the readable
          part, and `tabular-nums` keeps the readiness figure from shifting
          width between rows. */}
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-solid border-slate-100 bg-slate-50/80 px-3.5 py-2.5">
        {provider.yearsExperience !== null ? (
          <div className="flex items-baseline gap-1.5">
            <dt className="font-sans text-[11px] tracking-wide text-slate-500 uppercase">
              Experience
            </dt>
            <dd className="text-sm font-bold text-slate-900">
              {provider.yearsExperience} {provider.yearsExperience === 1 ? 'year' : 'years'}
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline gap-1.5">
          <dt className="font-sans text-[11px] tracking-wide text-slate-500 uppercase">
            Availability
          </dt>
          <dd className="text-sm font-bold text-slate-900">
            {provider.acceptsNewWork ? 'Accepting new work' : 'Not taking new work'}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="font-sans text-[11px] tracking-wide text-slate-500 uppercase">
            Platform readiness
          </dt>
          <dd className="text-sm font-bold text-slate-900 tabular-nums">
            {provider.readinessScore.toFixed(0)}/100
          </dd>
        </div>
      </dl>

      {profileHref ? (
        <p className="mt-4">
          <Link href={profileHref} className={LINK_ARROW}>
            View profile
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </p>
      ) : null}

      {provider.slug ? (
        <p className="mt-3 font-sans text-[11px] text-slate-400">
          Provider reference: <code>{provider.slug}</code>
        </p>
      ) : null}
    </article>
  );
}

/**
 * The empty state, which is the state this page renders today: zero providers are
 * published, so nothing can match. It is written as a real destination rather than a
 * dead end — describe the work and it becomes a request — and it says plainly that
 * the absence is inventory, not a broken search.
 */
export function MarketEmptyState({
  marketName,
  hasFilters,
  unavailable,
}: {
  marketName: string;
  hasFilters: boolean;
  unavailable: boolean;
}) {
  return (
    <div className="relative flex flex-col items-start gap-6 overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm md:p-10">
      {/* The accent tile is the illustration: the band's own deep teal, the
          amber glyph, an emerald-edged shadowed box — one spot of colour on an
          otherwise quiet card. No spot-art asset exists for this state, and
          drawing it in CSS beats shipping a stock illustration that claims
          nothing. Amber glyph either way, including when the search failed:
          it is the "look again" colour here, the warning sits in the copy. */}
      <span
        aria-hidden="true"
        className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-900/40 bg-[#0D282E] shadow-md"
      >
        {unavailable ? (
          <TriangleAlert className="h-6 w-6 text-[#F59E0B]" />
        ) : (
          <SearchX className="h-6 w-6 text-[#F59E0B]" />
        )}
      </span>

      {/* Heading + body are one flex child so the card's `gap-6` spaces the
          three blocks (icon / copy / actions) rather than every line. */}
      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-xl font-bold tracking-tight text-slate-900">
          {unavailable
            ? 'We cannot search this market right now'
            : hasFilters
              ? `No providers in ${marketName} match those filters`
              : `No providers published in ${marketName} yet`}
        </h3>
        {/* `m-0` because there is no preflight here: the UA `p` margins would
            otherwise add 14px on top of the flex gaps and push the copy apart. */}
        <p className="m-0 max-w-xl text-sm leading-relaxed text-slate-600">
          {unavailable
            ? 'The provider catalog did not respond. This is a problem on our side, not a statement about what is available — try again in a moment.'
            : 'Providers appear here once they pass supply verification and quality thresholds. Post an open request to notify providers as soon as they onboard.'}
        </p>
      </div>

      {/* Amber is the CTA colour, so the primary action here is the same amber
          as the navbar's — one destination, one look — and the secondary is an
          underlined mono link beside it. */}
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <Link
          href="/requests/new"
          className="no-underline flex items-center gap-2 rounded-xl bg-[#F59E0B] px-6 py-3.5 font-sans text-xs font-bold text-slate-950 shadow-sm transition-all hover:bg-[#D97706] active:scale-95"
        >
          [ Post an open request → ]
        </Link>
        <Link
          href="/how-it-works"
          className="font-sans text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-900"
        >
          See how matching works →
        </Link>
      </div>
    </div>
  );
}

/** Surface + accent per callout tone. `border-l-4` is the left accent rule. */
const NOTICE_TONE = {
  amber: 'border-amber-200/80 border-l-amber-500 bg-amber-50/70',
  slate: 'border-slate-200 border-l-primary bg-slate-50',
} as const;

const NOTICE_ICON_TONE = {
  amber: 'border-amber-200 bg-secondary-light text-amber-700',
  slate: 'border-primary-subtle bg-primary-surface text-primary',
} as const;

/**
 * The callout box both notices and both page-level banners render through.
 *
 * Two jobs, both learned the hard way here: the disclosure text was plain prose
 * in a hairline box, which read like body copy nobody had to read; and links
 * inside it carried only `underline` — with no preflight in this project that
 * leaves them browser-default blue. The `[&_a]` rules fix the second at the
 * source rather than at every call site, and the left accent bar does the
 * first: an amber edge on an amber wash is a status, not a paragraph.
 */
export function NoticePanel({
  tone = 'amber',
  title,
  icon,
  className = '',
  children,
}: {
  tone?: keyof typeof NOTICE_TONE;
  /** Optional bold lead-in, rendered as part of the prose rather than as a heading. */
  title?: ReactNode;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-3.5 rounded-xl border border-solid border-l-4 p-5 ${NOTICE_TONE[tone]} ${className}`}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-solid ${NOTICE_ICON_TONE[tone]}`}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 text-sm leading-relaxed text-slate-700 [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:transition-colors [&_a]:hover:text-primary-dark [&_code]:rounded-sm [&_code]:border [&_code]:border-solid [&_code]:border-amber-200 [&_code]:bg-white/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-sans [&_code]:text-[11px] [&_code]:text-amber-800 [&_strong]:font-bold [&_strong]:text-slate-900">
        {title ? <strong>{title}</strong> : null} {children}
      </div>
    </div>
  );
}

/** States what is deliberately not on the page. Silence would be the dishonest option. */
export function MarketDataNotice({ className = '' }: { className?: string }) {
  return (
    <NoticePanel
      tone="amber"
      title="What is not published here:"
      icon={<Info className="h-5 w-5" />}
      className={className}
    >
      customer ratings and prices. The platform has no reviews table, and provider prices are only
      ever stated on an itemized quote — so there is no rating or &ldquo;from&rdquo; figure to show
      on a card. Filters exist only for the data that does:{' '}
      <Link href="/trust-and-safety">verification</Link> and{' '}
      <Link href="/pricing">fees</Link> are explained on their own pages.
    </NoticePanel>
  );
}
