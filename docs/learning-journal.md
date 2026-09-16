# Learning journal

Verified findings from working on this codebase. Everything here was measured
against the running app, not inferred from documentation — where a claim was
wrong the first time, that is noted too.

Last updated: 2026-09-16

---

## Toolchain

**Tailwind is v4.3.3 and configured CSS-first. There is no `tailwind.config.js`
and there cannot be one.** The equivalent of `theme.extend` is the `@theme`
block in `app/globals.css`. Creating a JS config file has no effect.

**Tailwind's preflight is deliberately NOT imported** (see the header comment in
`app/globals.css`). Two consequences that bite:

- `border` utilities need an explicit `border-solid` — there is no global reset
  making borders solid.
- There is **no global `a { color; text-decoration }` reset**. Every context
  styles its own links (`.site-header nav a`, `.breadcrumbs a`, `.secondary-link`).
  A bare `<a>` renders browser-default **blue and underlined**. Any new link
  class must set its own colour.

**Radii.** `--radius-sm/md/lg` were overridden to 10/16/22px. Removing those
overrides restores Tailwind's own 4/6/8px, which is what the Option A spec asks
for. Component rules that reference `var(--radius-*)` directly moved implicitly —
`.skeleton`, `.button-link` and form controls all changed size as a side effect.

---

## Tailwind gradients (both traps cost real time)

**`bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]` renders
NOTHING in v4.** It is a v3 recipe. In v4 the `from-*`/`via-*`/`to-*` utilities
build `--tw-gradient-stops` from a `var()` chain that includes
`var(--tw-gradient-position)`, which only a `bg-linear-*`/`bg-gradient-*`
utility sets. With an arbitrary radial-gradient there is no such utility, the
stops resolve empty, and the declaration becomes invalid at computed-value time.

- Symptom: `background-image: none`. It fails silently, not visibly.
- Fix: use v4's own `bg-radial-[at_top]`, which sets the position itself.

**`bg-gradient-to-t` IS supported.** It is a v4 alias for `bg-linear-to-t`, and
emits `--tw-gradient-position: to top in oklab`. An earlier note in this project
claimed it did not exist — that was wrong. It only looked absent because no
source file used it, and Tailwind generates nothing it cannot find.

> Generalised lesson: grepping the compiled CSS for a utility proves nothing
> when no source uses that utility. To test support, use the class first.

---

## Next.js App Router

**Route-level `loading.tsx` is unsafe above any page that redirects or calls
`notFound()`.** The boundary flushes its shell, which commits status 200, so a
later `redirect()` cannot send 307 and a later `notFound()` cannot send 404 —
you get soft-404s. Measured A/B on this repo:

| placement | `/zzzz/qqqq/rrrr/ssss` | `/work` |
|---|---|---|
| `app/loading.tsx` (root) | 200 (soft-404) | 200 (was 307) |
| `app/(app)/` + `app/(admin)/` | 404 | 200 (was 307) |
| none | 404 | 307 |

Every route group here has a redirect or a `notFound()` at or below it, so there
is no safe route-level placement. The correct pattern is an in-page `<Suspense>`
placed **after** the guard: the guard runs first so the status is correct, and
only the slow subtree streams.

**`notFound()` from a matched dynamic route emits a degenerate error document** —
`<html id="__next_error__">`, no `<main>`, with the not-found UI hydrating
client-side only. Reproduced with every boundary file removed, so it predates
them. Affects the discovery route and `/providers/[slug]`.

**`next/image` with remote hosts needs `images.remotePatterns` in
`next.config.ts`** or the optimiser throws at request time rather than degrading.
Separately: the optimiser intermittently 500s on a **cold** fetch (measured 1
failure in 12, on the first uncached request; subsequent requests were cached at
0.0s). Direct access to the CDN is fine, so it is the optimiser's remote fetch
timing out.

**`rm -rf .next` before `tsc` after moving route files.** `tsconfig.json` includes
`.next/types/**`, so a stale validator reports errors for files that moved.

**React 19 hydration and browser extensions.** Grammarly writes
`data-gr-ext-installed` and `data-new-gr-c-s-check-loaded` onto `<body>` between
the server HTML arriving and React hydrating. `suppressHydrationWarning` on
`<body>` is the documented remedy; it is scoped to that element's own attributes
one level deep, so genuine mismatches below it are still reported.

---

## Verification recipes

These are the ones that actually caught things — and the ones that produced
false results and wasted time.

**Strip `<script>` and `<style>` before grepping curl output.** The RSC flight
payload is inlined in `<script>` tags, so a naive grep finds page content that is
not rendered. Every route "contained" the 404 text and the loading skeleton until
scripts were stripped.

**Client error boundaries never render in SSR HTML.** `app/error.tsx` and
`app/global-error.tsx` are client components; a plain `curl` shows Next's
`__next_error__` shell and makes a working boundary look broken. Inspect the
hydrated DOM in a browser instead.

**Programmatic `element.focus()` inside `page.evaluate` does not trigger React's
delegated `onFocus`.** Use a trusted `page.click()` (with `{ force: true }` if the
element fails a stability check). This made a fully working search wizard look
completely dead across three probes.

**Dev CSS is not minified** — rules are written `.foo { … }` with a space before
the brace, and variant classes carry an escaped colon (`.hover\:bg-slate-200`).
Regexes that assume minification or drop the backslash report false absences.

**Check `img.naturalWidth > 0`** to prove remote images actually loaded, rather
than trusting `200` on the URL.

---

## Known state of the tree

**Three parallel brand palettes coexist and need consolidating:**
`--color-accent` (the live green `#23685d`), the Option A teal/ochre tokens, and
the landing-page `brand-dark`/`terracotta`/`sage`/`amber` set. Names collided —
`--accent`, `--success` and `--danger` already existed, so Option A's ochre is
exposed as `--color-accent-cta` and the status colours were left untouched.

**Currently unreferenced (committed deliberately so they are recoverable):**

- `components/marketing/HomeSections.tsx` — the superseded PRD 7.1 homepage.
- `components/landing/ExpandableBentoGrid.tsx` + `public/images/landing/*` — 7
  JPEGs (~496K) for a landing direction nothing imports.
- `features/requests/actions.ts` — moved verbatim from `app/actions/`, imported
  nowhere.

**Upstream defects for the repo owner:**

- The migration chain has a forward reference
  (`20260825063000_phase_1_payment_adapter_paystack_foundation.sql` creates tables
  referencing ones created later in `..._072000_...`), and `pgcrypto` is never
  declared despite `digest()` being used.
- The leaf route emits a trailing-slash canonical and breadcrumb hrefs
  (`/ng/abuja/`, `/plumbers/`), each costing a 308 redirect. Its breadcrumbs now
  resolve because the parent hubs exist, but the hop remains.
