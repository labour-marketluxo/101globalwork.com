import Link from 'next/link';
import type { MarketLocation, MarketProvider, MarketService } from '@/features/discovery/data/market-catalog';

/**
 * MarketSections — the pieces the two market routes are built from.
 *
 * `/{market}/services` and `/{market}/search` are the market-scoped siblings of the
 * location hubs in HubSections.tsx, so they borrow that file's visual language
 * (tokens, `max-w-5xl`, `.pill`, `.notice`, `.need-form`) rather than the landing
 * page's. Same family of page, same clothes.
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

const FIELD = 'rounded-md border border-solid border-line bg-surface px-3 py-2 text-sm text-ink';

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

/** The market-scoped search box. The global `/search` form is unchanged. */
export function MarketSearchBar({
  marketSlug,
  marketName,
  defaultQuery = '',
}: {
  marketSlug: string;
  marketName: string;
  defaultQuery?: string;
}) {
  return (
    <form className="need-form stacked" action={`/${marketSlug}/search`} method="get">
      <label htmlFor="market-q">What do you need done in {marketName}?</label>
      <input
        id="market-q"
        name="q"
        required
        autoComplete="off"
        placeholder="e.g. Fix a leaking pipe"
        defaultValue={defaultQuery}
      />
      <button type="submit">Search this market</button>
    </form>
  );
}

/** Label for a filter option, so region/city/locality are never confused. */
function locationLabel(location: MarketLocation): string {
  const type = location.type === 'locality' ? 'area' : location.type;
  return `${location.name} (${type})`;
}

/**
 * The service directory: one card per service in the catalog, each with its own
 * "Explore category" link into the market's search.
 *
 * The catalog holds two services today. That is not a bug in the page — it is the
 * whole public service catalog — and printing four would mean inventing two.
 */
export function ServiceCategoryGrid({
  marketSlug,
  marketName,
  currencyCode,
  services,
  locations,
}: {
  marketSlug: string;
  marketName: string;
  currencyCode: string;
  services: MarketService[];
  locations: MarketLocation[];
}) {
  const cities = locations.filter((location) => location.type === 'city' || location.type === 'locality');

  return (
    <section className="mt-14">
      <h2 className="text-2xl font-bold tracking-tight text-ink">
        Service categories in {marketName}
      </h2>
      <p className="mt-1 text-ink-soft">
        Quotes in this market are priced in {currencyCode}. Pick a category to see who can do the
        work, or describe it in your own words and we will match it.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {services.map((service) => (
          <article
            key={service.canonicalKey}
            className="flex flex-col justify-between rounded-md border border-solid border-line bg-surface p-5"
          >
            <div>
              <span className="pill shrink-0 bg-accent-soft text-accent">Service</span>
              <h3 className="mt-3 text-lg font-bold text-ink">{service.displayName}</h3>
              <p className="mt-1 text-sm text-ink-soft">
                Providers offering {service.displayName.toLowerCase()} in this market, matched against
                the same scope so the quotes can be compared.
              </p>

              {cities.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {cities.slice(0, 4).map((location) => (
                    <Link
                      key={location.locationId}
                      href={`/${marketSlug}/search?category=${encodeURIComponent(service.canonicalKey)}&area=${encodeURIComponent(location.code)}`}
                      className="pill no-underline text-accent-strong hover:border-accent hover:bg-accent-soft"
                    >
                      {location.name}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-5">
              <Link
                href={`/${marketSlug}/search?category=${encodeURIComponent(service.canonicalKey)}`}
                className="button-link"
              >
                Explore category
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

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
      <p className="mt-1 text-ink-soft">
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
    <form className="stack-form" action={`/${marketSlug}/search`} method="get">
      <label>
        <span className="block text-sm font-bold text-ink">Keyword</span>
        <input
          className={`${FIELD} mt-1 w-full`}
          type="search"
          name="q"
          defaultValue={state.query}
          autoComplete="off"
          placeholder="Headline or description"
        />
      </label>

      <label>
        <span className="block text-sm font-bold text-ink">Service</span>
        <select className={`${FIELD} mt-1 w-full`} name="category" defaultValue={state.category}>
          <option value="">All services</option>
          {services.map((service) => (
            <option key={service.canonicalKey} value={service.canonicalKey}>
              {service.displayName}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="block text-sm font-bold text-ink">Area</span>
        <select className={`${FIELD} mt-1 w-full`} name="area" defaultValue={state.area}>
          <option value="">Anywhere in {marketName}</option>
          {locations
            .filter((location) => location.type !== 'country')
            .map((location) => (
              <option key={location.locationId} value={location.code}>
                {locationLabel(location)}
              </option>
            ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="availability" value="open" defaultChecked={state.acceptingOnly} />
        <span>Only providers accepting new work</span>
      </label>

      <label>
        <span className="block text-sm font-bold text-ink">Sort by</span>
        <select className={`${FIELD} mt-1 w-full`} name="sort" defaultValue={state.sort}>
          <option value="readiness">Platform readiness</option>
          <option value="experience">Years of experience</option>
        </select>
      </label>

      <button type="submit">Apply filters</button>

      {activeFilterCount(state) > 0 ? (
        <Link href={`/${marketSlug}/search`} className="secondary-link">
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
      <details className="lg:hidden">
        <summary className="cursor-pointer rounded-md border border-solid border-line bg-surface px-4 py-3 text-sm font-bold text-ink">
          Filters{applied > 0 ? ` (${applied} applied)` : ''}
        </summary>
        <div className="mt-4">
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
        <h2 className="text-lg font-bold text-ink">Filters</h2>
        <div className="mt-4">
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
}: {
  provider: MarketProvider;
  /** Marks a card rendered from the dev-only preview list. Never true in production. */
  sample?: boolean;
}) {
  return (
    <article className="rounded-md border border-solid border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">
            {provider.headline ?? provider.slug.replace(/-/g, ' ')}
          </h3>
          {provider.services.length || provider.areas.length ? (
            <p className="mt-1 text-sm text-ink-soft">
              {[...provider.services, ...provider.areas].join(' · ')}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {sample ? (
            <span className="pill bg-secondary-light text-amber-800">Sample</span>
          ) : null}
          {provider.verified ? (
            <span className="pill shrink-0 bg-accent-soft text-accent">Identity checked</span>
          ) : null}
        </div>
      </div>

      {provider.description ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{provider.description}</p>
      ) : null}

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        {provider.yearsExperience !== null ? (
          <div className="flex gap-1.5">
            <dt>Experience:</dt>
            <dd className="font-bold text-ink">
              {provider.yearsExperience} {provider.yearsExperience === 1 ? 'year' : 'years'}
            </dd>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <dt>Availability:</dt>
          <dd className="font-bold text-ink">
            {provider.acceptsNewWork ? 'Accepting new work' : 'Not taking new work'}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Platform readiness:</dt>
          <dd className="font-bold text-ink">{provider.readinessScore.toFixed(0)}/100</dd>
        </div>
      </dl>

      {provider.slug ? (
        <p className="mt-3 text-xs text-muted">
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
    <div className="rounded-md border border-solid border-line bg-surface p-6">
      <h3 className="text-lg font-bold text-ink">
        {unavailable
          ? 'We cannot search this market right now'
          : hasFilters
            ? `No providers in ${marketName} match those filters`
            : `No providers are published in ${marketName} yet`}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        {unavailable
          ? 'The provider catalog did not respond. This is a problem on our side, not a statement about what is available — try again in a moment.'
          : 'Providers appear here once they have been verified and published. Nothing is shown for a market we cannot fill, because a list of unverified names would be worse than an empty list.'}
      </p>
      <div className="entry-actions mt-4">
        <Link href="/requests/new" className="button-link">
          Post an open request
        </Link>
        <Link href="/how-it-works" className="secondary-link">
          See how matching works
        </Link>
      </div>
    </div>
  );
}

/** States what is deliberately not on the page. Silence would be the dishonest option. */
export function MarketDataNotice({ className = '' }: { className?: string }) {
  return (
    <aside className={`notice ${className}`}>
      <strong>What is not published here:</strong> customer ratings and prices. The platform has no
      reviews table, and provider prices are only ever stated on an itemized quote — so there is no
      rating or &ldquo;from&rdquo; figure to show on a card. Filters exist only for the data that does:{' '}
      <Link href="/trust-and-safety" className="underline">
        verification
      </Link>{' '}
      and{' '}
      <Link href="/pricing" className="underline">
        fees
      </Link>{' '}
      are explained on their own pages.
    </aside>
  );
}
