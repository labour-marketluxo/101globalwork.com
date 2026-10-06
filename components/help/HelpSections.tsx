import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CircleAlert,
  CircleCheck,
  Clock,
  LifeBuoy,
  Search,
  ShieldAlert,
  Users,
} from '@/components/ui/icons';
import { BADGE_SLATE, CARD, CARD_INTERACTIVE, FIELD, LINK_ARROW, PUBLIC_SHELL } from '@/components/discovery/tokens';
import {
  COMPONENT_STATE_COPY,
  OVERALL_STATE_COPY,
  type SystemStatus,
} from '@/features/help/status';
import { scriptTag } from '@/features/help/structured-data';
import type { HelpSearchHit, PublicHelpArticle, PublicHelpCategory } from '@/features/help/knowledge-base';

/**
 * The help centre's presentation. Every component here is a server component; the whole public help surface
 * ships no client JavaScript at all.
 *
 * ⚠️ THAT IS THE LOW-BANDWIDTH DESIGN, NOT A SIDE EFFECT. The audience for a support page is
 * disproportionately people on a bad connection — somebody standing in a lift shaft, on a site with one bar of
 * signal, or on a metered data plan — and every kilobyte spent on a hydrated component is a kilobyte not spent
 * on the answer. So: no images, no carousels, no accordions that need script, one <form> that works with
 * JavaScript disabled, and text that is readable at the default font size rather than a layout that assumes a
 * wide screen.
 *
 * ⚠️ IT ALSO DOES NOT PRETEND TO BE A SEARCH PRODUCT. The search box posts to the same URL the results are
 * rendered at, so a result is linkable, bookmarkable and shareable, and the platform can pre-render everything
 * except the query itself.
 */

/** Full date and time in the words somebody would say out loud; `dateTime` keeps the machine form. */
function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(date);
}

/**
 * The one form on the public help surface.
 *
 * A GET form to /help, so the query lives in the URL: a result somebody can send to a colleague, a page the
 * browser can go Back from, and nothing to hydrate. The label is visible rather than a placeholder, because a
 * placeholder disappears the moment somebody starts typing.
 */
export function HelpSearchForm({ query, compact = false }: { query?: string; compact?: boolean }) {
  return (
    <form method="get" action="/help" role="search" className="w-full">
      <label
        htmlFor="help-search"
        className="mb-1.5 block font-sans text-[11px] font-bold tracking-wider text-white/80 uppercase"
      >
        Search knowledge base
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            id="help-search"
            name="q"
            type="search"
            defaultValue={query ?? ''}
            placeholder="quotes, refunds, verification, two-factor…"
            autoComplete="off"
            className={`${FIELD} pl-9`}
          />
        </div>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-secondary px-5 py-2.5 font-sans text-sm font-bold text-white transition-colors hover:bg-secondary-dark"
        >
          Search
        </button>
      </div>
      {!compact ? (
        <p className="mt-2 text-xs leading-relaxed text-white/70">
          Search covers every published article. Nothing is logged against your account, and the query stays in
          the address bar so you can share the result.
        </p>
      ) : null}
    </form>
  );
}

/**
 * The status strip.
 *
 * ⚠️ AN UNREADABLE STATUS IS NEVER SHOWN AS ALL-CLEAR. `available: false` renders an amber line saying the
 * status could not be checked, because "operational" and "we could not ask" are different answers to the only
 * question this strip exists to answer.
 */
export function StatusStrip({ status }: { status: SystemStatus }) {
  if (!status.available) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-solid border-secondary bg-secondary-light p-4 text-sm leading-relaxed text-amber-900">
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
        <div>
          <p className="font-bold">Platform status could not be checked.</p>
          <p className="mt-1">
            This is not the same as everything being fine. If you are here because something is not working,
            open a support case and describe what you saw — a case is recorded even while a page is not, and it
            keeps its own deadline.
          </p>
        </div>
      </div>
    );
  }

  const overall = OVERALL_STATE_COPY[status.overall];
  const checked = formatWhen(status.checkedAt);

  return (
    <section aria-labelledby="status-heading" className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              status.overall === 'operational'
                ? 'bg-primary-subtle text-primary'
                : status.overall === 'degraded'
                  ? 'bg-secondary-light text-amber-800'
                  : 'bg-red-50 text-red-700'
            }`}
          >
            {status.overall === 'operational' ? (
              <CircleCheck className="h-4 w-4" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
          </span>
          <div>
            <h2 id="status-heading" className="text-sm font-bold tracking-tight text-slate-900">
              {overall.headline}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">{overall.detail}</p>
          </div>
        </div>
        {checked ? (
          <p className="font-sans text-xs text-slate-500">
            Checked <time dateTime={status.checkedAt ?? undefined}>{checked}</time>
          </p>
        ) : null}
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {status.components.map((component) => {
          const copy = COMPONENT_STATE_COPY[component.state];
          return (
            <li
              key={component.key}
              className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3.5 py-2.5"
            >
              <span className="text-xs font-semibold text-slate-700">{component.label}</span>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    copy.tone === 'ok' ? 'bg-primary' : copy.tone === 'warn' ? 'bg-secondary' : 'bg-red-600'
                  }`}
                />
                <span className="font-sans text-[11px] font-bold tracking-wider text-slate-600 uppercase">
                  {copy.label}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {status.incidents.length > 0 ? (
        <div className="mt-5 border-t border-solid border-slate-200 pt-4">
          <h3 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Open incidents
          </h3>
          <ul className="mt-3 grid gap-3">
            {status.incidents.map((incident) => {
              const started = formatWhen(incident.startedAt);
              const updated = formatWhen(incident.updatedAt);
              return (
                <li
                  key={`${incident.title}-${incident.startedAt ?? 'unknown'}`}
                  className="rounded-lg border border-solid border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold tracking-tight text-slate-900">{incident.title}</h4>
                    <span className={incident.severity === 'major' ? BADGE_MAJOR : BADGE_SLATE}>
                      {incident.severity === 'major' ? 'Major' : 'Minor'}
                    </span>
                    <span className={BADGE_SLATE}>{incident.state}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{incident.summary}</p>
                  {started ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Started <time dateTime={incident.startedAt ?? undefined}>{started}</time>
                      {updated ? ` · last update ${updated}` : ''}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Status is a summary written for the public. The operator&rsquo;s own notes, the systems involved and
            the handling staff are deliberately not published here.
          </p>
        </div>
      ) : null}
    </section>
  );
}

const BADGE_MAJOR =
  'inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wider text-red-700 uppercase';

export function HelpCategoryGrid({
  categories,
  activeSlug,
}: {
  categories: PublicHelpCategory[];
  activeSlug?: string;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => (
        <li key={category.slug}>
          <Link
            href={category.href}
            aria-current={category.slug === activeSlug ? 'page' : undefined}
            className={`${CARD_INTERACTIVE} flex h-full flex-col justify-between gap-3 p-4 no-underline`}
          >
            <div>
              <p className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                {category.forLine}
              </p>
              <p className="mt-1 text-sm font-bold tracking-tight text-slate-900">{category.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{category.summary}</p>
            </div>
            <p className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                {category.articleCount} article{category.articleCount === 1 ? '' : 's'}
              </span>
              <span className={LINK_ARROW}>
                Browse
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A compact list of articles. Used by the category pages, the hub and the search results. */
export function HelpArticleList({
  articles,
  emptyMessage,
}: {
  articles: PublicHelpArticle[];
  emptyMessage?: string;
}) {
  if (articles.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
        {emptyMessage ?? 'Nothing here yet.'}
      </p>
    );
  }

  return (
    <ul className="grid gap-2.5">
      {articles.map((article) => (
        <li key={article.slug}>
          <Link href={article.href} className={`${CARD} block p-4 no-underline transition-shadow hover:shadow-md`}>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-slate-900">{article.title}</span>
              <span className="flex items-center gap-1 font-sans text-[11px] text-slate-500">
                <Clock aria-hidden="true" className="h-3 w-3" />
                {article.readMinutes} min
              </span>
            </span>
            <span className="mt-1.5 block text-xs leading-relaxed text-slate-600">{article.summary}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Search results.
 *
 * The hit may carry an anchor — the first section that matched — so a result links to the paragraph that
 * answers the question rather than to the top of a long article.
 */
export function HelpSearchResults({ query, hits }: { query: string; hits: HelpSearchHit[] }) {
  if (hits.length === 0) {
    return (
      <div className="rounded-xl border border-solid border-slate-200 bg-white p-6">
        <p className="text-sm font-bold tracking-tight text-slate-900">
          Nothing in the knowledge base matches &ldquo;{query}&rdquo;.
        </p>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
          Search requires every word to appear somewhere in an article, so a specific query returns fewer
          results — try the words that name the thing rather than describing it. If the answer is about your
          own account, project or money, open a support case instead: a case can be answered, and an article
          cannot.
        </p>
        <p className="mt-3 flex flex-wrap gap-4">
          <Link href="/help" className={LINK_ARROW}>
            Clear the search
          </Link>
          <Link href="/support" className={LINK_ARROW}>
            Contact support
          </Link>
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-2.5">
      {hits.map((hit) => (
        <li key={hit.article.slug}>
          <Link
            href={hit.anchor ? `${hit.article.href}#${hit.anchor}` : hit.article.href}
            className={`${CARD} block p-4 no-underline transition-shadow hover:shadow-md`}
          >
            <span className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              {hit.article.categoryTitle}
            </span>
            <span className="mt-1 block text-sm font-bold tracking-tight text-slate-900">{hit.article.title}</span>
            <span className="mt-1.5 block text-xs leading-relaxed text-slate-600">{hit.article.summary}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The two ways out of the knowledge base.
 *
 * ⚠️ THEY ARE DIFFERENT DOORS AND THE CARDS SAY SO. "Contact support" opens a private case with a deadline
 * attached; "Report a safety incident" opens the same kind of case at high priority, and the card carries the
 * emergency caveat rather than burying it in an article — the one sentence somebody needs to read before they
 * start typing is that this is not an emergency service.
 */
export function SupportActionCards() {
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      <li className={`${CARD} flex h-full flex-col gap-3 p-5`}>
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
          <LifeBuoy className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-bold tracking-tight text-slate-900">Contact support</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            Open a private case and describe what happened. Cases are answered in order of the deadline attached
            to them, you can attach files, and the thread is only visible to you and the platform. A case belongs
            to an account, so you will be asked to sign in first — that is what keeps it private.
          </p>
        </div>
        <Link href="/support" className={LINK_ARROW}>
          Open a case
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </li>

      <li className={`${CARD} flex h-full flex-col gap-3 p-5`}>
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary-light text-amber-800">
          <ShieldAlert className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-bold tracking-tight text-slate-900">Report a safety incident</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            Harm, threats, fraud or unsafe work. A safety report opens at high priority, and the other party is
            not told who reported it.
          </p>
          <p className="mt-2 text-xs leading-relaxed font-semibold text-red-700">
            This is not an emergency service. If somebody is in danger, contact the emergency services first.
          </p>
        </div>
        <Link href="/support?kind=safety" className={LINK_ARROW}>
          Report a concern
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </li>

      <li className={`${CARD} flex h-full flex-col gap-3 p-5`}>
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-bold tracking-tight text-slate-900">Read the safety rules</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            What verification does and does not mean, how a payment is held, and what the platform does not
            decide — the page every article here points back to.
          </p>
        </div>
        <Link href="/trust-and-safety" className={LINK_ARROW}>
          Trust &amp; safety
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </li>
    </ul>
  );
}

/** Who wrote an article and when it was last checked. Same authorship rule as the market guides. */
export function ArticleMeta({ article }: { article: PublicHelpArticle }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-solid border-slate-200 pb-4 text-xs">
      <div className="flex items-center gap-2">
        <Users aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
        <dt className="sr-only">Written for</dt>
        <dd className="font-semibold text-slate-700">
          {article.audience === 'everyone' ? 'Everyone' : `Written for ${article.audience}s`}
        </dd>
      </div>
      <div className="flex items-center gap-2">
        <Clock aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
        <dt className="sr-only">Reading time</dt>
        <dd className="text-slate-600">{article.readMinutes} minute read</dd>
      </div>
      <div>
        <dt className="inline text-slate-500">By 101GlobalWork · </dt>
        <dd className="inline text-slate-600">
          checked against the product on{' '}
          <time dateTime={article.reviewedAt}>{formatDay(article.reviewedAt)}</time>
        </dd>
      </div>
    </dl>
  );
}

/** Related links plus the case CTA, under every article. */
export function ArticleFooter({ article }: { article: PublicHelpArticle }) {
  return (
    <div className={PUBLIC_SHELL}>
      <div className="grid max-w-3xl gap-6">
        {article.related.length > 0 ? (
          <section aria-labelledby="related-heading">
            <h2 id="related-heading" className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Where this connects
            </h2>
            <ul className="mt-3 grid gap-2">
              {article.related.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={LINK_ARROW}>
                    {item.label}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={`${CARD} p-5`}>
          <h2 className="text-sm font-bold tracking-tight text-slate-900">Still stuck?</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            An article can explain how something works; it cannot look at your project. If the question is about
            your own account, quote, payment or job, open a support case — it keeps a thread, a deadline and any
            files you attach.
          </p>
          <p className="mt-3 flex flex-wrap gap-4">
            <Link href="/support" className={LINK_ARROW}>
              Contact support
            </Link>
            <Link href="/help" className={LINK_ARROW}>
              Back to the help centre
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

/** The one place a JSON-LD payload becomes markup, so the escaping cannot be forgotten at a call site. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // The escaped body comes from the ONE helper in features/help/structured-data.ts, so this component cannot
  // drift from the escaping the Next.js docs require.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: scriptTag(data) }} />;
}
