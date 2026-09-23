import Link from 'next/link';
import { ArrowRight, CalendarClock, ClipboardCheck, MapPin, Pause, Search, TriangleAlert, User } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PendingButton } from '@/components/provider/ProviderControls';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import { formatDayLabel, formatMoney, formatWindow } from '@/features/provider-workspace/format';
import {
  BLOCKER_REASON_COPY,
  FIELD_STATE_COPY,
  WORK_TABS,
  initialsOf,
  paymentIndicator,
  workPath,
  workStatusPill,
  type WorkRow,
  type WorkTab,
} from '@/features/provider-workspace/work';

/**
 * The job list.
 *
 * ⚠️ THE FOUR TABS ARE FOUR STATES OF ONE LIST, CALCULATED FROM THE ROW. Nothing is stored per tab, so a job
 * cannot sit in two tabs at once or be missing from all of them — see `workTabOf`. The counts on the tabs come
 * from the same array the list is built from, so a tab cannot promise work the list does not show.
 *
 * ⚠️ THE CONTROLS ARE A GET FORM AND LINKS. Search and sort survive a reload, a bookmark and a shared link, and
 * they narrow a list that is already exactly this provider's work. No combination of query parameters can widen
 * it — the command does not take filters at all.
 */

export function WorkTabs({
  counts,
  current,
  query,
  sort,
}: {
  counts: Record<WorkTab, number>;
  current: WorkTab;
  query: string;
  sort: string;
}) {
  return (
    <nav aria-label="Job status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max items-center gap-1 border-b border-solid border-slate-200">
        {WORK_TABS.map(tab => {
          const isCurrent = tab.key === current;
          const href = `${PROVIDER_PATHS.work}?${new URLSearchParams({ ...(query ? { q: query } : {}), tab: tab.key, ...(sort && sort !== 'soonest' ? { sort } : {}) }).toString()}`;
          return (
            <li key={tab.key}>
              <Link
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                title={tab.note}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 border-solid px-3.5 py-2.5 text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  isCurrent
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                {tab.label}
                <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${isCurrent ? 'bg-primary-subtle text-primary' : 'bg-slate-100 text-slate-500'}`}>
                  {counts[tab.key]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function WorkFilters({ tab, query, sort }: { tab: WorkTab; query: string; sort: string }) {
  return (
    <form method="get" action={PROVIDER_PATHS.work} className={`${CARD} flex flex-wrap items-end gap-3 p-5`}>
      <input type="hidden" name="tab" value={tab} />
      <div className="min-w-0 flex-1">
        <label htmlFor="q" className={LABEL}>
          Search your jobs
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="e.g. the customer's words, an area, a service"
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="sort" className={LABEL}>
          Sort by
        </label>
        <select id="sort" name="sort" defaultValue={sort} className={FIELD}>
          <option value="soonest">Scheduled date, soonest first</option>
          <option value="latest">Scheduled date, latest first</option>
          <option value="assigned">Most recently accepted</option>
        </select>
      </div>
      <PendingButton
        idle="Apply"
        pending="Applying…"
        icon={<Search aria-hidden="true" className="h-4 w-4" />}
        className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
      />
      {query || sort !== 'soonest' ? (
        <Link href={`${PROVIDER_PATHS.work}?tab=${tab}`} className={LINK_ARROW}>
          Clear
        </Link>
      ) : null}
    </form>
  );
}

/**
 * The customer as the provider sees them.
 *
 * ⚠️ INITIALS, NOT A PHOTOGRAPH, AND THE PAGE SAYS SO ONCE. `profiles` has no image column, so any avatar here
 * would be a generated picture pretending to be a person. The name is real and comes from the work command.
 */
function CustomerMark({ name }: { name: string | null }) {
  const initials = initialsOf(name);
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-solid border-slate-300 bg-white font-mono text-[11px] font-bold text-primary"
      >
        {initials ?? <User className="h-3.5 w-3.5 text-slate-400" />}
      </span>
      <span className="min-w-0 truncate text-xs font-semibold text-slate-700">
        {name ?? 'Customer name not on file'}
      </span>
    </span>
  );
}

export function WorkCard({ row, now }: { row: WorkRow; now: Date }) {
  const pill = workStatusPill(row);
  const payment = paymentIndicator(row);
  const dayLabel = formatDayLabel(row.scheduledStart, now);
  const window = formatWindow(row.scheduledStart, row.scheduledEnd, row.scheduleTimezone);

  return (
    <article className={`${CARD} flex flex-col p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold tracking-tight text-slate-900">{row.needText}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {row.locationName ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {[row.locationName, row.cityName].filter(Boolean).join(', ')}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
              {dayLabel && window ? `${dayLabel}, ${window}` : dayLabel ?? 'No time agreed yet'}
            </span>
          </p>
        </div>
        <span
          className={
            pill.tone === 'teal'
              ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase'
              : pill.tone === 'amber'
                ? BADGE_AMBER
                : BADGE_SLATE
          }
        >
          {pill.label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <CustomerMark name={row.customerDisplayName} />
        <span
          className={payment.tone === 'teal' ? BADGE_SLATE : payment.tone === 'amber' ? BADGE_AMBER : BADGE_SLATE}
          title={payment.note}
        >
          {row.amountMinor && row.currencyCode ? `${formatMoney(row.amountMinor, row.currencyCode)} · ` : ''}
          {payment.label}
        </span>
      </div>

      {row.openBlockerReason ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-solid border-secondary bg-secondary-light px-3 py-2 text-xs leading-relaxed text-amber-900">
          <Pause aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
          Blocked: {BLOCKER_REASON_COPY[row.openBlockerReason] ?? row.openBlockerReason.toLowerCase().replaceAll('_', ' ')}.
        </p>
      ) : null}

      {row.correctionOpen ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-solid border-secondary bg-secondary-light px-3 py-2 text-xs leading-relaxed text-amber-900">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
          The customer sent this back for correction. Read what they asked for on the job.
        </p>
      ) : null}

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Checklist</dt>
          <dd className="mt-0.5 text-slate-700">
            {row.stepsTotal === 0 ? 'None written' : `${row.stepsDone} of ${row.stepsTotal} done`}
          </dd>
        </div>
        <div>
          <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Evidence</dt>
          <dd className="mt-0.5 text-slate-700">
            {row.evidenceCount === 0 ? 'Nothing submitted' : `${row.evidenceCount} item${row.evidenceCount === 1 ? '' : 's'}`}
          </dd>
        </div>
        <div>
          <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Last field update</dt>
          <dd className="mt-0.5 text-slate-700">
            {row.fieldState
              ? `${FIELD_STATE_COPY[row.fieldState] ?? row.fieldState}${row.fieldStateAt ? ` · ${new Date(row.fieldStateAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`
              : 'No checkpoints yet'}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-1 items-end justify-between gap-3 border-t border-solid border-slate-200 pt-3">
        <Link href={workPath(row.assignmentId)} className={LINK_ARROW}>
          Open the job
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
        {row.assignmentStatus === 'active' && row.requestState === 'in_progress' ? (
          <Link href={`${workPath(row.assignmentId)}/evidence`} className={LINK_ARROW}>
            <ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5" />
            Capture evidence
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function WorkList({ rows, now }: { rows: WorkRow[]; now: Date }) {
  if (rows.length === 0) {
    return (
      <EmptyState title="Nothing in this tab">
        Jobs appear here once a customer accepts one of your quotes. If you expected work, check the opportunities
        page — and your profile, which is what matching reads.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map(row => (
        <WorkCard key={row.assignmentId} row={row} now={now} />
      ))}
    </div>
  );
}
