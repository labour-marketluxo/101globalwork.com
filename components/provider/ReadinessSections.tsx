import Link from 'next/link';
import { ArrowRight, CircleCheck, Info, Search, TriangleAlert } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, LINK_ARROW } from '@/components/discovery/tokens';
import { dimensionTone, readinessLabel, type ProviderReadiness } from '@/features/provider-workspace/readiness';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * Search readiness.
 *
 * ⚠️ THE PAGE PROMISES ELIGIBILITY, NEVER POSITION. Everything it states is something the platform
 * enforces or measures about the provider's own data: whether matching will reach them (readiness ≥ 60),
 * whether their profile page is eligible to be indexed, and which of their fields are missing. Where a
 * result would depend on a search engine's own ranking, the copy says so instead of implying otherwise.
 *
 * ⚠️ THE SCORE IS THE PLATFORM'S, THE CHECKLIST IS OURS. The six bands come from
 * `provider_search_readiness` and are shown as computed. The checklist below it is derived from the
 * provider's own records so each line can carry a destination — a score out of 100 with nothing to do
 * about it is a verdict, and what a provider needs is a list.
 */

function ScoreBar({ score, tone }: { score: number; tone: 'teal' | 'amber' | 'slate' }) {
  const colour = tone === 'teal' ? 'bg-primary' : tone === 'amber' ? 'bg-secondary' : 'bg-slate-300';
  return (
    <div
      role="img"
      aria-label={`${score} out of 100`}
      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <span className={`block h-full rounded-full ${colour}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </div>
  );
}

export function ReadinessHeader({ data }: { data: ProviderReadiness }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
          {data.displayName}
        </p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Search readiness
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          This measures whether your profile is complete enough to be matched and to be eligible for
          indexing. It does not predict or promise a ranking — search engines decide their own order from
          their own signals.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2">
        <span className={data.isPublic ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-primary uppercase' : BADGE_AMBER}>
          {data.isPublic ? 'Published' : 'Not published'}
        </span>
        <Link href={PROVIDER_PATHS.profile} className={LINK_ARROW}>
          Edit your profile
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

export function ReadinessScore({ data }: { data: ProviderReadiness }) {
  const tone = dimensionTone(data.totalScore);

  return (
    <section className={`${CARD} p-5`} aria-labelledby="readiness-score-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="readiness-score-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Readiness score
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {readinessLabel(data.readiness)}
            {data.evaluatedAt
              ? ` · last calculated ${new Date(data.evaluatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : ' · not calculated yet'}
          </p>
        </div>
        <p className="text-3xl font-extrabold tracking-tight text-slate-900">
          {data.totalScore}
          <span className="text-base font-semibold text-slate-400">/100</span>
        </p>
      </div>

      <ScoreBar score={data.totalScore} tone={tone} />

      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        Matching requires 60 or more, plus a selected service and coverage area. Below 60 a request will
        not reach you however complete the rest of the profile looks.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {data.dimensions.map(dimension => (
          <div key={dimension.key}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs font-bold tracking-tight text-slate-800">{dimension.label}</dt>
              <dd className="font-mono text-xs text-slate-600">{dimension.score}</dd>
            </div>
            <ScoreBar score={dimension.score} tone={dimensionTone(dimension.score)} />
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{dimension.note}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ReadinessChecklist({ data }: { data: ProviderReadiness }) {
  return (
    <section aria-labelledby="readiness-checklist-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="readiness-checklist-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <Search aria-hidden="true" className="h-4 w-4 text-primary" />
          What is missing, and where to fix it
        </h2>
        {data.remaining > 0 ? <span className={BADGE_AMBER}>{data.remaining} to do</span> : <span className={BADGE_SLATE}>All done</span>}
      </div>

      <ul className="mt-3 grid gap-3 lg:grid-cols-2">
        {data.checklist.map(item => (
          <li key={item.key} className={`${CARD} flex flex-col p-4`}>
            <div className="flex items-start justify-between gap-3">
              <p className={`text-sm font-bold tracking-tight ${item.done ? 'text-slate-500' : 'text-slate-900'}`}>
                {item.label}
              </p>
              {item.done ? (
                <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              )}
            </div>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-600">{item.detail}</p>
            {item.href ? (
              <Link href={item.href} className={`mt-3 ${LINK_ARROW}`}>
                {item.cta}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Nothing to do here — the platform acts on this.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The platform's own reasons list.
 *
 * This is different from the checklist above and both are shown: the checklist is derived from the
 * provider's records, and this is what `compute_provider_search_readiness` actually concluded. When they
 * disagree, that is a bug worth seeing — and hiding one behind the other is how a scoring change goes
 * unnoticed.
 */
export function PlatformReasons({ data }: { data: ProviderReadiness }) {
  if (data.reasons.length === 0) return null;

  return (
    <section className={`${CARD} p-5`} aria-labelledby="platform-reasons-heading">
      <h2 id="platform-reasons-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <Info aria-hidden="true" className="h-4 w-4 text-primary" />
        What the scoring pass reported
      </h2>
      <ul className="mt-3 grid gap-2">
        {data.reasons.map(reason => (
          <li key={reason.code} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3 text-xs">
            <span className="text-slate-700">{reason.label}</span>
            {reason.href ? (
              <Link href={reason.href} className={LINK_ARROW}>
                Fix missing item
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="text-slate-500">Improves as the facts above change</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReadinessFacts({ data }: { data: ProviderReadiness }) {
  return (
    <section className={`${CARD} p-5`} aria-labelledby="readiness-facts-heading">
      <h2 id="readiness-facts-heading" className="text-sm font-bold tracking-tight text-slate-900">
        What the platform counts
      </h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.facts.map(fact => (
          <div key={fact.label} className="rounded-xl border border-solid border-slate-200 p-3">
            <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">{fact.label}</dt>
            <dd className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-900">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        These are the operational signals this platform can see. Responsiveness is the one entirely in
        your hands: an unanswered request is work that goes to somebody else.
      </p>
    </section>
  );
}
