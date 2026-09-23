import Link from 'next/link';
import { ArrowRight, CircleCheck, ShieldAlert } from 'lucide-react';
import { BADGE_SLATE, CARD } from '@/components/discovery/tokens';
import { formatMoney } from '@/features/provider-workspace/format';
import {
  PROJECT_STATE_COPY,
  ROLE_LABEL,
  nextActionHref,
  type Project,
  type ProjectRole,
} from '@/features/projects/project';

/**
 * The shared project's header and overview pieces.
 *
 * ⚠️ PROGRESSIVE DISCLOSURE IS `<details>`, NOT A CLIENT ACCORDION. Financial and technical detail collapses by
 * default and opens without JavaScript, keyboard-operably, with the summary line carrying the headline figure so a
 * closed section still says something.
 *
 * ⚠️ THE NEXT-ACTION CARD IS THE PLATFORM'S ANSWER, NOT THE PAGE'S. `next_action` comes from the state the job is
 * actually in and the role the caller actually has; the page only decides where the button points. A page that
 * chose its own call to action would eventually contradict the state machine.
 */

function initialsOf(name: string | null, fallback: string): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const initials = parts.map(part => part[0]?.toUpperCase() ?? '').join('');
  return initials.length > 0 ? initials : fallback;
}

function roleBadge(role: ProjectRole) {
  return <span className={BADGE_SLATE}>{ROLE_LABEL[role]}</span>;
}

export function ProjectHeader({ project }: { project: Project }) {
  const started = project.schedule?.scheduledStart
    ? new Date(project.schedule.scheduledStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const place = [project.header.locationName, project.header.cityName].filter(Boolean).join(', ');

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
            Shared project · you are the {ROLE_LABEL[project.role].toLowerCase()}
          </p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {project.header.outcome}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {project.header.serviceName ? <span>{project.header.serviceName}</span> : null}
            {place ? <span>{place}</span> : null}
            {started ? <span>Starts {started}</span> : <span>No date agreed yet</span>}
          </p>
        </div>
        <span className={project.header.state === 'completed' ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-mono text-[11px] font-bold tracking-wider text-primary uppercase' : BADGE_SLATE}>
          {PROJECT_STATE_COPY[project.header.state] ?? project.header.state.replaceAll('_', ' ')}
        </span>
      </div>

      {/* The two parties. Initials rather than photographs: `profiles` has no image column, so a picture here would
          be a generated one pretending to be a person. */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-solid border-slate-300 bg-white font-mono text-xs font-bold text-primary"
          >
            {initialsOf(project.header.customerName, 'C')}
          </span>
          <span className="text-sm font-semibold text-slate-800">
            {project.header.customerName ?? 'Customer'}
            <span className="block text-xs font-normal text-slate-500">Customer</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-solid border-slate-300 bg-white font-mono text-xs font-bold text-primary"
          >
            {initialsOf(project.header.providerName, 'P')}
          </span>
          <span className="text-sm font-semibold text-slate-800">
            {project.header.providerName ?? 'Provider'}
            <span className="block text-xs font-normal text-slate-500">Provider</span>
          </span>
        </span>
        {roleBadge(project.role)}
      </div>
    </div>
  );
}

export function ProjectOverview({ project }: { project: Project }) {
  const href = project.nextAction ? nextActionHref(project.nextAction.hrefKind, project) : null;

  return (
    <>
      {project.risks.length > 0 ? (
        <section
          role="status"
          className="rounded-2xl border border-solid border-secondary bg-secondary-light p-5"
          aria-labelledby="risks-heading"
        >
          <h2 id="risks-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-amber-900">
            <ShieldAlert aria-hidden="true" className="h-4 w-4 text-amber-800" />
            {project.risks.length === 1 ? 'One thing needs attention' : `${project.risks.length} things need attention`}
          </h2>
          <ul className="mt-3 grid gap-2">
            {project.risks.map(risk => (
              <li key={risk.key} className="rounded-xl border border-solid border-amber-200 bg-white p-3">
                <p className="text-sm font-semibold text-amber-900">{risk.label}</p>
                {risk.detail ? <p className="mt-0.5 text-xs leading-relaxed text-amber-900">{risk.detail}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {project.nextAction ? (
        <section className={`${CARD} p-5`} aria-labelledby="next-action-heading">
          <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">Your next action</p>
          <h2 id="next-action-heading" className="mt-1.5 text-base font-bold tracking-tight text-slate-900">
            {project.nextAction.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{project.nextAction.detail}</p>
          {href ? (
            <Link
              href={href}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white no-underline shadow-sm transition-colors hover:bg-secondary-dark"
            >
              Go there
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Nothing is needed from you — this step waits on the other party.
            </p>
          )}
        </section>
      ) : null}

      <details className={`${CARD} p-5`}>
        <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-bold tracking-tight text-slate-900">
          <span>Payment and agreement</span>
          <span className="font-mono text-xs font-normal text-slate-500">
            {project.money.amountMinor && project.money.currencyCode
              ? `${formatMoney(project.money.amountMinor, project.money.currencyCode)} · ${(project.money.obligationStatus ?? 'no obligation').replaceAll('_', ' ')}`
              : 'No payment obligation'}
          </span>
        </summary>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Obligation</dt>
            <dd className="mt-0.5 text-slate-700">
              {project.money.obligationStatus ? project.money.obligationStatus.replaceAll('_', ' ') : 'None on this job'}
              {project.money.amountMinor && project.money.currencyCode
                ? ` · ${formatMoney(project.money.amountMinor, project.money.currencyCode)}`
                : ''}
            </dd>
          </div>
          <div>
            <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Payout</dt>
            <dd className="mt-0.5 text-slate-700">
              {project.money.payoutStatus ? project.money.payoutStatus.replaceAll('_', ' ') : 'No payout yet'}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Agreement</dt>
            <dd className="mt-0.5 text-slate-700">
              {project.agreement
                ? `${project.agreement.quoteVersion} accepted for ${formatMoney(project.agreement.totalMinor, project.agreement.currencyCode)}${
                    project.agreement.acceptedAt
                      ? ` on ${new Date(project.agreement.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : ''
                  } (${project.agreement.authMethod})`
                : 'No signed agreement is recorded on this job.'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          The provider&apos;s earnings page reconciles the ledger against these rows; this is the same money seen from
          the job&apos;s side.
        </p>
      </details>

      <MilestonesSection project={project} />
    </>
  );
}

export function MilestonesSection({ project }: { project: Project }) {
  return (
    <section id="milestones" className={`${CARD} p-5`} aria-labelledby="milestones-heading">
      <h2 id="milestones-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <CircleCheck aria-hidden="true" className="h-4 w-4 text-primary" />
        Milestones
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        The money path for this job, in order. None of these is a checkbox: each one is a row the platform already
        holds, which is why they cannot be ticked by hand.
      </p>
      <ol className="mt-3 grid gap-2">
        {project.milestones.map(milestone => (
          <li key={milestone.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
            <span className={`text-sm ${milestone.done ? 'text-slate-700' : 'text-slate-500'}`}>
              <span className="mr-2" aria-hidden="true">
                {milestone.done ? '●' : '○'}
              </span>
              {milestone.label}
            </span>
            <span className="text-xs text-slate-500">
              {milestone.at
                ? new Date(milestone.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : milestone.done
                  ? 'Reached'
                  : 'Not yet'}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        The plan&apos;s own tasks are on the Work tab and are tracked separately from these. A task list that released
        money would be a second payment path, and this platform has one.
      </p>
    </section>
  );
}

export function ChangesSection({ project }: { project: Project }) {
  return (
    <section id="changes" className={`${CARD} p-5`} aria-labelledby="project-changes-heading">
      <h2 id="project-changes-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Changes and questions
      </h2>
      {project.changes.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          The customer has not asked for a change to the price or the scope.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {project.changes.map(change => (
            <li key={change.id} className="rounded-xl border border-solid border-slate-200 p-3">
              <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                {change.kind.replaceAll('_', ' ')} · {change.status}
              </p>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-700">{change.message}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        A change to the agreed work is a change to the agreement: the accepted version stays as it was signed, and a
        revised quote is a new version beside it.
      </p>
    </section>
  );
}
