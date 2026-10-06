import Link from 'next/link';
import { ArrowRight, BadgeCheck, CircleCheck, Lock, ShieldCheck } from '@/components/ui/icons';
import { ActionLink, Section, SectionHeader } from '@/components/marketing/PageSections';

/**
 * RoutePreviews — the three landing bands, rebuilt as bento grids.
 *
 * WHAT CHANGED, AND WHY IT IS NOT ONLY A LAYOUT CHANGE
 *
 * These were three flat `PreviewSection` bands: a claim on the left, three or four identical white text cards
 * on the right. They are now bento grids with embedded UI fragments where a fragment earns its height — a
 * funds-held status bar, a structured verification list and an itemized quote — so each claim is shown as well
 * as stated.
 *
 * SECTION 1 IS ON ITS THIRD PASS, AND EACH PASS LEARNED FROM THE LAST. It first carried a scope composer and a
 * two-provider quote comparison; both were removed when they made the left column shorter than the right; and
 * step 01 then gained a single bordered EXAMPLE REQUEST, because three lines of copy in a card stretched to match
 * a taller column is a card with a hole in it. The rule that came out of the three passes: an illustration earns
 * its place when it is what makes the card the height it is, and it belongs in the card that would otherwise be
 * empty. Step 02 still has none — it is the short card in the tall column, and that is the right shape for it.
 *
 * 1. THREE CLAIMS IN THE BRIEF COULD NOT BE PUBLISHED, and the substitutions are the interesting part of this
 *    file. They are recorded here rather than silently smoothed over, because the next person to read this
 *    against the brief will otherwise "restore" them:
 *
 *      "ESCROW" → "HELD BY THE PAYMENT PROVIDER". The brief asked for a "Neutral Milestone Escrow Protocol"
 *      and an "FDIC-Insured Custodial Escrow Depository". This platform's published position, in
 *      app/(marketing)/trust-and-safety/page.tsx, features/legal/policies.ts and the help centre, is the exact
 *      opposite: the money is held by the payment provider and NOT by 101GlobalWork, an escrow arrangement
 *      carries legal duties the platform does not claim, and the trust page says in as many words that it will
 *      not call it that. Publishing "escrow" here would have contradicted four other surfaces at once. FDIC is
 *      also United States deposit insurance: this platform's market is NG, priced in NGN, and it has no
 *      depository at all.
 *
 *      "ZERO ADVANCE CAPITAL EXPOSURE" → the true sequence. Paid work cannot start until the payment is funded
 *      (supabase/migrations/20260830003500_require_funding_before_paid_work_execution.sql), so the money IS paid
 *      in advance; what protects the customer is that it is held and released on their approval. The checklist
 *      now says that instead.
 *
 *      "$5,000,000 MINIMUM" / "DAILY AUTOMATED AUDITS" / "98.4% TOP TIER" → the checks that actually exist.
 *      Nothing in this repository holds a bond figure, an audit cadence or a reliability score, and the trust
 *      page states the opposite of the second one: a check confirms what a provider submitted at a point in
 *      time and is not a warranty. The structured list keeps its shape — three grey rows with monospace values —
 *      and carries identity, licence and insurance instead.
 *
 * 2. THE CURRENCY IS NGN. The brief's mock quote was in dollars ($450 + $120 = $570). The platform's seeded
 *    market is NG and every amount elsewhere in the product is NGN, so an example price on the landing page in
 *    dollars would be the first thing on the page that is wrong about the market.
 *
 * 3. THE DARK CARDS USE THE PALETTE, NOT A NEW HEX. The brief specified `#0D282E`. The design reference uses
 *    `#0B2B2F` — five times, including on its own bento cards — and that is exactly `--color-primary-dark`, so
 *    the dark anchors are `bg-primary-dark`. A second near-identical teal is how a palette starts drifting.
 *
 * WHAT DID NOT CHANGE: the section ids (`how-it-works`, `trust`, `pricing`) are anchor targets in the header and
 * footer, each band still ends in one link to its detail route, and the whole file is server-rendered with no
 * client JavaScript — the landing page's constraint from the PRD is that it has to read on a bad connection.
 *
 * The sections also share ONE background now (`canvas`, the platform's #f3f4f6 neutral). Trust used to be white,
 * which broke the page into stripes; the brief asks for a uniform canvas with the contrast coming from the cards
 * inside the grid rather than from the band behind it.
 *
 * THE MOCK FRAGMENTS ARE LABELLED. Every embedded UI example carries an "Example" marker and generic
 * participants ("Provider A", monogram circles) rather than invented business names or stock faces — a
 * comparison that looks like two real companies quoting real money is a fabricated endorsement, and this
 * repository has removed that kind of proof once already.
 */

/** `[ 01 / STEP ]` — monospace, because it is metadata rather than prose. */
function StepBadge({ step, tone = 'light' }: { step: string; tone?: 'light' | 'dark' }) {
  return (
    <span
      className={`mb-6 inline-flex w-fit items-center rounded-full px-3 py-1 font-mono text-xs font-bold tracking-wider uppercase ${
        tone === 'dark'
          ? 'border border-emerald-800/50 bg-emerald-950/80 text-emerald-400'
          : 'bg-emerald-50 text-emerald-700'
      }`}
    >
      [ {step} / step ]
    </span>
  );
}

/**
 * SECTION 1 — the workflow bento.
 *
 * Asymmetrical on purpose: step 01 gets the tall left column because it is the step the customer performs, and
 * step 03 gets the dark card because it is the one that carries the promise about money.
 */
export function HowItWorksPreview() {
  return (
    <Section id="how-it-works" tone="canvas">
      <SectionHeader
        eyebrow="How it works"
        accent="primary"
        title="From a description to finished work"
        lede="The same three beats on every job, from a leaking tap to a multi-stage fit-out — and the same eight states a request moves through behind them."
        align="left"
      />

      {/* `items-stretch` is the height contract. A grid row is as tall as its tallest item, so the left card and
          the right column finish on the same line whatever the copy does — and each side then has to spend that
          height deliberately rather than leaving a void:
            · the left card is `justify-between`, which pins its content to the top and its anchor pill to the
              bottom, so the extra space reads as breathing room instead of a missing paragraph;
            · the right column is also `justify-between`, which spaces its two cards apart rather than stretching
              either one — an over-tall card with its text stranded at the top is the same problem moved inside. */}
      <div className="mt-10 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* ── 01 — the customer's step ─────────────────────────────────────────────────────── */}
        <article className="flex h-full flex-col items-stretch justify-between rounded-2xl border border-slate-200 bg-white p-8">
          <div>
            <StepBadge step="01" />
            <h3 className="mb-4 text-2xl font-bold tracking-tight text-slate-900">Describe it</h3>
            <p className="leading-relaxed text-slate-600">
              Write what needs doing in your own words. That description becomes the scope both sides work from.
            </p>

            {/* THE EXAMPLE REQUEST.
                It is an OBJECT rather than more prose — a dark surface, an emerald frame and mono metadata around
                a quoted paragraph — so the eye reads it as "here is what a description looks like" and not as a
                fourth sentence of explanation.
                ⚠️ `m-0` IS NOT TIDINESS, IT IS THE FIX FOR THE WIDTH. This project deliberately does not import
                Tailwind's preflight, and its own reset is only `*{box-sizing:border-box}` — so the browser's
                default `figure { margin: 1em 40px }` was live on this element, and `blockquote`'s identical
                default was live inside it. The box rendered 80px narrower than the card and the quote text another
                80px narrower than the box, which is what "fix the width" was looking at. `w-full` cannot beat a
                UA margin: the margin comes off the width the block is offered, before `width:100%` is resolved. */}
            <figure className="m-0 mt-6 w-full rounded-xl border border-emerald-900/40 bg-primary-dark p-5 text-white shadow-inner">
              <figcaption className="mb-3 block font-mono text-xs font-bold tracking-wide text-emerald-400 uppercase">
                [ example request ]
              </figcaption>
              <blockquote className="m-0 font-sans text-sm leading-relaxed text-slate-200">
                &ldquo;The kitchen sink has been draining slowly for about a week, and now the base unit underneath
                is damp. Two-bedroom flat on the second floor, no lift.&rdquo;
              </blockquote>
              <p className="mt-3 border-t border-emerald-900/60 pt-3 font-mono text-[10px] tracking-wider text-emerald-500/80 uppercase">
                example only · what providers quote against
              </p>
            </figure>
          </div>

          {/* The visual anchor. A card this tall needs something at its foot, or the space reads as unfinished —
              and this says the one thing the step is really about: the description, not the price, is what
              everything downstream is matched against. */}
          <div className="border-t border-slate-100 pt-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-secondary" />
              scope-first matching engine
            </span>
          </div>
        </article>

        {/* ── 02 and 03 — the provider's side, stacked ─────────────────────────────────────── */}
        <div className="flex h-full flex-col justify-between gap-6">
          <article className="rounded-2xl border border-slate-200 bg-white p-8">
            <StepBadge step="02" />
            <h3 className="mb-3 text-xl font-bold tracking-tight text-slate-900">Compare quotes</h3>
            <p className="leading-relaxed text-slate-600">
              Verified providers quote against that same scope, itemized, so the numbers are answering the same
              question.
            </p>
          </article>

          <article className="rounded-2xl bg-primary-dark p-8 text-white shadow-sm">
            <StepBadge step="03" tone="dark" />
            <h3 className="mb-3 text-xl font-bold tracking-tight text-white">Approve, then pay</h3>
            <p className="mb-6 leading-relaxed text-slate-300">
              Payment is held and released against your approval, with a window to raise a problem first.
            </p>

            <div className="flex items-center gap-2 rounded-xl border border-emerald-800/40 bg-emerald-950/60 p-3 font-mono text-xs text-emerald-400">
              <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="font-bold tracking-wider uppercase">[ held by the payment provider ]</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Released once, on your completion approval — not passed to the provider up front, and not held by
              101GlobalWork.
            </p>
          </article>
        </div>
      </div>

      {/* The link carries its own styling rather than the shared `ActionLink`, because the brief asked for a
          treatment nothing else on the page uses: mono, underlined, and a press nudge. `active:translate-x-1`
          moves it a quarter of a rem and `active:scale-[0.98]` presses it slightly, which on an inline-flex
          anchor is the difference between a link that acknowledges the click and one that does not.
          Both transforms are Tailwind v4 properties (`translate` and `scale`) rather than `transform`, and both
          are registered by the utilities layer — this project has been bitten before by an unregistered `--tw-*`
          variable silently dropping a whole declaration, so it is worth knowing they are present. */}
      <div className="mt-8 flex justify-start">
        <Link
          href="/how-it-works"
          className="inline-flex items-center gap-2 font-mono text-xs font-semibold text-slate-800 underline decoration-slate-400 underline-offset-4 transition-all duration-150 ease-in-out hover:text-slate-950 hover:decoration-slate-900 active:translate-x-1 active:scale-[0.98]"
        >
          Learn more about how it works
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Section>
  );
}

/**
 * SECTION 2 — the trust bento.
 *
 * The dark card is the anchor and it carries the money position, because that is the claim people arrive
 * sceptical about. The light card beside it carries the verification facts, which are deliberately duller than
 * the brief's version of them: what the platform checks, and the sentence saying a check is not cover.
 */
export function TrustPreview() {
  return (
    <Section id="trust" tone="canvas">
      <SectionHeader
        eyebrow="No upfront risk"
        accent="emerald"
        title="You pay when the work is approved"
        lede="No deposit into a stranger’s account, and no guessing what “done” means. Here is what is checked, what is held, and what none of it covers."
        align="left"
      />

      <div className="mt-10 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* ── the dark anchor: where the money is, and when it moves ────────────────────── */}
        <article className="relative h-full overflow-hidden rounded-2xl bg-primary-dark p-8 text-white">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-16 h-60 w-60 rounded-full bg-emerald-400/10 blur-3xl"
          />
          {/* TWO GROUPS, PUSHED APART. The heading and its three claims belong together at the top; the custody
              statement is the footnote to the whole section, so it belongs on the floor of the card rather than
              trailing the list. `justify-between` is what puts it there — and the grouping is why it works: five
              direct children under `justify-between` would spread every one of them apart instead of pushing this
              single block down, which is the mistake the right-hand card would make if its content were not
              grouped the same way. */}
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
                  <Lock aria-hidden="true" className="h-4 w-4" />
                </span>
                <h3 className="text-lg font-bold tracking-tight text-white">
                  The money is held, and released on your approval
                </h3>
              </div>

              <ul className="mt-5 grid gap-3">
                {[
                  'Your payment is held, not passed into the provider’s account',
                  'Nothing is released until you approve the finished work',
                  'A problem raised first can still change the outcome',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-slate-200">
                    <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 border-t border-slate-700/60 pt-6">
              <p className="mb-2 font-mono text-xs font-bold tracking-wider text-amber-400 uppercase">
                Held by the payment provider — not by 101GlobalWork
              </p>
              <p className="text-xs leading-relaxed text-slate-400">
                The platform is not the holder, and does not call this escrow: that would claim legal duties it
                does not carry. A hold protects the payment — not the property the work happens on.
              </p>
            </div>
          </div>
        </article>

        {/* ── the light card: what is actually checked ─────────────────────────────────── */}
        <article className="h-full rounded-2xl border border-slate-200 bg-white p-8">
          {/* The same two-group shape, so both cards finish on the same line. The content keeps its existing
              order and spacing untouched — only the link is grouped off, because it is the one thing that
              belongs at the card's foot and `justify-between` needs exactly two children to mean anything. */}
          <div className="flex h-full flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <BadgeCheck aria-hidden="true" className="h-4 w-4" />
                </span>
                <h3 className="text-lg font-bold tracking-tight text-slate-900">Providers are checked, not guaranteed</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Three things are looked at before a provider can quote, and re-checked as their details change.
              </p>

              <ul className="mt-5 grid gap-2">
                {[
                  { label: 'Identity', value: 'Checked before quoting', badge: false },
                  { label: 'Trade licence', value: 'Where the trade needs one', badge: true },
                  { label: 'Insurance', value: 'Where it applies', badge: false },
                ].map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 p-3"
                  >
                    <span className="text-xs font-semibold text-slate-700">{row.label}</span>
                    <span
                      className={`font-mono text-[11px] font-bold tracking-wide uppercase ${
                        row.badge
                          ? 'rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-600'
                          : 'text-slate-800'
                      }`}
                    >
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p className="text-[11px] leading-relaxed text-slate-600">
                  A check confirms what a provider submitted at a point in time. It is not insurance, it is not a
                  warranty of the work, and it is not cover for damage.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <ActionLink href="/trust-and-safety" variant="link">
                Read the trust &amp; safety detail
              </ActionLink>
            </div>
          </div>
        </article>
      </div>

    </Section>
  );
}

/**
 * SECTION 3 — the pricing bento, as a symmetrical 2×2.
 *
 * The brief called the old shape "3+1" and it was: three points in a row and a fourth wrapping awkwardly
 * underneath. Four tiles in two columns weight the four statements equally, which is right — none of them is
 * the important one, and the honest headline on this page is the absence of a fee schedule rather than a
 * number.
 *
 * Tile 1 is the dark anchor because the grid would otherwise be four white cards, and "posting is free" is the
 * one tile that is a promise rather than a caveat.
 *
 * ROW 1 CARRIES THE HEIGHT AND ROW 2 DOES NOT INHERIT IT. Tiles 1 and 2 stay `flex h-full flex-col
 * justify-between` with two children each — the claim at the top, the evidence at the foot — so the first row is
 * one clean line. Tiles 3 and 4 are shorter statements, so they are `h-auto self-start`: the grid's default
 * `align-items: stretch` (which `h-auto` does not opt out of) would otherwise pull them to the row's full height,
 * and `self-start` is what lets each card hug its copy instead of ending in empty space. The one link that used
 * to sit inside tile 3 now sits on the section canvas below the grid, because it belongs to the section rather
 * than to one of the four claims.
 *
 * ⚠️ THE ITEMIZED QUOTE IS AN ILLUSTRATION, AND ITS FIGURES ARE MADE UP. The floating "[ EXAMPLE ]" chip was
 * removed on request — it was clutter beside the title — but four invented amounts in amber next to a total was
 * the one thing on this page that could be read as the platform's own prices, so the disclosure moved inside the
 * block: one muted line at the foot, in the same container as the numbers it qualifies. Delete that line and the
 * block reads as a real quote.
 */
export function PricingPreview() {
  return (
    <Section id="pricing" tone="canvas">
      <SectionHeader
        eyebrow="Pricing & fees"
        accent="amber"
        title="What it costs, and what it does not"
        lede="Two numbers decide a job: the provider’s quote, which the provider sets, and the platform’s own fee — which is published with its effective date or not quoted at all."
        align="left"
      />

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── 1 — the promise ──────────────────────────────────────────────────────────── */}
        <article className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-primary-dark p-8 text-white">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-secondary/15 blur-3xl"
          />
          <div className="relative">
            <h3 className="mb-3 text-2xl font-bold tracking-tight text-white">Posting is free</h3>
            <p className="leading-relaxed text-slate-300">
              Browsing, searching and posting a request cost nothing. Providers are not charged to be listed or to
              quote.
            </p>
          </div>

          {/* The number and the badge share one baseline at the foot of the card. `mt-auto` does the pushing and
              `justify-between` on the card would too — both are here because either one alone decides the layout. */}
          <div className="relative mt-auto flex w-full items-center justify-between gap-4 border-t border-slate-800/80 pt-8">
            <span className="font-mono text-3xl font-extrabold tracking-tight text-white">₦0</span>
            <span className="rounded-lg border border-amber-800/50 bg-amber-950/50 px-3 py-1.5 font-mono text-sm font-bold text-amber-400">
              [ 100% FREE ]
            </span>
          </div>
        </article>

        {/* ── 2 — what a quote is made of ──────────────────────────────────────────────── */}
        <article className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-8">
          <div>
            <h3 className="mb-2 text-xl font-bold tracking-tight text-slate-900">The quote is the price</h3>
            <p className="mb-6 text-sm leading-relaxed text-slate-600">
              Providers price their own work. Itemized quotes are what make two of them comparable.
            </p>
          </div>

          {/* ⚠️ THE FIGURES IN HERE ARE INVENTED, AND THE ONE LINE AT THE FOOT OF THE BLOCK SAYS SO. The brief
              asked for the floating "EXAMPLE" chip to be removed, which is right — it was clutter beside the
              title — but removing it entirely would have left four made-up amounts reading as the platform's
              own prices, in amber, next to a total. The disclosure moved inside the block instead: quieter, at
              10px in slate-500, and inside the same container as the numbers it qualifies. */}
          <div className="rounded-xl border border-slate-800 bg-primary-dark p-4 font-mono text-xs text-white">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400">Base labour</span>
              <span className="text-slate-300">₦450,000</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span className="text-slate-400">Materials</span>
              <span className="text-slate-300">₦120,000</span>
            </div>
            <div className="my-2.5 border-t border-slate-700/70" />
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold tracking-wider text-emerald-400 uppercase">Total agreed quote</span>
              <span className="text-base font-extrabold text-amber-400">₦570,000</span>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
              illustrative figures — not a quote from anyone
            </p>
          </div>
        </article>

        {/* ── 3 — the honest headline ──────────────────────────────────────────────────── */}
        <article className="h-auto self-start rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
          <h3 className="mb-2 text-xl font-bold text-slate-900">Fees are published or absent</h3>
          <p className="mb-4 text-sm leading-relaxed text-slate-600">
            No fee schedule is in force today, so no fee figure is quoted anywhere on this site. There is a page
            that says so in full.
          </p>
          <p className="w-fit rounded-lg border border-emerald-200/60 bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-700">
            STATUS: PUBLIC &amp; VERIFIABLE — NO SCHEDULE IN FORCE
          </p>
        </article>

        {/* ── 4 — the caveat that stops the page lying ─────────────────────────────────── */}
        <article className="h-auto self-start rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
          <h3 className="mb-2 text-xl font-bold text-slate-900">Taxes and FX are not ours</h3>
          <p className="mb-4 text-sm leading-relaxed text-slate-600">
            Tax follows the provider’s jurisdiction and FX is handled by the payment provider, so both are stated
            as caveats instead of being buried in a total.
          </p>
          <p className="w-fit rounded-lg bg-[#0D282E] px-3 py-2 font-mono text-xs text-slate-300">
            jurisdiction::provider_local
          </p>
        </article>
      </div>

      {/* The pricing link belongs to the section, not to one tile. It sits on the canvas below the grid so the
          card heights above stay content-driven, and the arrow nudges forward on hover while the link lifts a
          hair — the same "acknowledge the pointer" treatment the how-it-works link uses. */}
      <div className="mt-6 flex justify-start">
        <Link
          href="/pricing"
          className="group inline-flex items-center gap-2 font-mono text-xs font-semibold text-slate-800 underline underline-offset-4 decoration-slate-400 transition-colors duration-200 hover:-translate-y-0.5 hover:text-slate-950 hover:decoration-slate-900"
        >
          See pricing &amp; fees
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-200 ease-in-out group-hover:translate-x-1"
          />
        </Link>
      </div>

    </Section>
  );
}
