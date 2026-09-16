import Link from 'next/link';
import {
  Camera,
  Cog,
  FileText,
  Hammer,
  Lock,
  MapPin,
  Mic,
  Paintbrush,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Star,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Homepage sections — PRD 7.1 (Home Experience), Option A design tokens.
 *
 * Server components throughout: there are no hooks or handlers, so nothing here
 * needs 'use client' and the whole homepage stays server-rendered.
 *
 * TOKENS: these use the Option A utilities added to the @theme block in
 * app/globals.css — bg-surface-card, border-border-subdued, border-border-default,
 * text-text-main, text-text-muted, bg-brand-primary, bg-brand-hover.
 *
 * ONE DELIBERATE DEVIATION: the CTA uses bg-accent-cta / bg-accent-cta-hover
 * (#d97706 / #b45309 — exactly the ochre the brief specifies) rather than
 * bg-accent / bg-accent-hover. `--color-accent` is already live as this app's
 * green emphasis colour (#23685d) and is referenced by every eyebrow, divider
 * and hover rule; reassigning it is an app-wide migration, not a homepage
 * change. `--color-accent-hover` does not exist at all. See the report.
 *
 * Borders are declared `border-solid` explicitly because this project
 * deliberately does not import Tailwind's preflight (see app/globals.css), so
 * there is no global reset making borders solid by default.
 */

/* ------------------------------------------------------------------- data */

const SERVICE_CATEGORIES: { slug: string; name: string; icon: LucideIcon }[] = [
  { slug: 'plumbers', name: 'Plumbing', icon: Wrench },
  { slug: 'electricians', name: 'Electrical Systems', icon: Zap },
  { slug: 'air-conditioning', name: 'Air Conditioning & HVAC', icon: Wind },
  { slug: 'generator-repair', name: 'Generator Repair', icon: PlugZap },
  { slug: 'home-cleaning', name: 'Home Cleaning', icon: Sparkles },
  { slug: 'carpentry-roofing', name: 'Carpentry & Roofing', icon: Hammer },
  { slug: 'painting-finishes', name: 'Painting & Finishes', icon: Paintbrush },
  { slug: 'appliance-repair', name: 'Appliance Repair', icon: Cog },
];

/**
 * Secondary actions.
 *
 * Destinations are existing routes only. Note "My Assets" has no product
 * surface yet — it currently lands on /work rather than a 404, and "Plan a
 * Project" maps to the request builder. Both need a real destination before
 * launch.
 */
const ACTION_CHIPS: { label: string; href: string }[] = [
  { label: 'Find a Service', href: '/services' },
  { label: 'Plan a Project', href: '/requests/new' },
  { label: 'My Work', href: '/work' },
  { label: 'My Assets', href: '/work' },
  { label: 'Help Me Figure It Out', href: '/search' },
];

const TRUST_POINTS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Verified Credentials',
    body: 'Identity & skill badges verified before hire.',
  },
  {
    icon: FileText,
    title: 'Clear Scope & Quotes',
    body: 'Compare binding itemized estimates.',
  },
  {
    icon: Lock,
    title: 'Protected Release',
    body: 'Payment is secured and only released upon completed work approval.',
  },
];

/**
 * PLACEHOLDER social proof. There is no completed-work feed in the schema yet,
 * so these three entries are illustrative and must be replaced by a real query
 * before this section ships to production.
 */
const RECENT_WORK: { id: string; category: string; locality: string; rating: number }[] = [
  { id: 'w1', category: 'Plumbing', locality: 'Gwarinpa, Abuja', rating: 4.9 },
  { id: 'w2', category: 'Air Conditioning & HVAC', locality: 'Lekki, Lagos', rating: 4.8 },
  { id: 'w3', category: 'Generator Repair', locality: 'Maitama, Abuja', rating: 5.0 },
];

/* --------------------------------------------------------------- sections */

export function HomeHero() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pt-16 pb-8 text-center sm:pt-24">
      <p className="text-xs font-semibold tracking-widest text-brand-primary uppercase">
        101GlobalWork
      </p>

      <h1 className="mt-4 text-4xl leading-tight font-extrabold tracking-tight text-text-main sm:text-5xl lg:text-6xl">
        What do you need done?
      </h1>

      <p className="mx-auto mt-4 max-w-2xl text-lg text-text-muted">
        Describe the work. We’ll help you find the right service and trusted providers near you.
      </p>

      <form
        action="/search"
        method="get"
        className="mt-8 rounded-lg border border-solid border-border-default bg-surface-card p-2 text-left shadow-sm"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Search text input, with the speak / attach controls inline */}
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-solid border-border-subdued pl-3">
            <input
              id="home-need"
              name="q"
              required
              autoComplete="off"
              placeholder="e.g. Fix a leaking pipe or install a generator..."
              aria-label="Describe the work you need done"
              className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm text-text-main outline-none placeholder:text-text-muted"
            />
            {/*
              Modality controls. Present for the PRD layout; voice capture and
              photo attachment are NOT implemented yet, so these are inert
              placeholders (type="button" keeps them from submitting the form).
            */}
            <button
              type="button"
              title="Voice description"
              aria-label="Voice description"
              className="shrink-0 rounded-md p-2 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-main"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Attach photo/damage"
              aria-label="Attach photo or damage report"
              className="shrink-0 rounded-md p-2 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-main"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>

          {/* Location */}
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-solid border-border-subdued pl-3 sm:w-72">
            <MapPin className="h-4 w-4 shrink-0 text-text-muted" />
            <input
              id="home-location"
              name="location"
              autoComplete="address-level2"
              placeholder="Your area or city (e.g. Abuja, Gwarinpa)"
              aria-label="Your area or city"
              className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm text-text-main outline-none placeholder:text-text-muted"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-accent-cta px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-cta-hover"
          >
            Find help
          </button>
        </div>
      </form>
    </section>
  );
}

export function ActionChips() {
  return (
    <nav aria-label="Secondary actions" className="mx-auto w-full max-w-3xl px-6 pb-14">
      <ul className="flex list-none flex-wrap justify-center gap-2 p-0">
        {ACTION_CHIPS.map((action) => (
          <li key={action.label}>
            <Link
              href={action.href}
              className="inline-block rounded-md border border-solid border-border-subdued bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-main no-underline transition-colors hover:bg-slate-200"
            >
              {action.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ServiceCategories() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16">
      <h2 className="text-2xl font-bold tracking-tight text-text-main">
        Popular service categories
      </h2>
      <p className="mt-1 text-text-muted">
        Jump straight to the trade you need, or describe the job and let the request do the work.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {SERVICE_CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <Link
              key={category.slug}
              // Every category routes to the search entry point. Dedicated
              // /services/<slug> landing pages do not exist yet, and only
              // `plumbers` has a published public_routes leaf today, so this is
              // the one destination guaranteed not to 404.
              href={`/search?service=${encodeURIComponent(category.slug)}`}
              className="flex flex-col rounded-lg border border-solid border-border-subdued bg-surface-card p-4 no-underline shadow-sm transition-all hover:border-brand-primary"
            >
              <Icon className="h-5 w-5 text-brand-primary" />
              <span className="mt-3 font-semibold text-text-main">{category.name}</span>
              <span className="mt-1 text-xs text-text-muted">Browse providers →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function TrustBanner() {
  return (
    <section className="mx-auto w-full max-w-4xl px-6 pb-16">
      <div className="rounded-lg border border-solid border-border-subdued bg-surface-card p-6 shadow-sm sm:p-8">
        <h2 className="text-2xl font-bold tracking-tight text-text-main">
          Work done safely with protected payments
        </h2>

        <ul className="mt-6 grid list-none gap-6 p-0 sm:grid-cols-3">
          {TRUST_POINTS.map((point) => {
            const Icon = point.icon;
            return (
              <li key={point.title}>
                <Icon className="h-5 w-5 text-brand-primary" />
                <h3 className="mt-2 font-semibold text-text-main">{point.title}</h3>
                <p className="mt-1 text-sm text-text-muted">{point.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function RecentWork() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-20">
      <h2 className="text-2xl font-bold tracking-tight text-text-main">Proven completed work</h2>
      <p className="mt-1 text-text-muted">
        Completed jobs, verified against the provider who delivered them.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {RECENT_WORK.map((job) => (
          <article
            key={job.id}
            className="rounded-lg border border-solid border-border-subdued bg-surface-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-text-main">{job.category}</h3>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-text-main">
                <MapPin className="h-3 w-3" />
                {job.locality}
              </span>
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-sm text-text-main">
              <Star className="h-4 w-4 fill-current text-accent-cta" />
              <span className="font-semibold numeric">{job.rating.toFixed(1)}</span>
            </p>

            <span className="mt-3 inline-flex items-center gap-2 rounded-md border border-solid border-border-subdued px-2 py-1 text-xs font-medium text-text-main">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
              Verified Work
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
