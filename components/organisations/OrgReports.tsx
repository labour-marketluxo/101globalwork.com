import { BarChart3, Info, ShieldCheck } from 'lucide-react';
import { BADGE_SLATE, CARD } from '@/components/discovery/tokens';
import { formatMoney } from '@/features/provider-workspace/format';
import type { ReportsRead } from '@/features/organisations/governance';

/**
 * The analytics widgets.
 *
 * ⚠️ BARS, NOT A CHARTING LIBRARY. The platform has no chart dependency, and pulling one in for four widgets would be
 * a build cost and a supply-chain surface for something a div can draw. Where a bar implies a proportion, the numbers
 * are printed beside it — a bar without its figure is a picture of a number nobody can read.
 *
 * ⚠️ THE AGGREGATION FLOOR AND THE DATA'S AGE ARE ON THE PAGE. Groups under three rows are withheld by the query, and
 * the count of withheld groups is shown so an absent line is explained. A dashboard that says "updated now" while the
 * newest row is a week old is lying about two different things.
 */

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <span className="block h-full rounded-full bg-primary" style={{ width: String(percent) + '%' }} title={label} />;
}

export function ReportsDashboard({ reports, currencyCode }: { reports: ReportsRead; currencyCode: string }) {
  const maxSite = Math.max(1, ...reports.spendBySite.map(entry => entry.fundedMinor));
  const maxService = Math.max(1, ...reports.spendByService.map(entry => entry.fundedMinor));
  const slaTotal = reports.sla.onTime + reports.sla.late;
  const onTimeRate = slaTotal > 0 ? Math.round((reports.sla.onTime / slaTotal) * 100) : null;

  return (
    <div className="grid gap-5">
      <section className={`${CARD} p-5`} aria-labelledby="freshness-heading">
        <h2 id="freshness-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
          How to read these numbers
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Reported at{' '}
          {reports.generatedAt ? new Date(reports.generatedAt).toLocaleString('en-GB') : 'an unknown time'}, from records
          whose newest entry is{' '}
          {reports.dataAsOf ? new Date(reports.dataAsOf).toLocaleString('en-GB') : 'not recorded'}
          {reports.dataAsOf ? ' — if that looks old, the numbers below are old too.' : '.'}
        </p>
        <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            Groups with fewer than {reports.threshold} projects are withheld from the breakdowns, because an average over
            one project is that project with its name filed off. {reports.suppressedGroups > 0
              ? String(reports.suppressedGroups) + ' group(s) are hidden by that rule in this window.'
              : 'Nothing is hidden by that rule in this window.'}
          </span>
        </p>
      </section>

      <section aria-labelledby="kpi-heading" className="grid gap-4">
        <h2 id="kpi-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Completion
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`${CARD} p-4`}>
            <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Projects in window</dt>
            <dd className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">{reports.completion.projects}</dd>
          </div>
          <div className={`${CARD} p-4`}>
            <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Completed</dt>
            <dd className="mt-1 text-lg font-extrabold tracking-tight text-primary">{reports.completion.completed}</dd>
          </div>
          <div className={`${CARD} p-4`}>
            <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Cancelled or disputed</dt>
            <dd className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">{reports.completion.endedBadly}</dd>
          </div>
          <div className={`${CARD} p-4`}>
            <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Average days to finish</dt>
            <dd className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">
              {reports.completion.completed > 0 ? String(reports.completion.avgDays) : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className={`${CARD} p-5`} aria-labelledby="sla-heading">
        <h2 id="sla-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <BarChart3 aria-hidden="true" className="h-4 w-4 text-primary" />
          SLA compliance
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          {onTimeRate !== null
            ? String(onTimeRate) + '% of finished work was completed within the window the provider agreed.'
            : 'No finished work carries an agreed window in this period, so there is nothing to compare against.'}
        </p>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">On time</dt>
            <dd className="mt-0.5 font-semibold text-primary">{reports.sla.onTime}</dd>
          </div>
          <div>
            <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Late</dt>
            <dd className="mt-0.5 font-semibold text-amber-800">{reports.sla.late}</dd>
          </div>
          <div>
            <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Overdue now</dt>
            <dd className="mt-0.5 font-semibold text-amber-800">{reports.sla.currentlyOverdue}</dd>
          </div>
          <div>
            <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">No date agreed</dt>
            <dd className="mt-0.5 font-semibold text-slate-700">{reports.sla.noDate}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          A job with no agreed window is counted separately rather than as late: the provider has not promised a date, and
          scoring that as a breach would make the measure meaningless on the work that needs setting up.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${CARD} p-5`} aria-labelledby="spend-site-heading">
          <h2 id="spend-site-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Spend by site
          </h2>
          {reports.spendBySite.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              No site has enough projects in this window to be reported without singling one out.
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 text-xs">
              {reports.spendBySite.map(entry => (
                <li key={entry.label}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{entry.label}</span>
                    <span className="font-mono text-slate-600">
                      {formatMoney(entry.fundedMinor, currencyCode)} funded · {formatMoney(entry.paidMinor, currencyCode)} paid
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <Bar value={entry.fundedMinor} max={maxSite} label={formatMoney(entry.fundedMinor, currencyCode)} />
                  </div>
                  <p className="mt-0.5 text-slate-400">{entry.projects} project{entry.projects === 1 ? '' : 's'}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="spend-service-heading">
          <h2 id="spend-service-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Spend by service category
          </h2>
          {reports.spendByService.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              No category has enough projects in this window to be reported without singling one out.
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 text-xs">
              {reports.spendByService.map(entry => (
                <li key={entry.label}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{entry.label}</span>
                    <span className="font-mono text-slate-600">
                      {formatMoney(entry.fundedMinor, currencyCode)} funded · {formatMoney(entry.paidMinor, currencyCode)} paid
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <Bar value={entry.fundedMinor} max={maxService} label={formatMoney(entry.fundedMinor, currencyCode)} />
                  </div>
                  <p className="mt-0.5 text-slate-400">{entry.projects} project{entry.projects === 1 ? '' : 's'}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={`${CARD} p-5`} aria-labelledby="reliability-heading">
        <h2 id="reliability-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Provider reliability
        </h2>
        {reports.reliability.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            No provider has {reports.threshold} or more jobs in this window, so nothing is reported — a rate over one or
            two jobs would be a claim about a person rather than about their work.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 text-xs">
            {reports.reliability.map(provider => (
              <li key={provider.providerId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 p-3">
                <span className="font-semibold text-slate-800">{provider.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-slate-600">
                  <span>{provider.jobs} jobs</span>
                  <span>{provider.completed} completed</span>
                  <span>{provider.onTime} on time</span>
                  {provider.late > 0 ? <span className="font-semibold text-amber-800">{provider.late} late</span> : null}
                  {provider.disputed > 0 ? <span className={BADGE_SLATE}>{provider.disputed} disputed</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Counts of rows, not a score. This platform does not rate providers, and a composite index would be a number
          nobody could take apart when a provider asked why.
        </p>
      </section>
    </div>
  );
}
