import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin } from '@/components/ui/icons';
import { PUBLIC_BAND } from '@/components/discovery/tokens';
import { IndexabilityNotice } from '@/components/discovery/HubSections';
import { getCountryHub } from '@/features/discovery/data/mock-locations';
import { getMarket, getMarketLocations } from '@/features/discovery/data/market-catalog';
import {
  categoryHref,
  getServiceTaxonomy,
  serviceHref,
} from '@/features/discovery/data/service-taxonomy';
import { getIntentCatalog, outcomeHref, problemHref } from '@/features/discovery/data/intent-taxonomy';
import { GUIDES } from '@/features/marketing/guides';

/**
 * Country service hub — e.g. /ng
 *
 * Top of the public location hierarchy and the breadcrumb target for every leaf route below it.
 * Server component: no client JavaScript, and it renders inside the (marketing) route group.
 *
 * ⚠️ THE HERO AND THE CITY/PROVIDER ROWS ARE THE EXISTING MOCK DATA. Cities, scopes and providers
 * come from features/discovery/data/mock-locations.ts, whose header states plainly that the hub
 * projections do not exist in SQL yet and that "nothing here — least of all the provider names and
 * ratings — represents real supply". The page stays `robots: { index: false }`.
 *
 * THE DIRECTORY BELOW THE HERO IS REAL, AND THAT IS THE POINT OF THIS FILE. Categories, services,
 * problems and outcomes are read from the same public catalogs the detail routes resolve against,
 * and every link is built with the platform's own href helpers (`categoryHref`, `serviceHref`,
 * `problemHref`, `outcomeHref`). So the hub only ever links to a page that exists:
 *
 *   · a catalogue that has not been curated yet renders no block at all, rather than a list of
 *     invented categories;
 *   · when the taxonomy is empty the scope row falls back to the mock scopes, which hand off to
 *     market search — the honest "nothing curated yet" state;
 *   · guides are static, reviewed content (features/marketing/guides.ts) and are always present.
 *
 * The alternative — hardcoding links to every route so they can be clicked during development —
 * was rejected: those links would keep working after the fixtures were gone and point at pages
 * whose data does not exist. Reading the catalogue is what makes the navigation true in production
 * as well as in preview.
 *
 * THE CURRENCY LINE IS ALSO A REAL READ. The hero subtitle names the market's currency, and the
 * hub's mock data has no currency column, so the page asks the public market catalog (`getMarket`).
 * If the catalog cannot be read the sentence is dropped rather than guessed.
 *
 * Unknown countries still call notFound() — this dynamic segment would otherwise swallow any
 * unmatched single-segment URL and turn a 404 into a fabricated hub.
 */

type Params = Promise<{ market: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { market } = await params;
  const hub = getCountryHub(market);
  if (!hub) return {};

  return {
    title: `${hub.name} — services and providers`,
    description: hub.intro,
    // No trailing slash: next.config.ts does not set `trailingSlash`, so a
    // trailing-slash canonical would point at a URL that 308-redirects.
    alternates: { canonical: `/${hub.slug}` },
    robots: { index: false, follow: true },
  };
}

const CHIP =
  'flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2 font-mono text-xs text-slate-700 no-underline transition-all hover:border-primary hover:bg-primary hover:text-white';
const LINK_ROW =
  'font-mono text-xs font-semibold text-slate-700 no-underline transition-colors hover:text-amber-600';

export default async function CountryHubPage({ params }: { params: Params }) {
  const { market } = await params;
  const hub = getCountryHub(market);
  if (!hub) notFound();

  const basePath = `/${hub.slug}`;
  const searchHref = (query: string) => `${basePath}/search?q=${encodeURIComponent(query)}`;

  // The real catalogues. `getIntentCatalog` reads locations and taxonomy itself (both are cached
  // per request), so the two calls below do not pay for the same rows twice.
  const catalogMarket = await getMarket(hub.slug);
  const locations = catalogMarket ? await getMarketLocations(catalogMarket.marketId) : [];
  const taxonomy = catalogMarket ? await getServiceTaxonomy(catalogMarket, locations) : null;
  const intents = catalogMarket ? await getIntentCatalog(catalogMarket) : null;

  const marketSlug = catalogMarket?.slug ?? hub.slug;
  const currency = catalogMarket?.currencyCode ?? null;
  const categories = taxonomy?.categories ?? [];
  const services = taxonomy?.services ?? [];
  const problems = intents?.problems ?? [];
  const outcomes = intents?.outcomes ?? [];

  // Only providers the mock data marks verified, so the "Vetted Regional Providers"
  // heading and the badge on every card are both true of what is on screen.
  const providers = hub.featuredProviders.filter((provider) => provider.verified);

  return (
    <>
      {/* ══ FULL-BLEED HERO ════════════════════════════════════════════════════════════ */}
      <section className="w-full bg-primary px-4 pt-8 pb-14 text-white sm:px-6 lg:px-8">
        <div className={PUBLIC_BAND}>
          <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center">
            <Link
              href="/"
              className="font-sans text-sm text-slate-300 underline decoration-slate-500/60 underline-offset-4 transition-colors hover:text-white"
            >
              Home
            </Link>
            <span aria-hidden="true" className="mx-2 text-sm text-slate-500 select-none">
              /
            </span>
            <span className="font-sans text-sm text-slate-400">{hub.name}</span>
          </nav>

          <span className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 shadow-none">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-sans text-[11px] font-bold tracking-wider text-amber-400 uppercase">
              MARKET · {hub.code}
            </span>
          </span>

          <h1 className="mb-4 text-4xl leading-tight font-bold tracking-tight text-white md:text-5xl">
            Find trusted services across {hub.name}
          </h1>

          <p className="mb-8 max-w-3xl text-base leading-relaxed text-slate-300 md:text-lg">
            Matched on the service and area a provider is eligible for, not on a ranked list.
            {currency ? ` Quotes are priced in ${currency}.` : null}
          </p>

          <form
            action={`${basePath}/search`}
            method="get"
            className="flex max-w-xl items-center gap-2 rounded-2xl border border-emerald-900/30 bg-white p-2 shadow-xl focus-within:ring-2 focus-within:ring-emerald-400"
          >
            <input
              type="text"
              name="q"
              required
              autoComplete="off"
              aria-label={`What do you need done in ${hub.name}?`}
              placeholder="e.g. Fix a leaking pipe, inverter installation..."
              className="w-full border-none bg-transparent px-3 text-sm text-slate-900 ring-0 placeholder:text-slate-400 focus:outline-none focus:ring-0"
            />
            <button
              type="submit"
              className="rounded-xl border-0 bg-[#F59E0B] px-5 py-3 font-sans text-xs font-bold whitespace-nowrap text-slate-950 shadow-sm transition-all hover:bg-[#D97706] active:scale-95"
            >
              Find Help →
            </button>
          </form>
        </div>
      </section>

      {/* ══ DIRECTORY ══════════════════════════════════════════════════════════════════ */}
      <div className={`${PUBLIC_BAND} px-4 pt-12 pb-24 sm:px-6 lg:px-8`}>
        {/* ── cities ──────────────────────────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-2xl font-bold text-slate-900">Cities &amp; Active Hubs</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {hub.cities.map((city) => (
              <Link
                key={city.slug}
                href={`${basePath}/${city.slug}`}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition-all hover:border-emerald-500/50"
              >
                {/* THE IMAGE SLOT, FULL-BLEED. It sits flush against the card's top, left and
                    right edges — the card carries the padding for the text below instead, and
                    `overflow-hidden` clips the image to the card's corners. Set `image` on the city
                    in features/discovery/data/mock-locations.ts to a file under
                    public/images/markets/; until then this is the grey block from the design. */}
                <div className="relative aspect-[3/2] w-full bg-slate-200">
                  {city.image ? (
                    <Image
                      src={city.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : null}
                </div>

                {/* `flex-1` + `mt-auto` on the button: the three cards are grid items, so they
                    already stretch to the tallest one; this makes the text block fill that height
                    and pins every button to the card's floor, whatever the copy does. The `mb-5`
                    on the paragraph keeps a minimum gap when the copy is long enough to fill it. */}
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-lg font-bold text-slate-900">{city.name}</h3>
                  <p className="mt-3 mb-5 text-sm leading-relaxed text-slate-600">{city.intro}</p>

                  <span className="mt-auto inline-flex w-fit items-center gap-2 rounded-full bg-slate-900 px-4 py-2 font-sans text-xs font-semibold text-white transition-colors group-hover:bg-slate-800">
                    Browse {city.name} providers →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── the real directory: categories + services ───────────────────────────────── */}
        <section className="mt-10 mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">The {hub.name} directory</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Catalogue entries the platform publishes for this market. Each one opens its own
                page rather than a keyword search.
              </p>
            </div>
            <Link href={`${basePath}/services`} className={LINK_ROW}>
              All trades and services →
            </Link>
          </div>

          {categories.length ? (
            <div className="mb-5 grid gap-4 md:grid-cols-2">
              {categories.map((category) => (
                <Link
                  key={category.categoryId}
                  href={categoryHref(marketSlug, category)}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-5 no-underline transition-all hover:border-emerald-500/50 hover:bg-white"
                >
                  <span>
                    <span className="block text-lg font-bold text-slate-900">
                      {category.displayName}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-600">
                      {category.definition}
                    </span>
                  </span>
                  <span className="mt-4 font-mono text-xs font-semibold text-slate-700">
                    {category.services.length} service
                    {category.services.length === 1 ? '' : 's'} →
                  </span>
                </Link>
              ))}
            </div>
          ) : null}

          {services.length ? (
            <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
              {services.map((service) => (
                <li key={service.serviceEntityId}>
                  <Link href={serviceHref(marketSlug, service)} className={CHIP}>
                    {service.displayName} →
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            /* Nothing curated yet: the honest fallback, and the one place a keyword is right. */
            <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
              {hub.popularServices.map((service) => (
                <li key={service.slug}>
                  <Link href={searchHref(service.name)} className={CHIP}>
                    {service.name} →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── problems + outcomes ─────────────────────────────────────────────────────── */}
        {problems.length || outcomes.length ? (
          <section className="mb-10 grid gap-6 md:grid-cols-2">
            {problems.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-1 text-xl font-bold text-slate-900">Common problems</h2>
                <p className="mb-4 text-sm leading-relaxed text-slate-600">
                  Describe the symptom; the platform maps it to the trade that fixes it.
                </p>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {problems.map((problem) => (
                    <li
                      key={problem.problemEntityId}
                      className="flex flex-wrap items-center justify-between gap-3"
                    >
                      <Link href={problemHref(marketSlug, problem)} className={LINK_ROW}>
                        {problem.displayName}
                      </Link>
                      <span className="font-mono text-[10px] tracking-wider text-slate-400 uppercase">
                        {problem.severity}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {outcomes.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-1 text-xl font-bold text-slate-900">Outcomes</h2>
                <p className="mb-4 text-sm leading-relaxed text-slate-600">
                  What a job is for — written as the result, not as the trade.
                </p>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {outcomes.map((outcome) => (
                    <li key={outcome.outcomeEntityId}>
                      <Link href={outcomeHref(marketSlug, outcome)} className={LINK_ROW}>
                        {outcome.displayName} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ── guides: static, reviewed content, always available ──────────────────────── */}
        <section className="mb-10">
          <h2 className="mb-1 text-2xl font-bold text-slate-900">Guides</h2>
          <p className="mb-6 text-sm text-slate-600">
            Checked answers to the questions that come up before a job is posted.
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {GUIDES.map((guide) => (
              <Link
                key={guide.slug}
                href={`/${marketSlug}/guides/${guide.slug}`}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 no-underline shadow-sm transition-all hover:border-slate-300"
              >
                <span>
                  <span className="block text-lg font-bold text-slate-900">{guide.title}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-slate-600">
                    {guide.summary}
                  </span>
                </span>
                <span className="mt-4 font-sans text-xs font-semibold text-slate-700">
                  {guide.readMinutes} min read →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── vetted providers ────────────────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-1 text-2xl font-bold text-slate-900">Vetted Regional Providers</h2>
          <p className="mb-6 text-sm text-slate-600">
            Providers holding verified status with itemized job history.
          </p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {providers.map((provider) => (
              <article
                key={provider.slug}
                className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-slate-300"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-lg font-bold text-slate-900">{provider.displayName}</h3>
                    <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 font-sans text-[10px] font-bold text-emerald-800">
                      VERIFIED PROVIDER
                    </span>
                  </div>
                  <p className="my-3 text-sm leading-relaxed text-slate-600">{provider.headline}</p>
                </div>

                {/* ── the artwork, full-bleed like the design ───────────────────────────────
                    No padding: it runs to the card's left and right edges and `overflow-hidden`
                    clips it to the corners. Set `image` on the provider in
                    features/discovery/data/mock-locations.ts to a file under
                    public/images/providers/; until then this is the grey block. */}
                <div className="relative aspect-video w-full bg-slate-200">
                  {provider.image ? (
                    <Image
                      src={provider.image}
                      alt=""
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : null}
                </div>

                {/* ── the foot: the numbers on the left, the way in on the right ──────────── */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-5 pt-4">
                  <span className="w-fit rounded-lg bg-slate-100 px-3 py-1.5 font-sans text-xs font-semibold text-slate-700">
                    ★ {provider.rating.toFixed(1)} · {provider.completedJobs} jobs completed
                  </span>
                  <Link href={searchHref(provider.displayName)} className={LINK_ROW}>
                    View Profile →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <IndexabilityNotice />
      </div>
    </>
  );
}
