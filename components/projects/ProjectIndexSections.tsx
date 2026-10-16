import Link from 'next/link';
import { ArrowRight, CalendarClock, HardHat, MapPin, UserRound } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, LINK_ARROW } from '@/components/discovery/tokens';
import { formatInstant } from '@/features/customer/bookings';
import { isProjectOpen, type ProjectListRow } from '@/features/projects/list';
import { PROJECT_STATE_COPY } from '@/features/projects/project';

/**
 * The pieces of the projects index — all server components.
 *
 * ⚠️ THE CARD SAYS WHICH WORKSPACE THE JOB LIVES IN, TWICE. The icon tile carries the same two glyphs the
 * workspace switcher uses for Customer and Provider, and the caption says "you commissioned this" / "you are
 * delivering this" in words. A card that only said the counterparty's name would leave the reader working out
 * which end of the job they were on, and one account can be on both ends of different jobs.
 *
 * ⚠️ THE BRAND RULE ACROSS THE TOP IS TWO HOUSE COLOURS DOING TWO JOBS, NOT DECORATION. Amber leads it because
 * amber is this product's signal for the party-facing action, the same way the navbar's brand mark pairs a deep
 * teal tile with an amber glyph; the teal carries the rest. It also gives three cards in a row a common top
 * edge, which is what stops a grid of white panels reading as a table.
 *
 * ⚠️ AMBER IS THE OPEN STATE AND SLATE IS THE CLOSED ONE. `isProjectOpen` decides, so the chip agrees with the
 * ordering of the list above it; amber here means "this is still moving", never "look at me".
 */

const SIDE: Record<
  ProjectListRow['side'],
  { label: string; icon: typeof UserRound }
> = {
  customer: { label: 'You commissioned this', icon: UserRound },
  provider: { label: 'You are delivering this', icon: HardHat },
};

export function ProjectCard({ row }: { row: ProjectListRow }) {
  const side = SIDE[row.side];
  const SideIcon = side.icon;
  const state = PROJECT_STATE_COPY[row.state] ?? row.state;

  return (
    <li className="flex">
      <Link
        href={`/app/projects/${row.assignmentId}`}
        className={`${CARD} group flex h-full w-full flex-col overflow-hidden no-underline transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md`}
      >
        {/* The rule: an amber lead-in, then the deep teal that every signed-in surface is built on. */}
        <span aria-hidden="true" className="flex h-1 w-full shrink-0">
          <span className="h-full w-12 bg-secondary" />
          <span className="h-full flex-1 bg-primary" />
        </span>

        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-amber-500 transition-colors group-hover:bg-primary-dark"
            >
              <SideIcon className="h-5 w-5" />
            </span>
            <span className={isProjectOpen(row) ? BADGE_AMBER : BADGE_SLATE}>{state}</span>
          </div>

          <p className="mt-4 line-clamp-2 text-sm font-bold tracking-tight text-slate-900">{row.label}</p>
          <p className="mt-1.5 text-xs text-slate-500">
            {side.label}
            {row.counterparty ? ` · ${row.counterparty}` : ''}
          </p>

          {/* `mt-auto` pins the meta block to the bottom, so three cards in a row line up however long the
              labels are — the grid's whole reason for existing is that they can be compared at a glance. */}
          <div className="mt-auto border-t border-solid border-slate-200 pt-3.5">
            <div className="flex flex-col gap-1.5">
              {row.locationName ? (
                <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                  <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-primary/60" />
                  {row.locationName}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                <CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0 text-primary/60" />
                {row.scheduledStart
                  ? `${formatInstant(row.scheduledStart, row.scheduleTimezone ?? 'UTC')}${row.scheduleTimezone ? '' : ' (UTC)'}`
                  : 'No time agreed yet'}
              </span>
            </div>

            {/* ⚠️ THE CARD'S ONE ACTION SITS IN ITS BOTTOM-RIGHT CORNER, ON ITS OWN ROW. The meta above stays
                flush left so three cards in a row read as a column of the same two facts; the link is kept off
                that row so a long area name cannot crowd it at the narrow end of the third column. */}
            <div className="mt-3 flex justify-end">
              <span className={LINK_ARROW}>
                Open project
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

/**
 * The empty state.
 *
 * ⚠️ IT DOES NOT REPEAT THE HERO'S ACTION. "Post a request" already stands in the amber band above, and a second
 * copy of the same button in the body is how a page ends up with two primary actions and no hierarchy. These two
 * links go where this list cannot: the requests that have not become projects yet, and the jobs held as a
 * provider.
 */
export function ProjectsEmpty() {
  return (
    <section className={`${CARD} border-primary-subtle bg-primary-surface p-8`}>
      <h2 className="text-base font-bold tracking-tight text-primary-dark">No projects yet</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-700">
        A project starts when a quote is accepted. From that moment the customer and the provider share one page
        for the job — the plan, the messages, the evidence, the documents and the money — and it appears here for
        both of them.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link href="/app/customer/requests" className={LINK_ARROW}>
          Requests you have posted
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
        <Link href="/app/provider/work" className={LINK_ARROW}>
          Jobs you are delivering
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
