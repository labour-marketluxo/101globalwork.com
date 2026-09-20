import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  ChevronDown,
  LayoutGrid,
  MapPin,
  Scissors,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import Breadcrumbs, { type BreadcrumbItem } from '@/components/ui/Breadcrumbs';
import { NoticePanel } from '@/components/discovery/MarketSections';
import { Faq } from '@/components/marketing/PageSections';
import {
  BADGE_AMBER,
  CARD,
  CARD_INTERACTIVE,
  CTA_AMBER,
  HERO_BAND,
  HERO_GLOW,
  HERO_INNER,
  LINK_ARROW,
  LINK_ARROW_LG,
  PILL_DARK,
} from '@/components/discovery/tokens';
import { PLATFORM_FAQS } from '@/features/marketing/content';
import {
  type Market,
  type MarketLocation,
} from '@/features/discovery/data/market-catalog';
import { previewTaxonomy, type PreviewMode } from '@/features/discovery/data/preview-taxonomy';
import {
  categoryHref,
  getServiceTaxonomy,
  serviceHref,
  type ServiceTaxonomy,
  type TaxonomyCategory,
  type TaxonomyService,
} from '@/features/discovery/data/service-taxonomy';

/**
 * TaxonomySections — the three canonical service-taxonomy routes' shared pieces.
 *
 * THE ROUTES THESE SERVE
 *
 *   /{market}/services              the directory: every category, every service
 *   /{market}/services/{slug}       a curated category, OR a service
 *
 * `{slug}` is a single dynamic segment on purpose. Next refuses two sibling dynamic
 * segments with different names, so `[category]` and `[service-slug]` cannot coexist
 * — the URL shapes in the brief collapse into one segment and the resolver in
 * service-taxonomy.ts decides which of the two a segment means. The consequence to
 * keep in mind while reading: category and service pages render through the SAME
 * route file, and the pieces below are composed by it.
 *
 * WHY THE ASYNC COMPONENTS LIVE HERE (DirectoryBody / CategoryBody / ServiceBody)
 *
 * Each route renders its band first, then wraps one of these in an in-page
 * `<Suspense>`. That placement is deliberate and is the only safe one in this
 * codebase: a route-level `loading.tsx` creates a Suspense boundary ABOVE the
 * page's `redirect()` / `notFound()` guards, which flushes a 200 shell and turns
 * every 404 and redirect below it into a soft-404 (verified on this repo — see the
 * note on the market services page). An in-page boundary placed AFTER the guard
 * streams for the same reader benefit and cannot swallow the guard.
 *
 * HOUSE RULES THESE COMPONENTS OBEY
 *
 * 1. Preflight is not imported, so every anchor carries `no-underline` and its own
 *    colour — the tokens in ./tokens.ts do that, which is why the class strings
 *    come from there instead of being retyped.
 * 2. Amber is action and status, never decoration. On the deep teal it is
 *    amber-300; on white it is amber-800 (#d97706 is ~3.1:1 on white and fails AA).
 * 3. Nothing is claimed that the database cannot show. Where a field has not been
 *    curated yet (a service summary, a category layer), the component says so
 *    rather than generating plausible text.
 */

/**
 * Presentation-only glyph for a category. An unknown key gets a neutral tile, never
 * a wrong one. Written as an explicit switch rather than a lookup table of
 * components: a component resolved through a function call during render is a new
 * component type on every pass, which both React and this repo's lint rule reject.
 */
function CategoryGlyph({ canonicalKey, className }: { canonicalKey: string; className?: string }) {
  if (canonicalKey === 'home_property_maintenance') return <Wrench className={className} />;
  if (canonicalKey === 'apparel_alterations') return <Scissors className={className} />;
  return <LayoutGrid className={className} />;
}

/* ------------------------------------------------------------------- hero */

/**
 * The band every taxonomy route opens with.
 *
 * Same construction as the landing hero and the search page: full-bleed deep teal
 * continuing the sticky navbar, so the page reads as part of the same site rather
 * than as a jump to a subdomain-shaped corner of it. `children` is where the
 * directory puts its search form.
 */
export function TaxonomyHero({
  breadcrumbs,
  eyebrow,
  title,
  lede,
  chips,
  actions,
  children,
}: {
  breadcrumbs: BreadcrumbItem[];
  /** ReactNode, not a string: the pill's icon differs per route (a market, a category, a service). */
  eyebrow: ReactNode;
  title: string;
  lede: string;
  chips?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={HERO_BAND}>
      <div className={HERO_GLOW} />

      <div className={HERO_INNER}>
        <Breadcrumbs tone="dark" className="mb-6" items={breadcrumbs} />

        <span className={PILL_DARK}>{eyebrow}</span>

        <h1 className="mt-4 text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
          {title}
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">{lede}</p>

        {chips ? <div className="mt-5 flex flex-wrap items-center gap-2">{chips}</div> : null}

        {actions ? (
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">{actions}</div>
        ) : null}

        {children}
      </div>
    </section>
  );
}

/** Metadata chip for the dark band. Amber = a filter or status the reader applied. */
export function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-solid border-amber-400/30 bg-amber-400/10 px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-amber-300 uppercase">
      {children}
    </span>
  );
}

/**
 * The directory's search: a description of the work, and an optional area.
 *
 * The area filter is the brief's "optional location filter" and it is a real
 * catalog filter, not a free-text box — `area` is a `canonical_code` that
 * /{market}/search understands, which is what makes the hero form and the results
 * page agree about what was asked for.
 *
 * Labels are `sr-only` because the placeholders carry the meaning visually; the
 * accessible name is still a real `<label>`, not a placeholder pretending to be
 * one.
 */
export function TaxonomySearchForm({
  marketSlug,
  marketName,
  locations,
  defaultQuery = '',
}: {
  marketSlug: string;
  marketName: string;
  locations: MarketLocation[];
  defaultQuery?: string;
}) {
  const areas = locations.filter((location) => location.type !== 'country');

  return (
    <form
      className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
      action={`/${marketSlug}/search`}
      method="get"
    >
      <label className="block">
        <span className="sr-only">Describe the work you need done</span>
        <input
          className="w-full rounded-lg border border-solid border-white/20 bg-white/10 px-4 py-3 text-sm text-white transition-all outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
          type="search"
          name="q"
          autoComplete="off"
          defaultValue={defaultQuery}
          placeholder="Describe what needs doing, in your own words"
        />
      </label>

      <label className="block">
        <span className="sr-only">Area</span>
        <span className="relative block">
          <select
            className="w-full appearance-none rounded-lg border border-solid border-white/20 bg-white/10 px-4 py-3 pr-9 text-sm text-white transition-all outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
            name="area"
            defaultValue=""
          >
            <option value="" className="text-slate-900">
              Anywhere in {marketName}
            </option>
            {areas.map((area) => (
              <option key={area.locationId} value={area.code} className="text-slate-900">
                {area.name}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-slate-300"
          />
        </span>
      </label>

      <button type="submit" className={`${CTA_AMBER} w-full justify-center sm:w-auto`}>
        Search
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </form>
  );
}

/* -------------------------------------------------------------- small parts */

/**
 * The availability signal.
 *
 * Two states, both real: amber when the catalog has nothing published behind the
 * row (the state of the entire marketplace today), teal when it does. Neither is
 * a rating, a price or a lead time, because those do not exist — see
 * market-catalog.ts.
 */
export function AvailabilityChip({ count }: { count: number }) {
  if (count > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-surface px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
        {count} provider{count === 1 ? '' : 's'}
      </span>
    );
  }

  return <span className={BADGE_AMBER}>No providers yet</span>;
}

/**
 * The phrases people actually type.
 *
 * These are `entity_synonyms` rows — the platform's own record of the words a
 * visitor uses when they do not know the trade term — so a chip here is a real
 * search, not a suggestion: it submits the phrase to the market search. That is
 * the brief's "browse without requiring professional terminology" made literal.
 */
export function AliasChips({
  marketSlug,
  aliases,
  cap = 6,
  label,
}: {
  marketSlug: string;
  aliases: string[];
  cap?: number;
  label?: string;
}) {
  if (!aliases.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label ? (
        <span className="mr-1 font-mono text-[11px] tracking-wider text-slate-400 uppercase">
          {label}
        </span>
      ) : null}
      {aliases.slice(0, cap).map((alias) => (
        <Link
          key={alias}
          href={`/${marketSlug}/search?q=${encodeURIComponent(alias)}`}
          className="rounded-full border border-solid border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 no-underline transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
        >
          {alias}
        </Link>
      ))}
    </div>
  );
}

/** Platform guidance bullets: the how-to-get-a-useful-quote lines, not claims. */
export function GuidanceList({ items }: { items: string[] }) {
  if (!items.length) return null;

  return (
    <ul className="grid gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-relaxed text-slate-600">
          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------- cards */

export function CategoryCard({
  marketSlug,
  category,
}: {
  marketSlug: string;
  category: TaxonomyCategory;
}) {
  return (
    <article className={`${CARD_INTERACTIVE} flex flex-col p-6`}>
      <span
        aria-hidden="true"
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-solid border-primary-subtle bg-primary-surface text-primary"
      >
        <CategoryGlyph canonicalKey={category.canonicalKey} className="h-5 w-5" />
      </span>

      <h3 className="mt-4 text-lg font-bold tracking-tight text-slate-900">{category.displayName}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{category.definition}</p>

      {category.services.length ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {category.services.map((service) => (
            <span
              key={service.serviceEntityId}
              className="rounded-full border border-solid border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600"
            >
              {service.displayName}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          No services are curated under this category yet.
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-solid border-slate-100 pt-4">
        <span className="font-mono text-[11px] tracking-wider text-slate-500 uppercase">
          {category.services.length} service{category.services.length === 1 ? '' : 's'}
        </span>
        <Link href={categoryHref(marketSlug, category)} className={LINK_ARROW_LG}>
          Open category
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

export function ServiceCard({
  marketSlug,
  service,
  category,
  showCategory = true,
}: {
  marketSlug: string;
  service: TaxonomyService;
  /** The category it belongs to, when the caller knows it. */
  category?: TaxonomyCategory | null;
  /**
   * False when the card already sits inside that category's page, where the label
   * would repeat the page heading and "Uncategorised" would be a lie.
   */
  showCategory?: boolean;
}) {
  return (
    <article className={`${CARD_INTERACTIVE} flex flex-col p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-base font-bold tracking-tight text-slate-900">{service.displayName}</h3>
        <AvailabilityChip count={service.providerCount} />
      </div>

      {service.summary ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{service.summary}</p>
      ) : (
        // Said out loud rather than filled in. A generated description is the one
        // thing this codebase will not put in front of a customer.
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          No description has been published for this service yet. The entry is a real
          catalog row; the copy is not written.
        </p>
      )}

      {service.aliases.length ? (
        <div className="mt-3">
          <AliasChips marketSlug={marketSlug} aliases={service.aliases} cap={4} />
        </div>
      ) : null}

      <div
        className={`mt-auto flex flex-wrap items-center gap-3 border-t border-solid border-slate-100 pt-4 ${
          showCategory ? 'justify-between' : 'justify-end'
        }`}
      >
        {showCategory ? (
          category ? (
            <span className="font-mono text-[11px] tracking-wider text-slate-500 uppercase">
              {category.displayName}
            </span>
          ) : (
            <span className="font-mono text-[11px] tracking-wider text-slate-400 uppercase">
              Uncategorised
            </span>
          )
        ) : null}
        <Link href={serviceHref(marketSlug, service)} className={LINK_ARROW}>
          Open service
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

/* ------------------------------------------------------- service-page parts */

/**
 * Trust badges.
 *
 * Every claim here is already published elsewhere on the site (the hero trust
 * strip, /trust-and-safety, /how-it-works) and is a statement about how the
 * PLATFORM works, not about a provider's quality. No "verified to a standard",
 * no insurance promise: the trust page is explicit that verification is a set of
 * checks with limits, and this block points there rather than paraphrasing it
 * loosely.
 */
export function TrustBadges() {
  const items = [
    {
      icon: <ShieldCheck aria-hidden="true" className="h-5 w-5" />,
      title: 'Identity checked before quoting',
      body: 'Licences are checked where the trade requires one, and insurance is requested where it applies.',
    },
    {
      icon: <BadgeCheck aria-hidden="true" className="h-5 w-5" />,
      title: 'Verified before a provider appears',
      body: 'A provider is published only after verification passes; unverified names are never listed.',
    },
    {
      icon: <Banknote aria-hidden="true" className="h-5 w-5" />,
      title: 'Payment held until you approve',
      body: 'Your payment is held by our payment provider and released after you approve the finished work.',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className={`${CARD} p-5`}>
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-solid border-primary-subtle bg-primary-surface text-primary"
          >
            {item.icon}
          </span>
          <h3 className="mt-3 text-sm font-bold text-slate-900">{item.title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.body}</p>
        </div>
      ))}
      <p className="text-xs text-slate-500 sm:col-span-3">
        What verification does not guarantee, and how a dispute is handled, are set out on{' '}
        <Link
          href="/trust-and-safety"
          className="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
        >
          trust and safety
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * Low-supply notice.
 *
 * Two thresholds, and the difference matters. At zero providers the page says the
 * catalog row is real and the supply is not. Above zero but below the platform's
 * own indexing threshold it says exactly that, because the page is genuinely
 * `noindex` and a visitor who found it deserves to know why it is not in the
 * results they searched. Neither message promises a provider will appear.
 */
export function LowSupplyNotice({
  marketName,
  serviceName,
  count,
  indexingThreshold,
}: {
  marketName: string;
  serviceName: string;
  count: number;
  /** The market's published `minimum_supply`, or null when no policy is configured. */
  indexingThreshold: number | null;
}) {
  return (
    <NoticePanel tone="amber" icon={<TriangleAlert className="h-5 w-5" />}>
      {count === 0
        ? `No providers are published for ${serviceName} in ${marketName} yet.`
        : `Only ${count} published provider${count === 1 ? '' : 's'} currently cover${count === 1 ? 's' : ''} ${serviceName} in ${marketName}.`}{' '}
      The catalog entry is real; the supply behind it is not there yet.{' '}
      {indexingThreshold !== null
        ? `The platform offers a service page to search engines only once at least ${indexingThreshold} verified providers can be matched in the market, so this page is deliberately kept out of search results until then.`
        : 'This market has no published indexing policy, so the page is kept out of search results either way.'}{' '}
      Posting a request still records what you need.
    </NoticePanel>
  );
}

/**
 * Locale fallback.
 *
 * Renders only when the name being displayed is not published in the market's own
 * default language — the state a curated taxonomy reaches when a row is added for
 * another market first. Today every row is `en` and every market defaults to `en`,
 * so this is silent; it exists so that the day a row is not, the reader is told
 * which language they are reading instead of being shown a transliterated guess.
 */
export function LocaleNotice({
  marketName,
  marketLanguage,
  contentLanguage,
  isFallback,
}: {
  marketName: string;
  marketLanguage: string;
  contentLanguage: string;
  isFallback: boolean;
}) {
  if (!isFallback) return null;

  return (
    <NoticePanel tone="slate" icon={<LayoutGrid className="h-5 w-5" />}>
      This entry is published in <strong>{contentLanguage.toUpperCase()}</strong>, not in{' '}
      {marketName}&rsquo;s default language ({marketLanguage.toUpperCase()}). Nothing has been
      translated for you automatically; the trade vocabulary differs enough between markets that a
      machine-translated service name would be worse than none.
    </NoticePanel>
  );
}

/** The numeric facts a service page may state, all of them measured. */
export function ServiceFacts({
  service,
  locationCount,
  currencyCode,
}: {
  service: TaxonomyService;
  locationCount: number;
  currencyCode: string;
}) {
  const facts = [
    { label: 'Published providers', value: String(service.providerCount) },
    { label: 'Areas in catalog', value: String(locationCount) },
    { label: 'Quotes priced in', value: currencyCode },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label} className={`${CARD} p-4`}>
          <dt className="font-mono text-[11px] tracking-wider text-slate-500 uppercase">
            {fact.label}
          </dt>
          <dd className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Area chips: catalog coverage, filtered into a real market search. */
export function CoveredAreas({
  marketSlug,
  locations,
  service,
}: {
  marketSlug: string;
  locations: MarketLocation[];
  service: TaxonomyService;
}) {
  const areas = locations.filter((location) => location.type !== 'country');
  if (!areas.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {areas.map((area) => (
        <Link
          key={area.locationId}
          href={`/${marketSlug}/search?category=${encodeURIComponent(service.canonicalKey)}&area=${encodeURIComponent(area.code)}`}
          className="inline-flex items-center gap-1 rounded-full border border-solid border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 no-underline transition-colors hover:border-primary-subtle hover:bg-primary-surface hover:text-primary"
        >
          <MapPin aria-hidden="true" className="h-3 w-3 text-slate-400" />
          {area.name}
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ states */

/** The brief's "no configured services" state: the taxonomy itself is empty. */
export function EmptyTaxonomy({ marketName }: { marketName: string }) {
  return (
    <div className="rounded-2xl border border-solid border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-xl border border-solid border-amber-200 bg-secondary-light text-amber-700"
      >
        <TriangleAlert className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
        No services are configured for {marketName} yet
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        The service catalog is empty for this market, so there is nothing to browse. This is a
        configuration state rather than a search that failed, and it is shown rather than hidden
        behind a guessed list of trades. Describing the work still creates a request.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href="/requests/new" className={CTA_AMBER}>
          Describe what you need
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <Link href="/how-it-works" className={LINK_ARROW}>
          See how matching works
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

/** The read failed. Our problem, and said so rather than shown as emptiness. */
export function TaxonomyUnavailable() {
  return (
    <NoticePanel tone="amber" icon={<TriangleAlert className="h-5 w-5" />}>
      The service catalog did not respond, so nothing can be listed right now. This is a problem on
      our side rather than a statement about which services exist — reload in a moment, or{' '}
      <Link href="/requests/new">describe the work</Link> and it will be recorded either way.
    </NoticePanel>
  );
}

/** Streaming placeholder. Shaped like the cards it replaces, so the swap is not a jump. */
export function TaxonomySkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading services…</span>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={`${CARD} p-5`} aria-hidden="true">
          <div className="h-4 w-1/3 animate-pulse rounded-sm bg-slate-200" />
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded-sm bg-slate-100" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded-sm bg-slate-100" />
          <div className="mt-5 h-3 w-24 animate-pulse rounded-sm bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

/** Preview banner. Dev-only: `?preview=1` is dead code in a production bundle. */
export function PreviewNotice({ clearHref }: { clearHref: string }) {
  return (
    <NoticePanel tone="amber" icon={<TriangleAlert className="h-5 w-5" />} title="Preview mode — sample taxonomy, not the live catalog.">
      The taxonomy projection tables ship in a migration that has not been applied to this database
      yet, so this flag (<code>?preview=1</code>) renders sample rows from
      features/discovery/data/preview-taxonomy.ts instead of a query. It only works in development.{' '}
      <Link href={clearHref}>Show the real (unconfigured) state</Link>.
    </NoticePanel>
  );
}

/* ------------------------------------------------------- composed, streaming */

/**
 * The directory body: categories, then every service, then the vocabulary.
 *
 * The service list is NOT the union of the categories. A service with no curated
 * category still has to be reachable — that is the state the catalog is in the
 * moment a taxonomy row is added ahead of its grouping — so the two lists are
 * rendered side by side and the uncategorised ones are labelled as such.
 */
export async function DirectoryBody({
  market,
  locations,
  marketSlug,
  preview = null,
}: {
  market: Market;
  locations: MarketLocation[];
  marketSlug: string;
  /** Null on the live path; a dev-only mode when `?preview=` supplied one. */
  preview?: PreviewMode | null;
}) {
  const taxonomy: ServiceTaxonomy = preview
    ? previewTaxonomy(market, preview)
    : await getServiceTaxonomy(market, locations);

  if (taxonomy.unavailable) return <TaxonomyUnavailable />;

  if (!taxonomy.services.length && !taxonomy.categories.length) {
    return <EmptyTaxonomy marketName={market.displayName} />;
  }

  const allAliases = [...new Set(taxonomy.services.flatMap((service) => service.aliases))];

  return (
    <div className="grid gap-12">
      {taxonomy.categoriesConfigured ? (
        <section aria-labelledby="categories-heading">
          <h2 id="categories-heading" className="text-2xl font-bold tracking-tight text-slate-900">
            Categories
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Grouped the way the work is usually described, not the way it is invoiced. A category
            holds the services that belong together, so you can start from the general and narrow
            down.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {taxonomy.categories.map((category) => (
              <CategoryCard key={category.categoryId} marketSlug={marketSlug} category={category} />
            ))}
          </div>
        </section>
      ) : (
        <NoticePanel tone="slate" title="Categories have not been curated for this market yet.">
          The services below are real catalog entries, but nothing has grouped them yet, so they are
          listed individually rather than under a heading this market does not have.
        </NoticePanel>
      )}

      <section aria-labelledby="services-heading">
        <h2 id="services-heading" className="text-2xl font-bold tracking-tight text-slate-900">
          All services in {market.displayName}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          {taxonomy.services.length} canonical service
          {taxonomy.services.length === 1 ? '' : 's'} in this market&rsquo;s catalog. Quotes here are
          priced in {market.currencyCode}, and every request is scoped the same way for every
          provider who quotes on it.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {taxonomy.services.map((service) => (
            <ServiceCard
              key={service.serviceEntityId}
              marketSlug={marketSlug}
              service={service}
              category={
                taxonomy.categories.find((category) =>
                  category.services.some((member) => member.serviceEntityId === service.serviceEntityId),
                ) ?? null
              }
            />
          ))}
        </div>
      </section>

      {allAliases.length ? (
        <section aria-labelledby="vocabulary-heading" className={`${CARD} p-6`}>
          <h2 id="vocabulary-heading" className="text-lg font-bold tracking-tight text-slate-900">
            Not sure what the job is called?
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            These are the words people actually use. Each one is a real search over the same catalog
            — pick the closest and refine from there.
          </p>
          <div className="mt-4">
            <AliasChips marketSlug={marketSlug} aliases={allAliases} cap={16} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** The category body: its services, its vocabulary, its guidance, its areas. */
export async function CategoryBody({
  market,
  locations,
  marketSlug,
  category,
  preview = null,
}: {
  market: Market;
  locations: MarketLocation[];
  marketSlug: string;
  category: TaxonomyCategory;
  preview?: PreviewMode | null;
}) {
  // In preview the category came from the fixture, so nothing is read. On the real
  // path the taxonomy is already in React's request cache from the resolver.
  const taxonomy: ServiceTaxonomy = preview
    ? previewTaxonomy(market, preview)
    : await getServiceTaxonomy(market, locations);

  const services = category.services.length
    ? category.services
    : (taxonomy.categories.find((item) => item.categoryId === category.categoryId)?.services ?? []);

  const aliases = [...new Set(services.flatMap((service) => service.aliases))];
  const providerTotal = services.reduce((total, service) => total + service.providerCount, 0);

  return (
    <div className="grid gap-12">
      {!services.length ? (
        <NoticePanel tone="amber" title="No services are curated under this category yet.">
          The grouping exists in the catalog, but no service has been placed in it. It is shown here
          rather than hidden, because a category that silently renders nothing looks like a broken
          page — this one is simply empty, and the market&rsquo;s other services remain searchable.
        </NoticePanel>
      ) : (
        <section aria-labelledby="category-services">
          <h2 id="category-services" className="text-2xl font-bold tracking-tight text-slate-900">
            Services in this category
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {services.length} canonical service{services.length === 1 ? '' : 's'},{' '}
            {providerTotal === 0
              ? 'with no published providers behind them yet.'
              : `with ${providerTotal} published provider${providerTotal === 1 ? '' : 's'} across the market.`}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {services.map((service) => (
              <ServiceCard
                key={service.serviceEntityId}
                marketSlug={marketSlug}
                service={service}
                showCategory={false}
              />
            ))}
          </div>
        </section>
      )}

      {aliases.length ? (
        <section aria-labelledby="category-vocabulary">
          <h2 id="category-vocabulary" className="text-2xl font-bold tracking-tight text-slate-900">
            What people call this
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Ordinary phrases for the work in this category. Choosing one runs it as a search.
          </p>
          <div className="mt-4">
            <AliasChips marketSlug={marketSlug} aliases={aliases} cap={16} />
          </div>
        </section>
      ) : null}

      {category.guidance.length ? (
        <section aria-labelledby="category-guidance" className={`${CARD} p-6`}>
          <h2 id="category-guidance" className="text-lg font-bold tracking-tight text-slate-900">
            Before you ask for a quote
          </h2>
          <p className="mt-1 text-sm text-slate-600">How the platform expects this to go.</p>
          <div className="mt-4">
            <GuidanceList items={category.guidance} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="category-areas">
        <h2 id="category-areas" className="text-2xl font-bold tracking-tight text-slate-900">
          Areas in this market&rsquo;s catalog
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Coverage is a property of the catalog, not a promise of supply: these are the locations a
          request can be scoped to in {market.displayName}.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {locations
            .filter((location) => location.type !== 'country')
            .map((location) => (
              <Link
                key={location.locationId}
                href={`/${marketSlug}/search?area=${encodeURIComponent(location.code)}`}
                className="inline-flex items-center gap-1 rounded-full border border-solid border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 no-underline transition-colors hover:border-primary-subtle hover:bg-primary-surface hover:text-primary"
              >
                <MapPin aria-hidden="true" className="h-3 w-3 text-slate-400" />
                {location.name}
              </Link>
            ))}
        </div>
      </section>
    </div>
  );
}

/**
 * The service body: the long-form page the brief describes.
 *
 * Order is conversion order. What the service covers, then what it will cost to
 * find out (nothing), then the trust checks, then the FAQ — and the call to action
 * sits between the trust block and the FAQ so it is reachable without reading to
 * the end.
 */
export async function ServiceBody({
  market,
  locations,
  marketSlug,
  service,
  category,
}: {
  market: Market;
  locations: MarketLocation[];
  marketSlug: string;
  service: TaxonomyService;
  category: TaxonomyCategory | null;
}) {
  const areas = locations.filter((location) => location.type !== 'country');

  // Two ways a page is under-supplied: nothing published at all, or fewer than the
  // market's own indexing threshold. With no policy configured the second test has
  // nothing to compare against, so only the first applies — a claim about a
  // threshold that does not exist would be invented.
  const showLowSupply =
    service.providerCount === 0 ||
    (service.indexingThreshold !== null && service.providerCount < service.indexingThreshold);

  return (
    <div className="grid gap-12">
      <ServiceFacts service={service} locationCount={areas.length} currencyCode={market.currencyCode} />

      {showLowSupply ? (
        <LowSupplyNotice
          marketName={market.displayName}
          serviceName={service.displayName}
          count={service.providerCount}
          indexingThreshold={service.indexingThreshold}
        />
      ) : null}

      <LocaleNotice
        marketName={market.displayName}
        marketLanguage={market.languageCode}
        contentLanguage={service.languageCode}
        isFallback={service.localeIsFallback}
      />

      <section aria-labelledby="service-scope">
        <h2 id="service-scope" className="text-2xl font-bold tracking-tight text-slate-900">
          What this service covers
        </h2>
        {service.summary ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{service.summary}</p>
        ) : (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            No scope description has been published for this service yet. The catalog row is real —
            the copy is not written, and nothing is generated to fill the gap.
          </p>
        )}

        {service.aliases.length ? (
          <div className="mt-5">
            <AliasChips
              marketSlug={marketSlug}
              aliases={service.aliases}
              cap={16}
              label="Also described as"
            />
          </div>
        ) : null}

        {service.guidance.length ? (
          <div className="mt-6">
            <GuidanceList items={service.guidance} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="service-areas">
        <h2 id="service-areas" className="text-2xl font-bold tracking-tight text-slate-900">
          Areas this can be requested in
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Every location in {market.displayName}&rsquo;s catalog. Picking one runs the search with
          this service already applied.
        </p>
        <div className="mt-4">
          <CoveredAreas marketSlug={marketSlug} locations={locations} service={service} />
        </div>
      </section>

      <section aria-labelledby="service-trust">
        <h2 id="service-trust" className="text-2xl font-bold tracking-tight text-slate-900">
          How this is kept safe
        </h2>
        <div className="mt-5">
          <TrustBadges />
        </div>
      </section>

      {/* The page's single amber focal point, matching the navbar CTA. */}
      <section className={`${CARD} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8`}>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            Need {service.displayName.toLowerCase()}?
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
            Describe the work once. You do not need the trade vocabulary, and you do not need an
            account to look around — an account is only needed to post.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/requests/new" className={CTA_AMBER}>
            Start request
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link
            href={`/${marketSlug}/search?category=${encodeURIComponent(service.canonicalKey)}`}
            className={LINK_ARROW}
          >
            View providers
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="service-faq">
        <h2 id="service-faq" className="text-2xl font-bold tracking-tight text-slate-900">
          Questions about getting this done
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          {category ? `${category.displayName} · ` : ''}
          The same five answers are published on every service page, because none of them depends on
          which trade you arrived from.
        </p>
        <div className="mt-5">
          <Faq items={PLATFORM_FAQS} />
        </div>
      </section>

      <section aria-labelledby="service-next" className={`${CARD} p-6`}>
        <h2 id="service-next" className="text-lg font-bold tracking-tight text-slate-900">
          Where to go next
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          <li>
            <Link href="/how-it-works" className="group block no-underline">
              <span className={LINK_ARROW_LG}>
                How matching works
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                What happens between describing the work and approving it.
              </span>
            </Link>
          </li>
          <li>
            <Link href={`/${marketSlug}/services`} className="group block no-underline">
              <span className={LINK_ARROW_LG}>
                All services in {market.displayName}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                The full canonical catalog for this market.
              </span>
            </Link>
          </li>
          <li>
            <Link href="/trust-and-safety" className="group block no-underline">
              <span className={LINK_ARROW_LG}>
                Trust and safety
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Verification types, and what they do not guarantee.
              </span>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
