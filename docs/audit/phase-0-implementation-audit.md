# Phase 0 — Implementation Audit: 101GlobalWork

**Branch:** `audit/UI-Improvement` · **Commit date:** 2026-09-14 · **Scan scope:** `app/**`, `lib/**`, `supabase/migrations/**` (54 migrations), `supabase/tests/**` (5 SQL suites), `proxy.ts`, `next.config.ts`

> **Scope caveat:** the PRD itself is not present in this repository (`docs/` contains only `deployment-checkpoint.md`, a one-paragraph deploy note). The PRD expectations used for gap analysis are the route namespaces and rules stated in the audit brief. All findings below are verified against source; anything inferred is labelled **[inferred]**.

---

## 1. Audit Summary

**Route surfaces detected in codebase: 41** (36 pages · 3 route handlers · 2 metadata routes · 2 layouts)

| Status | Count | Routes |
| :--- | ---: | :--- |
| `Implemented` | **23** | `/`, `/providers`, `/providers/[slug]`, `/sign-in`, `/sign-up`, `/forgot-password`, `/account/update-password`, `/account/activate-admin-access`, `/work`, `/requests/[id]`, `/requests/[id]/matches`, `/provider`, `/provider/onboarding`, `/provider/assignments/[id]`, `/admin`, `/admin/access`, `/admin/money/[id]`, `/admin/users/[id]`, `/admin/invitations/accept`, `/auth/callback`, `/api/payments/paystack/checkout`, `/api/payments/paystack/webhook`, `/sitemap.xml` |
| `Partial` | **12** | `/services`, `/search`, `/[country]/[city]/[locality]/[service]`, `/account/security`, `/requests/new`, `/provider/requests/[id]/quote`, `/provider/payouts`, `/admin/audit`, `/admin/money`, `/admin/operations`, `/admin/work`, `/robots.txt` |
| `Incorrect` | **2** | `/provider/search-readiness`, `/admin/discovery` |
| `Unsafe` | **2** | `/payments/paystack/return`, `/admin-bootstrap` |
| `Legacy` | **1** | `/admin-invite/accept` |
| `Needs Migration` | **1** | `/admin/verifications` |
| `Missing` | **0 detected / 8 absent** | PRD-expected routes not present — see §4 |
| `Future Phase` **[inferred]** | **5** | messaging, reviews/ratings, provider payout history, customer profile, admin taxonomy write-back |

**Status distribution:** 56% Implemented · 29% Partial · 15% flagged (Incorrect/Unsafe/Legacy/Needs Migration)

**Headline read:** the *backend* is the strongest part of this codebase — 54 migrations with command-RPC discipline, RLS-first reads, SQL e2e suites, and **zero optimistic UI on money paths**. The *frontend shell* is the weakest: no route groups, no error/loading boundaries anywhere, and a root-layout auth call that makes every public page uncacheable. The architecture is not broken; the **rendering and state layer is unfinished**.

---

## 2. Detailed Route Inventory

| Route / Path | Workspace | Current Status | Key Missing Features / UI States | Architectural & Security Flags |
| :--- | :--- | :--- | :--- | :--- |
| `/` | Public — marketing | `Implemented` | No loading state needed (fully static). | CTA `/search` hands off to a route that performs no search. `AuthNav` in root layout forces dynamic render. |
| `/services` | Public — discovery | `Partial` | Static stub — no catalog query, no service list, no empty/error state. | Reachable from primary nav as **"Find services"**; dead-end. `robots: index:false` but `follow:true`. |
| `/search` | Public — discovery | `Partial` | No search execution, no results, no skeletons, no "0 results" state. Echoes `q`/`location` only. | `?q=`/`?location=` reflected verbatim into `<h1>`/`<p>`; `service` param silently dropped. Form only posts to auth-gated `/requests/new`. |
| `/providers` | Public — marketing | `Implemented` | — | Namespace collision: `/providers` (marketing) vs `/provider` (workspace) differ by one character. |
| `/providers/[slug]` | Public — discovery | `Implemented` | No availability/booking state. | `robots.index` driven by `readiness_score >= 60` in `generateMetadata`; throws unhandled on RPC failure → 500. |
| `/[country]/[city]/[locality]/[service]` | Public — discovery (SEO) | `Partial` | No loading/streaming, no empty state, no 404 UI (default only), no caching. | **Breadcrumbs link to `/${country}/` and `/${country}/${city}/` which do not exist → 404s.** Hardcoded "Describe the **plumbing** problem" copy renders for *any* `[service]`. Throws → 500 without an error boundary. Fully dynamic SSR, zero ISR. LD+JSON escaping is correct (`\u003c`). |
| `/sign-in` | Auth | `Implemented` | No pending/submitting state on form. | `?error=` reflected into `role="alert"` (UI-spoofing surface). Open-redirect guard present and correct. |
| `/sign-up` | Auth | `Implemented` | No pending state; `check_email` branch uncovered by form-level feedback. | Intent switching via query params is coherent. `?error=` reflected. |
| `/forgot-password` | Auth | `Implemented` | — | Enumeration-safe messaging (good). |
| `/account/update-password` | Auth | `Implemented` | No strength meter/pending state. | Min length 10 enforced client + server. |
| `/account/security` | Auth / Account | `Partial` | No factor list, rename, revoke/disable, or recovery-code states. Loading state is a plain text string, not a skeleton. | `safeNext()` **defaults to `/admin`** — a non-admin customer lands in an admin redirect path. Only true client-side component in app (`mfa-client.tsx`) — justified for MFA. |
| `/account/activate-admin-access` | Auth / Admin | `Implemented` | — | Two-step (password → role activation) with partial-failure recovery message. Good. |
| `/work` | Customer | `Implemented` | No loading skeleton; relies on async server render. Empty state present (`empty-admin`). | Best-in-class state modelling (`nextAction()` maps 6 states). `robots: index:false, follow:false`. |
| `/requests/new` | Customer | `Partial` | Market/Service/Location are three independent unfiltered selects — no market→service derivation, no pending state, no location autodetect. Draft lost on auth redirect. | `?error=` reflected from URL into `role="alert"` — and `createRequestAction` **passes raw `error.message`** from Postgres into that param → internal DB error leakage + text injection. |
| `/requests/[id]` | Customer | `Implemented` | No pending state on Accept Quote / Approve Completion buttons. | Strongest route: payment gating, attempt history, `canStartPayment` guard, explicit "browser return never marks paid" copy. UUIDs appear only in hidden inputs. |
| `/requests/[id]/matches` | Customer | `Implemented` | Empty state present and well-worded. No loading skeleton. | Correctly excludes self-owned providers; eligibility before ranking. |
| `/provider` | Provider | `Implemented` | No loading skeleton. | Good publish-gate modelling (4 checks + blocker string). |
| `/provider/onboarding` | Provider | `Implemented` | No step persistence/autosave; long single page, no wizard state. | `?provider=<uuid>` in URL. Ownership validated server-side. Capability/authority hardened in `20260830002000`. |
| `/provider/requests/[id]/quote` | Provider | `Partial` | No eligibility-denied UI (falls through to `notFound()`); `sent=1` permanently hides the form with no "quote revisions" affordance. No pending state. | `?provider=<uuid>` in URL bar/history/referrer. `get_provider_quote_opportunity` correctly re-validates ownership + eligibility server-side (good). |
| `/provider/assignments/[id]` | Provider | `Implemented` | No pending states; no evidence upload (link/note only; `storage_object_path` passed as `null`). | Payment-gated start (`canStart`) derived from authoritative obligation state. Correct. |
| `/provider/payouts` | Provider | `Partial` | No set-default / remove / re-verify flows; no empty-vs-error distinction (a bank-list failure renders the same as "unavailable"). | Currency **hardcoded `NGN`** and banks **hardcoded `'nigeria'`** in an otherwise multi-market platform. Uses service-role client after ownership check (acceptable, but a hand-rolled path bypassing `*_command` RPC convention). Errors scrubbed via `safeMessage`. |
| `/provider/search-readiness` | Provider | `Incorrect` | Sign-in-required branch is inline, not a redirect; no skeleton. | **`supabase.from('providers').select(...).limit(1)` fetches an arbitrary provider, not the caller's selected one.** Multi-provider accounts see the wrong readiness score and wrong `reasons` list. Also `readiness.replace('_',' ')` replaces only the first underscore. |
| `/payments/paystack/return` | Payments | `Unsafe` | No polling/auto-refresh while status is unsettled — user must manually refresh. | **Renders raw internal identifier: `Payment attempt reference: {attempt ?? 'pending'}`** — a `payment_attempts` UUID in a customer-facing standard view. Violates the "no raw UUIDs in standard views" rule. `returnTo` sanitization is correct. |
| `/api/payments/paystack/checkout` | Payments | `Implemented` | — | Validates UUID, auth, obligation state, reuses `pending_provider` sessions, deterministic idempotency key, 303 vs JSON dual response. Excellent. |
| `/api/payments/paystack/webhook` | Payments | `Implemented` | — | Signature verified before parse, SHA-256 payload hash, provider-event ID dedupe, disputes/transfers/refunds branched. `runtime = 'nodejs'`. Excellent. |
| `/admin` (+ `layout`) | Admin | `Implemented` | No loading skeleton; bootstrap-secret warning surface present. | Capability-driven nav from `admin_context_command`. Missing-capability → **silent `redirect('/')`** with no "authorization denied" state. |
| `/admin/access` | Admin | `Implemented` | No pending state outside `PendingSubmitButton`. | Temporary-credential flash stored in `httpOnly`/`secure`/`sameSite=strict` cookie scoped to `path=/admin/access`, 5-min TTL. Strong. `?error=` reflected. |
| `/admin/verifications` | Admin | `Needs Migration` | No pending/skeleton. | **Only admin route using marketing `.content-shell` inside the admin frame** — visual/structural outlier vs every other admin page's `.admin-page`. Needs migration to shared admin primitives. Has a genuine inline authorization-denied state (unique — should be the pattern everywhere). |
| `/admin/work` | Admin | `Partial` | Read-only: no intervention actions despite copy promising "Use intervention only when necessary". Only latest 12 rows, no pagination/filter/search. | Minified single-line source (no formatting discipline). Query errors silently become `0`. |
| `/admin/money` | Admin | `Partial` | Read-only summary list; drill-down only. No payment-status filter. | Query errors silently become `0`. Minified one-liner source. |
| `/admin/money/[id]` | Admin | `Implemented` | No pending state on refund/payout buttons. | Best audit surface: ledger balance check (`IMBALANCE` surfaced), refund reconciliation, payout revalidation-before-submission, dispute → payout interlock. Raw UUIDs in paths/details — admin-scoped, acceptable. |
| `/admin/discovery` | Admin | `Incorrect` | No error state, no taxonomy write-back, only latest 12 routes. | **Capability/policy mismatch:** nav shows the link for `platform.seo` **or** `platform.taxonomy`, but data requires `platform.seo.read` (policy `admin_seo_read_routes`) and `platform.taxonomy.read`. `public_routes` additionally has an explicit deny-all policy for `anon, authenticated`. Any error is swallowed → operator sees **"0 indexable routes"** instead of "access denied". |
| `/admin/operations` | Admin | `Partial` | No retry/replay/publish-now action for stuck outbox events. | Excellent honesty: detects "zero delivery attempts, no error" and warns the publisher is not operational. |
| `/admin/audit` | Admin | `Partial` | No date/actor/action filters, no pagination, hard cap 100. | Raw `resource_id` shown — behind a `<details>` disclosure, admin-only. Acceptable-by-design. |
| `/admin/users/[id]` | Admin | `Implemented` | No skeleton. | Canonical IDs disclosed only inside `<details>`. Correct separation of marketplace identity vs platform authority. |
| `/admin-bootstrap` | Admin (setup) | `Unsafe` | No post-setup teardown state. | **A live production route that grants Platform Owner to any authenticated holder of `PLATFORM_OWNER_BOOTSTRAP_TOKEN`.** `timingSafeEqual` is used correctly, but the route must be environment-gated or deleted after bootstrap. |
| `/admin-invite/accept` | Admin | `Legacy` | — | **Duplicate of `/admin/invitations/accept`** with byte-identical logic and its own action file. Two live invite URLs; removing either silently breaks outstanding invitation emails. Consolidate. |
| `/admin/invitations/accept` | Admin | `Implemented` | — | Canonical path. Should be the survivor of the consolidation. |
| `/auth/callback` | Auth | `Implemented` | No error UI beyond a query-param redirect. | Handles both `code` and `token_hash`+`type`; `safeNext` guards `//` and `\`. Correct. |
| `/robots.txt` | System | `Partial` | — | Disallows `/search`, `/account`, `/work`, `/api` — but **not** `/requests`, `/provider`, `/admin`, `/payments`. Those rely solely on per-page `noindex` metadata; a single missing export (see `/provider/search-readiness`, which has none) leaks a route to crawlers. |
| `/sitemap.xml` | System | `Implemented` | — | Safe-fallback to homepage-only on error; only emits verified `indexable` entries. `lastModified: new Date()` on the homepage makes the sitemap non-deterministic per request. |

---

## 3. Critical Red Flags

Ordered by severity. Items 1–5 must be resolved before feature development continues.

### 🔴 Blocker

1. **No error boundary, loading UI, or 404 page exists anywhere in the application.** Verified: zero `error.tsx`, `global-error.tsx`, `loading.tsx`, `not-found.tsx`, `template.tsx`. CSS contains **0** occurrences of `skeleton|shimmer|aria-busy` styling. Combined with `lib/discovery/public-page.ts` and `lib/providers/public-profile.ts` which **`throw new Error()`** on any Supabase failure, a single transient DB error on a public SEO route yields a bare 500 with no recovery path for a first-time visitor. *Fix: add root `error.tsx` + `not-found.tsx`, per-workspace `loading.tsx`, and convert the two throwing readers to return `null`.*

2. **The root layout's `AuthNav` makes the entire site uncacheable.** `app/layout.tsx` renders an async server component that awaits `cookies()` and performs **three** round-trips (`getUser()`, `accounts` select, `providers` count) on *every* request — including `/[country]/[city]/[locality]/[service]`, `/providers/[slug]`, and `/`. There is no `revalidate`, `unstable_cache`, `generateStaticParams`, or `dynamic` export anywhere in `app/`. Every anonymous crawler request therefore costs a dynamic render plus ≥1 DB query, and no public page can ever be statically served. This directly undermines the stated discovery/SEO objective. *Fix: move `AuthNav` into a `Suspense` boundary fed by a non-`cookies()` shell, or move it out of the root layout into route groups.*

3. **Public discovery breadcrumbs emit guaranteed 404s.** `app/[country]/[city]/[locality]/[service]/page.tsx` links to `/${country}/` and `/${country}/${city}/`, but no `app/[country]/page.tsx` or `app/[country]/[city]/page.tsx` exists. This is the primary internal-link structure of the SEO funnel. *Fix: create the country and city hub routes, or drop the breadcrumb anchors until they exist.*

4. **`/admin-bootstrap` is live and grants Platform Owner.** Gated only by a server env secret shared via a form field. Must be removed from the deployed build or hard-gated to a non-production environment after the owner is established.

5. **`/provider/search-readiness` reads the wrong provider.** `select(...).limit(1)` on `providers` returns an arbitrary row rather than the provider selected in the workspace. Any account with more than one provider identity is shown incorrect readiness scores and remediation reasons.

### 🟠 High

6. **`/admin/discovery` fails silently into a false "all clear".** Nav capability (`platform.seo` \| `platform.taxonomy`) does not match data policy (`platform.seo.read` + `platform.taxonomy.read`), and there is no error branch. An operator sees `0 indexable routes` and concludes indexing is broken rather than that they lack permission. `/admin/work`, `/admin/money`, and `/admin/operations` share the same silent-zero pattern.

7. **Raw internal UUID rendered in a customer-facing view.** `app/payments/paystack/return/page.tsx` displays `Payment attempt reference: {attempt}`. This is a `payment_attempts` identifier exposed in the standard (non-diagnostic) UI. Additionally, internal UUIDs leak into user-visible URLs and browser history via `?provider=<uuid>` (`/provider/onboarding`, `/provider/requests/[id]/quote`) and `?attempt=<uuid>` (payment return).

8. **Reflected URL text in trusted alert containers.** `?error=` is rendered verbatim into `role="alert"` notices on `/requests/new`, `/sign-in`, `/sign-up`, `/provider/onboarding`, and `/admin/access`. React escapes HTML so this is **not XSS**, but it is an open UI-spoofing/phishing surface: an attacker can craft `/requests/new?error=Payment failed — call 0800-SCAM`. Worse, `/requests/new` populates that parameter from **raw Postgres `error.message`**, leaking internal schema/detail to end users.

9. **Architectural divergence from the specified route map.** The brief specifies `/app/customer/*`, `/app/provider/*`, `/app/projects/{id}/*`. The codebase implements `/work`, `/provider/*`, and `/requests/[id]` instead — a different noun (`requests` vs `projects`) and a different customer namespace. There are also **no route groups** anywhere in `app/`, so the marketing header and footer render on every workspace route and `app/admin/layout.tsx` hides them with an injected `<style>` tag rather than structural segmentation. This must be decided before more UI is built on top of it.

10. **Missing pending/submitting states on money-adjacent mutations.** Only one component in the app (`PendingSubmitButton`) shows in-flight feedback. Accept Quote, Approve Completion, Submit Quote, Schedule, Start Work, Submit Evidence, and every admin refund/payout/dispute action show no disabled/`aria-busy` state. *Risk is UX, not integrity* — verified DB guards (`assignments_one_active_per_request_idx` partial unique index, `payment_obligations unique(assignment_id)` / `unique(quote_id)`) prevent duplicate side effects. Frame accordingly, but fix for perceived reliability.

### 🟡 Medium

11. **`/services` and `/search` are conversion dead-ends.** The primary nav CTA "Find services" leads to a static stub, and the homepage search form leads to a page that performs no search. The entire public discovery funnel terminates at a sign-in wall.
12. **Hardcoded service copy on a generic route.** `/[country]/[city]/[locality]/[service]` renders "Describe the **plumbing** problem" for every service, so `.../tailors/` is factually wrong.
13. **`/admin-invite/accept` duplicates `/admin/invitations/accept`** with identical logic in separate action files — a forked surface that will drift.
14. **`robots.ts` omits `/requests`, `/provider`, `/admin`, `/payments`.** Crawl exclusion depends entirely on per-page metadata exports that are already inconsistent (`/provider/search-readiness` has no `robots` export at all).
15. **`/account/security` defaults `next` to `/admin`**, sending a customer who just enrolled in MFA toward an admin path they cannot enter.
16. **Multi-currency hardcoding in a multi-market platform.** `/provider/payouts` pins `currency_code=NGN` and `listPaystackBanks('nigeria')` while the rest of the domain is market/currency-parameterised.

### ✅ Verified clean (worth recording)

- **No optimistic UI on payments, quotes, or task completion.** Zero `useOptimistic` / `useTransition` usage. Every mutation is a Server Action → `*_command` RPC → `redirect()`. The funding gate is enforced server-side (`20260830003500_require_funding_before_paid_work_execution.sql`), and browser returns from Paystack are explicitly documented in-UI as non-authoritative.
- **No client-side-only authorization.** The three `'use client'` files are a nav-highlight component, a submit-status button, and MFA enrollment. All gating is server-side (`admin/layout.tsx`, per-page `getUser()`, RPC guards, RLS).
- **Service-role client is never used for reads** and always follows an app-level capability check (with the single `/provider/payouts` exception noted above).
- **Backend test coverage exists**: 5 SQL suites including `e2e_paid_work_funding_gate.sql` and `e2e_quote_accept_assignment.sql`.
- **Webhook and checkout handlers are exemplary** — signature-before-parse, payload hashing, event dedupe, idempotency keys, open-redirect sanitization.

---

## 4. Audit Check Detail

### 4.1 Routing & Workspace Mapping

| Specified namespace | Actual implementation | Verdict |
| :--- | :--- | :--- |
| `/` | `/`, `/services`, `/search`, `/providers`, `/providers/[slug]`, `/[country]/[city]/[locality]/[service]` | Present, but discovery funnel incomplete (`/services`, `/search` are stubs) |
| `/auth/*` | `/sign-in`, `/sign-up`, `/forgot-password`, `/auth/callback`, `/account/update-password`, `/account/security`, `/account/activate-admin-access` | Present; **no `/auth/*` namespace** — auth pages sit at root level |
| `/app/customer/*` | `/work`, `/requests/new`, `/requests/[id]`, `/requests/[id]/matches` | **Absent namespace** |
| `/app/provider/*` | `/provider`, `/provider/onboarding`, `/provider/requests/[id]/quote`, `/provider/assignments/[id]`, `/provider/payouts`, `/provider/search-readiness` | **Absent namespace** (flat `/provider/*`) |
| `/app/projects/{id}/*` | `/requests/[id]`, `/requests/[id]/matches`, `/provider/assignments/[id]` | **Absent** — "projects" model does not exist; work is modelled as request → quote → assignment |
| `/admin/*` | 11 admin routes + 2 setup/invite routes | Present; highest-maturity workspace |

**Missing PRD-expected routes (8):** `/[country]` hub · `/[country]/[city]` hub · `/app/customer/*` namespace · `/app/projects/{id}/*` namespace · search results route · `/not-found` · `error.tsx` / `global-error.tsx` · customer account profile route.

**Future Phase [inferred, not marked in code] (5):** messaging, reviews/ratings, provider payout history & receipts, customer profile/settings, admin taxonomy write-back.

### 4.2 Security & Data Integrity Check

| Check | Result |
| :--- | :--- |
| Raw UUIDs in standard (non-diagnostic) UI | **2 violations** — `/payments/paystack/return` (`attempt`), plus UUID-bearing query params on provider routes |
| Optimistic UI on quote acceptance / completions / payments | **0 violations** — verified absent |
| Client-side-only auth checks | **0 violations** — all gating server-side |
| Open redirect | **No violations** — `safeNext`/`safeReturnTo` guard `//` and `\` in 8 locations |
| Service-role key exposure to client | **No violations** — `lib/supabase/service.ts` is `server-only` |
| Reflected text injection into trusted containers | **5 routes** (`?error=` consumed directly) |
| Internal DB error text surfaced to end users | **1 route** (`/requests/new` passes `error.message` into the URL) |

### 4.3 State Coverage

Checked for: Skeleton loading · Empty · Network error · Authorization denied · Pending mutation · Success/confirmation

| State | Coverage | Notes |
| :--- | :--- | :--- |
| Skeleton loading | **0 / 41** | No `loading.tsx`, no skeleton CSS. One text placeholder (`Checking security status…`). |
| Empty | **~9 / 41** | Consistent and well-written *where present* (`empty-admin`, `/work`, `/matches`, verification queue, audit). Absent on all public discovery routes. |
| Network error | **0 / 41** | No `error.tsx`; two readers *throw*; four admin pages silently coerce failures to `0`. |
| Authorization denied | **2 / 41** | `admin/verifications` (inline, exemplary) and `/admin` layout (silent redirect to `/`, no explanation). Missing everywhere else. |
| Pending mutation | **1 component** | `PendingSubmitButton` on `/admin/access` only. |
| Success confirmation | **~14 / 41** | `?success=`/`?sent=`/`?accepted=` pattern, generally clear and well-worded. |

### 4.4 Rendering Strategy

| Route class | Strategy | Cacheable? |
| :--- | :--- | :--- |
| `/` , `/services` , `/providers` | Intended static | **No** — root layout `AuthNav` awaits `cookies()` |
| `/[country]/[city]/[locality]/[service]` | Dynamic SSR (per-request DB) | **No** — and no `revalidate` / `unstable_cache` / `generateStaticParams` |
| `/providers/[slug]` | Dynamic SSR | **No** |
| `/sitemap.xml` | Dynamic route handler | **No** — reads DB per request; homepage `lastModified` is `new Date()` |
| Workspace + admin routes | Dynamic SSR (correct) | N/A — appropriately dynamic |

**Conclusion:** public discovery routes are **server-rendered but entirely uncached**, and the root layout prevents prerendering of anything. There is no ISR, no CDN-cacheable public output, and no streaming/Suspense. For a strategy whose differentiator is indexable local service pages, rendering is currently the single largest architectural gap after the missing error/loading layer.

---

## Recommended sequencing

1. **Unblock correctness** — `/provider/search-readiness` provider scoping; `/admin/discovery` capability/policy alignment + error states; breadcrumb 404s; `/admin-bootstrap` gating.
2. **Establish the state layer** — root `error.tsx` + `not-found.tsx`, per-workspace `loading.tsx`, skeleton primitives in `globals.css`, and a shared `<SubmitButton>` using `useFormStatus`.
3. **Fix the rendering model** — extract `AuthNav` from the blocking root-layout path, introduce route groups `(marketing)` / `(app)` / `(admin)` (also removing the injected admin `<style>` hack), then add `revalidate`/`unstable_cache` to discovery reads.
4. **Decide the route namespace** — reconcile `/app/customer/*` + `/app/projects/{id}/*` against the existing `/work` + `/requests/[id]` model *before* further UI is built on it.
5. **Close identifier leaks** — remove the raw `payment_attempts` UUID from the payment return view, replace query-param UUIDs with opaque references, and stop reflecting `?error=` into trusted alert containers.
