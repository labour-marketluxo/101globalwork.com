import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';

/**
 * PageSections — the shared building blocks for the PUBLIC marketing routes.
 *
 * WHY THIS FILE EXISTS
 *
 * The landing page was written as five self-contained sections, and every one of
 * them re-typed the same strings: the section wrapper, the 1320px container, the
 * eyebrow pill, the h2 scale, the card surface, the CTA button. Splitting the
 * landing into /how-it-works, /pricing and /trust-and-safety would have tripled
 * that duplication — three more copies of the button classes alone — so this is
 * the single definition the landing, the three new routes and the landing's
 * previews all render from.
 *
 * NOT the same bucket as its neighbours. components/marketing/ also contains
 * HomeSections / InteractivePhotoCards / SearchWizard, which are superseded
 * leftovers imported nowhere. This file is live: if you delete it, four routes
 * stop compiling.
 *
 * TWO HOUSE RULES, because this project breaks both defaults:
 *
 * 1. Preflight is deliberately NOT imported (see app/globals.css), so there is no
 *    global `a { text-decoration: none }`. EVERY Link rendered here carries
 *    `no-underline` explicitly. Drop it and the link turns browser-default blue
 *    and underlined.
 * 2. Amber is a status/action colour, never decoration. On the dark teal it is
 *    `text-amber-300`; `text-secondary` (#D97706) only clears AA on the very
 *    large type in the hero. On white, amber text must be `text-amber-800`.
 *
 * Tone is a prop rather than a per-caller className so that a section's colours
 * cannot drift: `white` / `canvas` / `primary` are the three surfaces the landing
 * already alternates between, and every text colour inside is derived from the
 * same value.
 */

export type SectionTone = 'white' | 'canvas' | 'primary';
export type Accent = 'primary' | 'amber' | 'emerald';
export type ActionVariant = 'primary' | 'amber' | 'ghost' | 'light' | 'link' | 'link-dark';

const SECTION_TONE: Record<SectionTone, string> = {
  white: 'bg-white text-slate-900',
  canvas: 'bg-canvas-subtle text-slate-900',
  primary: 'bg-primary text-white',
};

const CARD_TONE: Record<SectionTone, string> = {
  white: 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8',
  canvas: 'rounded-2xl border border-slate-200 bg-canvas p-6 sm:p-8',
  primary: 'rounded-2xl border border-white/10 bg-primary-dark p-6 text-white sm:p-8',
};

/** Eyebrow pill. `dark` inverts it for the deep-teal surfaces. */
const EYEBROW_TONE: Record<'light' | 'dark', Record<Accent, string>> = {
  light: {
    primary: 'border-primary-subtle bg-primary-surface text-primary',
    amber: 'border-amber-200 bg-secondary-light text-amber-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  dark: {
    primary: 'border-white/15 bg-white/10 text-white',
    amber: 'border-white/15 bg-white/10 text-amber-300',
    emerald: 'border-white/15 bg-white/10 text-emerald-300',
  },
};

const CTA_TONE: Record<ActionVariant, string> = {
  primary:
    'gap-2 justify-center rounded-lg bg-primary px-5 py-2.5 font-mono text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark',
  amber:
    'gap-2 w-full justify-center rounded-xl bg-secondary px-8 py-4 font-mono text-base font-bold text-white shadow-xl shadow-amber-950/30 transition-all hover:bg-secondary-dark sm:w-auto',
  ghost:
    'gap-2 w-full justify-center rounded-xl border border-white/20 bg-white/10 px-8 py-4 font-mono text-base font-semibold text-white transition-all hover:bg-white/20 sm:w-auto',
  light:
    'gap-2 w-full justify-center rounded-xl border border-slate-300 bg-white px-8 py-4 font-mono text-base font-semibold text-slate-900 transition-colors hover:border-slate-400 sm:w-auto',
  // The two inline variants own their own gap so the arrow can travel on hover —
  // a base `gap-2` would have won the cascade and made `hover:gap-*` a no-op.
  link: 'gap-1.5 font-mono text-xs font-semibold text-primary transition-all hover:gap-2.5',
  // For the deep-teal surfaces: `text-primary` there is the background colour.
  'link-dark': 'gap-1.5 font-mono text-xs font-semibold text-amber-300 transition-all hover:gap-2.5',
};

/* ---------------------------------------------------------------- structure */

export function Section({
  id,
  tone = 'white',
  className = '',
  children,
}: {
  id?: string;
  tone?: SectionTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    // `scroll-mt-24` on ANY section carrying an id: the site header is sticky and
    // ~83px tall, so an in-page anchor would otherwise park its target under the
    // bar. 24 = 6rem = 96px, the same clearance every landing section uses.
    <section
      id={id}
      className={`w-full py-20 sm:py-24 ${SECTION_TONE[tone]} ${id ? 'scroll-mt-24' : ''} ${className}`}
    >
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  accent = 'primary',
  title,
  lede,
  tone = 'light',
  align = 'center',
}: {
  eyebrow?: string;
  accent?: Accent;
  title: string;
  lede?: string;
  tone?: 'light' | 'dark';
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      {eyebrow ? (
        <span
          className={`inline-block rounded-full border px-3 py-1 font-mono text-xs font-bold tracking-wider uppercase ${EYEBROW_TONE[tone][accent]}`}
        >
          {eyebrow}
        </span>
      ) : null}
      <h2
        className={`mt-3 mb-4 text-3xl font-bold tracking-tight sm:text-4xl ${
          tone === 'dark' ? 'text-white' : 'text-slate-900'
        }`}
      >
        {title}
      </h2>
      {lede ? (
        <p className={`text-base sm:text-lg ${tone === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
          {lede}
        </p>
      ) : null}
    </div>
  );
}

export function Card({
  tone = 'white',
  className = '',
  children,
}: {
  tone?: SectionTone;
  className?: string;
  children: ReactNode;
}) {
  return <div className={`${CARD_TONE[tone]} ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------------ actions */

export function ActionLink({
  href,
  variant = 'primary',
  icon,
  children,
}: {
  href: string;
  variant?: ActionVariant;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`inline-flex items-center no-underline ${CTA_TONE[variant]}`}>
      {children}
      {icon}
    </Link>
  );
}

/** The arrow every "go deeper" link in this section of the site uses. */
export function ArrowIcon() {
  return <ArrowRight aria-hidden="true" className="h-[15px] w-[15px]" />;
}

export function ActionRow({
  children,
  align = 'center',
}: {
  children: ReactNode;
  align?: 'center' | 'left';
}) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:flex-wrap ${
        align === 'center' ? 'sm:justify-center' : 'sm:justify-start'
      }`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ content */

export type JourneyStep = {
  number: string;
  title: string;
  body: string;
  /** Small print under the body — the mechanical detail, not the pitch. */
  detail?: string[];
};

/**
 * JourneyStepList — the numbered walkthrough used by /how-it-works.
 *
 * Numbers are strings, not indices, so the two journeys (customer and provider)
 * can be read side by side without the reader re-mapping them.
 */
export function JourneyStepList({
  steps,
  tone = 'light',
}: {
  steps: JourneyStep[];
  tone?: 'light' | 'dark';
}) {
  return (
    <ol className="grid gap-8">
      {steps.map((step) => (
        <li key={`${step.number}-${step.title}`} className="flex gap-4 sm:gap-5">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${
              tone === 'dark' ? 'bg-white/10 text-amber-300' : 'bg-primary text-white'
            }`}
          >
            {step.number}
          </span>
          <div className="min-w-0 flex-1">
            <h3
              className={`mb-2 text-lg font-bold ${tone === 'dark' ? 'text-white' : 'text-slate-900'}`}
            >
              {step.title}
            </h3>
            <p
              className={`text-sm leading-relaxed ${tone === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}
            >
              {step.body}
            </p>
            {step.detail?.length ? (
              <ul className="mt-3 grid gap-1.5">
                {step.detail.map((line) => (
                  <li
                    key={line}
                    className={`flex gap-2 text-xs leading-relaxed ${
                      tone === 'dark' ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    <span aria-hidden="true" className="text-secondary">
                      &ndash;
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Label/value rows — the platform's own facts, in the mono face it reserves. */
export function FactList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-2.5 font-mono text-xs">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-wrap justify-between gap-x-4 gap-y-1 rounded-lg border border-slate-100 bg-slate-50 p-3"
        >
          <dt className="text-slate-500">{item.label}</dt>
          <dd className="text-right font-bold text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Faq — disclosure list built on <details>/<summary>.
 *
 * No JavaScript and no state: the browser already gives keyboard support,
 * in-page search and "find in page" expansion for free, which a controlled
 * accordion would have to reimplement. `list-none` removes the default marker
 * (preflight is not imported here, so the marker would otherwise render
 * alongside the chevron).
 */
export function Faq({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className="mx-auto grid max-w-3xl gap-3">
      {items.map((item) => (
        <details
          key={item.question}
          className="group rounded-xl border border-slate-200 bg-white px-5 py-4 open:border-primary/30"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-bold text-slate-900">
            {item.question}
            <ChevronDown
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

/**
 * PreviewSection — the concise band that replaced the landing page's heavy
 * sections, each pointing at the route that now owns the detail.
 *
 * Asymmetric on purpose: the left column is the claim, the right column is the
 * three things a reader would otherwise have to click through to learn. It is
 * deliberately NOT a card grid — the full version of this content lives one link
 * away, and a preview that looks like the real thing just hides where to go.
 */
export function PreviewSection({
  id,
  tone = 'canvas',
  accent = 'primary',
  eyebrow,
  title,
  lede,
  points,
  href,
  linkLabel,
}: {
  id?: string;
  tone?: SectionTone;
  accent?: Accent;
  eyebrow: string;
  title: string;
  lede: string;
  points: { title: string; body: string }[];
  href: string;
  linkLabel: string;
}) {
  const dark = tone === 'primary';

  return (
    <Section id={id} tone={tone}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-16">
        <div>
          <SectionHeader
            eyebrow={eyebrow}
            accent={accent}
            title={title}
            lede={lede}
            tone={dark ? 'dark' : 'light'}
            align="left"
          />
          <div className="mt-6">
            <ActionLink
              href={href}
              variant={dark ? 'link-dark' : 'link'}
              icon={<ArrowIcon />}
            >
              {linkLabel}
            </ActionLink>
          </div>
        </div>

        <ul className="grid gap-4 sm:grid-cols-3">
          {points.map((point) => (
            <li
              key={point.title}
              className={
                dark
                  ? 'rounded-xl border border-white/10 bg-primary-dark p-5'
                  : 'rounded-xl border border-slate-200 bg-white p-5'
              }
            >
              <h3 className={`mb-1.5 text-sm font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>
                {point.title}
              </h3>
              <p
                className={`text-xs leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-600'}`}
              >
                {point.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- heroes */

/**
 * PageHero — the opening block for the dedicated marketing routes.
 *
 * Distinct from the landing hero on purpose: that one exists to capture a
 * description of the work (it owns the prompt bar), these exist to be read, so
 * there is no input and the h1 carries the whole job. Same deep teal, same
 * amber-for-action rule, and the same blurred glow as the closing CTA so the
 * three pages read as siblings rather than as orphans.
 */
export function PageHero({
  eyebrow,
  title,
  lede,
  note,
  actions,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  /** ReactNode, not string: these lines carry inline icons. */
  note?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <section className="relative w-full overflow-hidden bg-primary pt-14 pb-16 text-white sm:pt-20 sm:pb-20">
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[320px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary/15 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-[1000px] px-4 text-center sm:px-6 lg:px-8">
        <span className="inline-block rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 font-mono text-xs font-semibold tracking-wider text-amber-300 uppercase">
          {eyebrow}
        </span>

        <h1 className="mt-5 mb-5 text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-5xl">
          {title}
        </h1>

        <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
          {lede}
        </p>

        <div className="mt-9">{actions}</div>

        {note ? (
          <p className="mt-6 font-mono text-xs text-slate-400">{note}</p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * CtaBand — the closing call to action.
 *
 * Lifted out of the landing's ClosingCta so the three new routes can end the same
 * way without a fourth and fifth copy of the glow markup. `id` is optional and
 * only used by the landing, which keeps `#get-started` as an anchor target.
 */
export function CtaBand({
  id,
  eyebrow,
  title,
  lede,
  actions,
  note,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lede: string;
  actions: ReactNode;
  note?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`relative w-full overflow-hidden bg-primary py-20 text-white sm:py-24 ${id ? 'scroll-mt-24' : ''}`}
    >
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[350px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary/15 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-[1000px] px-4 text-center sm:px-6 lg:px-8">
        <span className="mb-6 inline-block rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 font-mono text-xs font-semibold tracking-wider text-amber-300 uppercase">
          {eyebrow}
        </span>

        <h2 className="mb-6 text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-5xl">
          {title}
        </h2>

        <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
          {lede}
        </p>

        {actions}

        {note ? (
          <p className="mx-auto mt-6 max-w-2xl font-mono text-xs leading-relaxed text-slate-400">
            {note}
          </p>
        ) : null}
      </div>
    </section>
  );
}
