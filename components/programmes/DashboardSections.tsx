import Link from 'next/link';
import { Users, Wallet } from '@/components/ui/icons';
import { BADGE_SLATE, CARD, LINK_ARROW } from '@/components/discovery/tokens';
import { CellValue, PrivacyPanel, ProgrammeNotice, RateValue } from '@/components/programmes/ProgrammeChrome';
import { COHORT_STATUS_COPY, formatMinor } from '@/features/programmes/copy';
import type { ProgrammeDashboardRead } from '@/features/programmes/programmes';

/**
 * The programme dashboard's body.
 *
 * ⚠️ THE PAGE IS SPLIT IN TWO BY KIND OF FIGURE, AND THE SPLIT IS VISIBLE. Participation counts, cohort sizes and
 * per-project placements are measurements of people: thresholded, noised, and rendered with their suppression
 * state. Budgets, cohort capacity, project titles and dates are the institution's own administrative record:
 * exact, because noising them would make the dashboard useless while protecting nobody. Mixing them in a single
 * table without saying which is which is how an approximate count gets quoted as an audited one.
 *
 * ⚠️ NO CHART. A bar drawn from a noised count invites exactly the arithmetic the noise exists to prevent — people
 * compare bar lengths, and two bars that differ by one rounding step mean nothing. The figures are printed as
 * figures, with their tildes.
 */
export function ProgrammeDashboardBody({ read }: { read: ProgrammeDashboardRead }) {
  const { participation, programme } = read;

  return (
    <div className="grid gap-8">
      <section aria-labelledby="participation-heading" className="grid gap-4">
        <div>
          <h2 id="participation-heading" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Users aria-hidden="true" className="h-5 w-5 text-primary" />
            Participation
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Counts of people, each computed from a group of at least the minimum below and noised before it is
            shown. A withheld figure means the group was too small to report — the platform does not say how small.
          </p>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Enrolled" cell={participation.enrolled} />
          <Stat label="Active" cell={participation.active} />
          <Stat label="Completed" cell={participation.completed} />
          <Stat label="Withdrawn" cell={participation.withdrawn} />
          <div className={`${CARD} p-4 sm:col-span-2`}>
            <dt className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Completion progress
            </dt>
            <dd className="mt-1">
              <RateValue rate={participation.progress} />
            </dd>
            <dd className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Completed over enrolled. Computed from the two noised counts, so it is an approximate percentage and
              not a like-for-like comparison with another programme&rsquo;s.
            </dd>
          </div>
        </dl>

        <ProgrammeNotice tone="info">
          <p>{read.advisory}</p>
        </ProgrammeNotice>
      </section>

      <section aria-labelledby="cohorts-heading" className="grid gap-3">
        <h2 id="cohorts-heading" className="text-lg font-bold tracking-tight text-slate-900">
          Cohorts
          <span className="ml-2 font-mono text-xs font-normal text-slate-500">{read.cohorts.length}</span>
        </h2>

        {read.cohorts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">
            No cohorts are defined. Cohort capacity and dates are the institution&rsquo;s own administrative record
            and would be shown exactly; the number of people in one is a measurement and would be noised.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${CARD} w-full min-w-[40rem] border-collapse text-left text-xs`}>
              <caption className="sr-only">
                Cohorts, with planned capacity shown exactly and participant counts noised and thresholded.
              </caption>
              <thead>
                <tr className="border-b border-solid border-slate-200">
                  <Th>Cohort</Th>
                  <Th>Status</Th>
                  <Th align="right">Capacity (planned)</Th>
                  <Th align="right">Participants</Th>
                  <Th align="right">Completed</Th>
                  <Th align="right">Progress</Th>
                </tr>
              </thead>
              <tbody>
                {read.cohorts.map((cohort) => (
                  <tr key={cohort.id} className="border-b border-solid border-slate-100 last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-800">
                      {cohort.name}
                      {cohort.startsOn ? (
                        <span className="mt-0.5 block font-mono text-[10px] font-normal text-slate-500">
                          {cohort.startsOn}
                          {cohort.endsOn ? ` → ${cohort.endsOn}` : ''}
                        </span>
                      ) : null}
                    </th>
                    <td className="px-4 py-3">
                      <span className={BADGE_SLATE}>{COHORT_STATUS_COPY[cohort.status] ?? cohort.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {cohort.capacity ?? <span className="text-slate-400">not set</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CellValue cell={cohort.size} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CellValue cell={cohort.completed} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RateValue rate={cohort.progress} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="projects-heading" className="grid gap-3">
        <div>
          <h2 id="projects-heading" className="text-lg font-bold tracking-tight text-slate-900">
            Linked projects
            <span className="ml-2 font-mono text-xs font-normal text-slate-500">{read.projects.length}</span>
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            A project appears here when one of its parties brought this programme onto it — an institution cannot
            attach itself to somebody&rsquo;s job. The number of programme workers placed on each is a measurement
            and is noised; the project&rsquo;s own name and state are not.
          </p>
        </div>

        {read.projects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">
            No projects are linked to this programme yet.
          </p>
        ) : (
          <ul className="grid gap-3">
            {read.projects.map((project) => (
              <li key={project.assignmentId} className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-4`}>
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-tight text-slate-900">{project.label}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                    Project {project.status}
                    {project.allocatedAt ? ` · first placement ${project.allocatedAt.slice(0, 10)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-right">
                    <span className="block font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Workers placed
                    </span>
                    <CellValue cell={project.allocated} />
                  </span>
                  <Link href={`/projects/${project.assignmentId}`} className={LINK_ARROW}>
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="budget-heading" className="grid gap-3">
        <div>
          <h2 id="budget-heading" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Wallet aria-hidden="true" className="h-5 w-5 text-primary" />
            Allocated budget
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Shown exactly, because a grant allocation is the institution&rsquo;s own financial record and describes no
            individual. It is the one category of figure on this page that is not a measurement of people.
          </p>
        </div>

        <div className={`${CARD} p-5`}>
          <p className="font-mono text-2xl font-bold tracking-tight text-slate-900">
            {programme?.budgetMinor != null && programme.currencyCode
              ? formatMinor(programme.budgetMinor, programme.currencyCode)
              : 'No total allocation recorded'}
          </p>
          {programme?.fundingSource ? (
            <p className="mt-1 text-xs text-slate-500">Funded by {programme.fundingSource}</p>
          ) : null}

          {read.budget.lines.length > 0 ? (
            <ul className="mt-4 grid gap-2 border-t border-solid border-slate-200 pt-4">
              {read.budget.lines.map((line) => (
                <li key={`${line.label}-${line.allocatedOn ?? ''}`} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="text-slate-700">
                    {line.label}
                    {line.note ? <span className="ml-2 text-slate-500">{line.note}</span> : null}
                  </span>
                  <span className="font-mono text-slate-800">
                    {formatMinor(line.amountMinor, line.currencyCode)}
                    {line.allocatedOn ? <span className="ml-2 text-[11px] text-slate-500">{line.allocatedOn}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              No itemised allocations are recorded. The total above is the figure on the programme record.
            </p>
          )}
        </div>
      </section>

      <PrivacyPanel privacy={read.privacy} />
    </div>
  );
}

function Stat({ label, cell }: { label: string; cell: import('@/features/programmes/privacy').PrivacyCell }) {
  return (
    <div className={`${CARD} p-4`}>
      <dt className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1">
        <CellValue cell={cell} />
      </dd>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}
