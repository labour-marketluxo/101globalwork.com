import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { PUBLIC_BAND } from '@/components/discovery/tokens';
import type { LocationLink, ProviderPreview, ServiceLink } from '@/types/discovery';

/**
 * Shared sections for the public location hubs.
 *
 * These live together because they are all "discovery hub" presentation and
 * always change together; splitting them into five near-identical files would
 * add indirection without adding reuse. `Breadcrumbs` is separate, in
 * components/ui, because it is generic and shared with the leaf route.
 *
 * STYLING: layout, grids and cards use Tailwind utilities bound to this
 * project's own design tokens (bg-surface, border-line, text-muted,
 * rounded-md), so the hubs match the existing palette instead of introducing a
 * parallel one. Text-level classes that already exist — .eyebrow, .lede,
 * .pill, .notice, .need-form — are reused rather than reimplemented. Note the
 * app's preflight is deliberately not imported (see app/globals.css), so border
 * styles are stated explicitly with `border-solid` instead of relying on a
 * global reset.
 */

/**
 * The hub hero — the same full-bleed dark band the country hub and market search use.
 *
 * WHY IT OWNS THE BREADCRUMBS. The trail has to sit inside the band, and the band carries its own
 * gutters. A page that rendered the trail separately would have to repeat the band's container and
 * padding, which is how two hub levels drift apart; passing the trail in keeps each route down to
 * one call and keeps the two heroes identical.
 *
 * THE CURRENCY AND PLACE ARE READ BY THE CALLER, not here: this component only lays out what it is
 * given, so it cannot invent a fact about a market it was not told about.
 *
 * THE SEARCH FIELD IS A PLAIN GET FORM. One field, not two: the old form sent `location` as free
 * text to a global /search page, but the market is in the path now and the search page filters
 * areas from the catalog, so asking "where" here would collect an answer nothing could use.
 */
export function HubHero({
  breadcrumbs,
  badge,
  title,
  lede,
  marketSlug,
}: {
  /** Trail above the badge; the last item is the current page and carries no href. */
  breadcrumbs: { label: string; href?: string }[];
  /** e.g. `CITY · ABUJA`, mirroring the `MARKET · NG` badge on the country hub. */
  badge: string;
  title: string;
  lede: string;
  /** The market these hubs sit under; search is scoped to it now. */
  marketSlug: string;
}) {
  return (
    <section className="w-full bg-primary px-4 pt-8 pb-14 text-white sm:px-6 lg:px-8">
      <div className={PUBLIC_BAND}>
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center">
          {breadcrumbs.map((item, index) => (
            <span key={item.label} className="flex items-center">
              {index > 0 ? (
                <span aria-hidden="true" className="mx-2 text-sm text-slate-500 select-none">
                  /
                </span>
              ) : null}
              {item.href ? (
                <Link
                  href={item.href}
                  className="font-sans text-sm text-slate-300 underline decoration-slate-500/60 underline-offset-4 transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="font-sans text-sm text-slate-400">{item.label}</span>
              )}
            </span>
          ))}
        </nav>

        <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 shadow-none">
          <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-mono text-[11px] font-bold tracking-wider text-amber-400 uppercase">
            {badge}
          </span>
        </span>

        <h1 className="mb-4 text-4xl leading-tight font-bold tracking-tight text-white md:text-5xl">
          {title}
        </h1>
        <p className="mb-8 max-w-3xl text-base leading-relaxed text-slate-300 md:text-lg">{lede}</p>

        <form
          action={`/${marketSlug}/search`}
          method="get"
          className="flex max-w-xl items-center gap-2 rounded-2xl border border-emerald-900/30 bg-white p-2 shadow-xl focus-within:ring-2 focus-within:ring-emerald-400"
        >
          <input
            type="text"
            name="q"
            required
            autoComplete="off"
            aria-label="What do you need done?"
            placeholder="e.g. Fix a leaking pipe"
            className="w-full border-none bg-transparent px-3 text-sm text-slate-900 ring-0 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          <button
            type="submit"
            className="rounded-xl border-0 bg-[#F59E0B] px-5 py-3 font-mono text-xs font-bold whitespace-nowrap text-slate-950 shadow-sm transition-all hover:bg-[#D97706] active:scale-95"
          >
            Find Help →
          </button>
        </form>
      </div>
    </section>
  );
}

/** Grid of child locations: cities on a country hub, localities on a city hub. */
export function LocationGrid({
  heading,
  description,
  items,
  basePath,
}: {
  heading: string;
  description: string;
  items: LocationLink[];
  basePath: string;
}) {
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-bold tracking-tight text-ink">{heading}</h2>
      {/* `max-w-3xl` = the landing's prose measure (SectionHeader uses it). At
          1320px an uncapped line would run ~160 characters. */}
      <p className="mt-1 max-w-3xl text-ink-soft">{description}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.slug}
            href={`${basePath}/${item.slug}`}
            className="rounded-md border border-solid border-line bg-surface p-5 no-underline transition hover:border-line-strong hover:bg-surface-strong"
          >
            <span className="block font-bold text-ink">{item.name}</span>
            <span className="mt-1 block text-sm text-muted">Services and providers</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Service chips.
 *
 * A live service under a locality links to its published leaf; everything else hands
 * off to the market's search as a keyword.
 *
 * Keyword, not `category=`: the hub catalog is mock data with slugs like `plumbers`,
 * while the real search filters on `canonical_key` (`plumbing_residential`). Sending
 * the mock slug as a category would match nothing and read as an empty market, so the
 * chip sends the human name through the free-text query, which degrades honestly — it
 * finds what mentions the trade, and the search page's own category filter is there
 * for an exact match.
 */
export function ServiceChips({
  heading,
  description,
  services,
  marketSlug,
  leafBasePath,
}: {
  heading: string;
  description: string;
  services: ServiceLink[];
  marketSlug: string;
  /** Set only on a locality hub, where leaf routes exist one level below. */
  leafBasePath?: string;
}) {
  const hrefFor = (service: ServiceLink) =>
    leafBasePath && service.live
      ? `${leafBasePath}/${service.slug}`
      : `/${marketSlug}/search?q=${encodeURIComponent(service.name)}`;

  return (
    <section className="mt-14">
      <h2 className="text-2xl font-bold tracking-tight text-ink">{heading}</h2>
      <p className="mt-1 max-w-3xl text-ink-soft">{description}</p>
      <ul className="mt-5 flex list-none flex-wrap items-center gap-2 p-0">
        {services.map((service) => (
          <li key={service.slug}>
            <Link
              href={hrefFor(service)}
              className="pill no-underline text-accent-strong hover:border-accent hover:bg-accent-soft"
            >
              {service.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Featured provider preview.
 *
 * Cards are not links on purpose: /providers/[slug] is served from real data, so
 * a mock slug would 404.
 */
export function ProviderGrid({
  heading,
  description,
  providers,
}: {
  heading: string;
  description: string;
  providers: ProviderPreview[];
}) {
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-bold tracking-tight text-ink">{heading}</h2>
      <p className="mt-1 max-w-3xl text-ink-soft">{description}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {providers.map((provider) => (
          <article
            key={provider.slug}
            className="rounded-md border border-solid border-line bg-surface p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-ink">{provider.displayName}</h3>
                <p className="mt-1 text-sm text-ink-soft">{provider.headline}</p>
              </div>
              {provider.verified ? (
                <span className="pill shrink-0 bg-accent-soft text-accent">Verified</span>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-muted">
              <span className="font-bold text-ink">★ {provider.rating.toFixed(1)}</span>
              {' · '}
              {provider.completedJobs} jobs completed
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/**
 * Indexability disclosure, matching the wording used by the leaf route.
 * These hubs are useful to visitors but are not yet eligible for indexing —
 * 101GlobalWork only indexes a location page once supply and quality thresholds
 * are met.
 *
 * A FOOTNOTE, NOT A BOX. It used to use the `.notice` class, which drew a bordered
 * card, so the last thing on the page was a stray panel floating in the middle of
 * an otherwise full-width column. It is now a quiet bottom-ruled note: it closes
 * the page instead of competing with the directory above it.
 */
export function IndexabilityNotice() {
  return (
    <aside className="max-w-3xl border-b border-solid border-slate-200 pb-4 text-sm leading-relaxed text-slate-600">
      This hub helps you navigate, but it is not yet eligible for search indexing.
      101GlobalWork only indexes service-location pages after supply and quality
      thresholds are met.
    </aside>
  );
}