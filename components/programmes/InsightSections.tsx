import { BarChart3, Info, TrendingUp } from '@/components/ui/icons';
import { BADGE_SLATE, CARD } from '@/components/discovery/tokens';
import { CellValue, PrivacyPanel, ProgrammeNotice, RateValue } from '@/components/programmes/ProgrammeChrome';
import { CREDENTIAL_KIND_COPY } from '@/features/programmes/copy';
import type { ProgrammeInsightsRead } from '@/features/programmes/programmes';

/**
 * The labour intelligence body.
 *
 * ⚠️ IT REPORTS WHAT IS MISSING AS WELL AS WHAT IS THERE. A distribution that quietly omits every category below
 * the threshold reads as a complete distribution, and a reader will draw a conclusion from the absence that the
 * platform never intended to publish. `cellsWithheld` is in the privacy panel, and each withheld row keeps its
 * category name with a withheld figure rather than disappearing.
 *
 * ⚠️ NOTHING HERE CAN BE USED TO REACH A PERSON. There are no worker rows, no pseudonyms, no ids and no free-text
 * filters: the dimensions are fixed server-side and every figure is a noised count over a group. The one shortcut
 * to an individual — a group of one — cannot be expressed.
 */
export function ProgrammeInsightsBody({ read }: { read: ProgrammeInsightsRead }) {
  return (
    <div className="grid gap-8">
      <section aria-labelledby="outcomes-heading" className="grid gap-3">
        <h2 id="outcomes-heading" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
          <TrendingUp aria-hidden="true" className="h-5 w-5 text-primary" />
          Outcomes
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className={`${CARD} p-5`}>
            <dt className="font-sans text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Completion
            </dt>
            <dd className="mt-1">
              <RateValue rate={read.outcomes.completion} />
            </dd>
            <dd className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Participants who completed, over those enrolled or active. Both are noised counts.
            </dd>
          </div>
          <div className={`${CARD} p-5`}>
            <dt className="font-sans text-[10px] font-bold tracking-wider text-slate-500 uppercase">Placement</dt>
            <dd className="mt-1">
              <RateValue rate={read.outcomes.placement} />
            </dd>
            <dd className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Participants placed on a project at least once, over those enrolled or active.
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="skills-heading" className="grid gap-3">
        <div>
          <h2 id="skills-heading" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <BarChart3 aria-hidden="true" className="h-5 w-5 text-primary" />
            Skill distribution
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            How many people in the pool record each skill. A worker can hold several skills, so these figures do not
            add up to the pool size, and they are each noised independently.
          </p>
        </div>

        {read.skills.length === 0 ? (
          <EmptyNote>No skills are recorded in this pool yet.</EmptyNote>
        ) : (
          <ul className={`${CARD} divide-y divide-solid divide-slate-100`}>
            {read.skills.map((row) => (
              <li key={row.skill} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-slate-800 capitalize">{row.skill}</span>
                <CellValue cell={row.workers} suffix="people" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="supply-heading" className="grid gap-3">
        <div>
          <h2 id="supply-heading" className="text-lg font-bold tracking-tight text-slate-900">
            Regional supply and market demand
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">{read.demand.scope}</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className={`${CARD} p-5`}>
            <h3 className="font-sans text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Supply — pool by region
            </h3>
            {read.regions.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No regions are recorded in this pool yet.</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {read.regions.map((row) => (
                  <li key={row.region} className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <span className="text-slate-800">{row.region}</span>
                    <CellValue cell={row.workers} suffix="people" />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`${CARD} p-5`}>
            <h3 className="font-sans text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Demand — open requests
            </h3>
            <div className="mt-2">
              <CellValue cell={read.demand.openRequests} suffix="open" />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Demand is published at market level and not per region, because the regions above are the
              institution&rsquo;s own labels and do not map to the platform&rsquo;s location catalogue. A per-region
              demand figure would be an invented join, and the platform would rather report less than report a
              number it made up.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="credentials-heading" className="grid gap-3">
        <h2 id="credentials-heading" className="text-lg font-bold tracking-tight text-slate-900">
          Credential coverage
        </h2>
        {read.credentials.length === 0 ? (
          <EmptyNote>No credentials are recorded against this pool yet.</EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${CARD} w-full min-w-[32rem] border-collapse text-left text-xs`}>
              <caption className="sr-only">Workers holding each credential kind, by decision state.</caption>
              <thead>
                <tr className="border-b border-solid border-slate-200">
                  <th scope="col" className="px-4 py-3 font-sans text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Kind
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-sans text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Verified
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-sans text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Pending
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-sans text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Rejected
                  </th>
                </tr>
              </thead>
              <tbody>
                {read.credentials.map((row) => (
                  <tr key={row.kind} className="border-b border-solid border-slate-100 last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-800">
                      {CREDENTIAL_KIND_COPY[row.kind] ?? row.kind}
                    </th>
                    <td className="px-4 py-3 text-right">
                      <CellValue cell={row.verified} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CellValue cell={row.pending} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CellValue cell={row.rejected} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="bands-heading" className="grid gap-3">
        <div>
          <h2 id="bands-heading" className="text-lg font-bold tracking-tight text-slate-900">
            Rate benchmark
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">{read.benchmarkNote}</p>
        </div>

        {read.bands.length === 0 ? (
          <EmptyNote>No placed work has an agreed value recorded yet.</EmptyNote>
        ) : (
          <ul className={`${CARD} divide-y divide-solid divide-slate-100`}>
            {read.bands.map((row) => (
              <li key={row.band} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-slate-800">{row.band}</span>
                <CellValue cell={row.engagements} suffix="engagements" />
              </li>
            ))}
          </ul>
        )}

        <ProgrammeNotice tone="info">
          <p className="font-semibold">What this page does not do</p>
          <p className="mt-1">
            The thresholds and the noise stop a small group being reported exactly. They cannot stop somebody who
            already knows everything about this pool except one person — no aggregate can — and they are not a
            substitute for the consent rules that govern the worker registry, where a person is a pseudonym until
            they say otherwise.
          </p>
        </ProgrammeNotice>
      </section>

      <PrivacyPanel privacy={read.privacy} />

      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          Read this page as a direction, not a ledger. Two visits will give two slightly different numbers for the
          same period, and that is the mechanism working rather than the data changing.{' '}
          <span className={BADGE_SLATE}>k-anonymity · Laplace</span>
        </span>
      </p>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">
      {children}
    </p>
  );
}
