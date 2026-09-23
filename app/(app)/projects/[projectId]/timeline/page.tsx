import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CARD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { TimelineSection } from '@/components/projects/ProjectFiles';
import { PendingButton } from '@/components/provider/ProviderControls';
import { FIELD } from '@/components/discovery/tokens';
import { getProject } from '@/features/projects/project';
import { getProjectTimeline } from '@/features/projects/files';

/**
 * /projects/[projectId]/timeline — the canonical record.
 *
 * ⚠️ THIS IS THE AUDIT LOG, NOT A SUMMARY OF ONE. Every entry is an `audit_events` row belonging to this project,
 * attributed to the party, the platform or the system that caused it, with the exact instant and the record it is
 * about. Chat is filtered out by the query, so nothing anybody said can be mistaken for something that happened.
 *
 * ⚠️ NOTHING HERE IS EDITABLE. There is no control to change an entry, and no command that could: a correction is a
 * later entry, which is what immutability means once it meets the real world.
 */
export const metadata: Metadata = {
  title: 'Project timeline',
  description: 'The factual record of one project.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ actor?: string; from?: string; to?: string; overrides?: string }>;

export default async function ProjectTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: SearchParams;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const { project, denied } = await getProject(projectId);
  if (denied || !project) notFound();

  const timeline = await getProjectTimeline(projectId);
  if (timeline.denied || timeline.unavailable) notFound();

  const from = query.from ? new Date(`${query.from}T00:00:00Z`).getTime() : null;
  const to = query.to ? new Date(`${query.to}T23:59:59Z`).getTime() : null;
  const filtered = timeline.events.filter(event => {
    if (query.actor && event.actorRole !== query.actor) return false;
    if (query.overrides === '1' && !event.isOverride) return false;
    if (from !== null && event.at && new Date(event.at).getTime() < from) return false;
    if (to !== null && event.at && new Date(event.at).getTime() > to) return false;
    return true;
  });

  return (
    <div className="grid gap-5">
      <section>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">The record</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          Everything that happened on this job, in the order the platform recorded it. These are audit entries:
          nobody can edit one, including platform staff, and the conversation between the parties is on the Messages
          tab rather than here.
        </p>
      </section>

      <form method="get" action={`/projects/${projectId}/timeline`} className={`${CARD} flex flex-wrap items-end gap-3 p-5`}>
        <div className="min-w-0 flex-1">
          <label htmlFor="actor" className={LABEL}>
            Caused by
          </label>
          <select id="actor" name="actor" defaultValue={query.actor ?? ''} className={FIELD}>
            <option value="">Anyone</option>
            <option value="customer">The customer</option>
            <option value="provider">The provider</option>
            <option value="platform">The platform</option>
            <option value="system">Automatic</option>
          </select>
        </div>
        <div>
          <label htmlFor="from" className={LABEL}>
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={query.from ?? ''} className={FIELD} />
        </div>
        <div>
          <label htmlFor="to" className={LABEL}>
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={query.to ?? ''} className={FIELD} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-slate-600">
          <input name="overrides" type="checkbox" value="1" defaultChecked={query.overrides === '1'} />
          Only platform and automatic entries
        </label>
        <PendingButton
          idle="Apply"
          pending="Applying…"
          className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        />
        {query.actor || query.from || query.to || query.overrides ? (
          <Link href={`/projects/${projectId}/timeline`} className={LINK_ARROW}>
            Clear
          </Link>
        ) : null}
      </form>

      <p className="flex flex-wrap items-center justify-between gap-3 text-xs leading-relaxed text-slate-500">
        <span>
          {filtered.length} of {timeline.events.length} entries. Timestamps are shown in your own timezone, with the
          zone named on each one.
        </span>
        <Link href={`/projects/${projectId}/timeline/export`} className={LINK_ARROW} download>
          Export audit log
        </Link>
      </p>

      <TimelineSection events={filtered} assignmentId={project.header.assignmentId} />
    </div>
  );
}
