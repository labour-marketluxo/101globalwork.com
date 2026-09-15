import Link from 'next/link';
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

/** Hero plus the search entry point, mirroring the homepage's form contract. */
export function HubHero({
  eyebrow,
  title,
  lede,
  searchLocation,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  searchLocation: string;
}) {
  return (
    <header className="mb-10">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 mb-4 text-4xl leading-tight font-bold tracking-tight text-ink sm:text-5xl">
        {title}
      </h1>
      <p className="lede left">{lede}</p>
      <form className="need-form stacked" action="/search" method="get">
        <label htmlFor="hub-need">What do you need done?</label>
        <input
          id="hub-need"
          name="q"
          required
          autoComplete="off"
          placeholder="e.g. Fix a leaking pipe"
        />
        <label htmlFor="hub-location">Where</label>
        <input id="hub-location" name="location" defaultValue={searchLocation} />
        <button type="submit">Find help</button>
      </form>
    </header>
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
      <p className="mt-1 text-ink-soft">{description}</p>
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
 * A live service under a locality links to its published leaf; everything else
 * links to /search. That keeps the chips honest: a hub never links to a leaf
 * route that does not exist yet.
 */
export function ServiceChips({
  heading,
  description,
  services,
  searchLocation,
  leafBasePath,
}: {
  heading: string;
  description: string;
  services: ServiceLink[];
  searchLocation: string;
  /** Set only on a locality hub, where leaf routes exist one level below. */
  leafBasePath?: string;
}) {
  const hrefFor = (service: ServiceLink) =>
    leafBasePath && service.live
      ? `${leafBasePath}/${service.slug}`
      : `/search?service=${encodeURIComponent(service.slug)}&location=${encodeURIComponent(searchLocation)}`;

  return (
    <section className="mt-14">
      <h2 className="text-2xl font-bold tracking-tight text-ink">{heading}</h2>
      <p className="mt-1 text-ink-soft">{description}</p>
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
      <p className="mt-1 text-ink-soft">{description}</p>
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
 */
export function IndexabilityNotice() {
  return (
    <aside className="notice">
      This hub helps you navigate, but it is not yet eligible for search indexing.
      101GlobalWork only indexes service-location pages after supply and quality
      thresholds are met.
    </aside>
  );
}