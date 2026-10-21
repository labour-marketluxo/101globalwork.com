import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProject } from '@/features/projects/project';

/**
 * The audit log, as a CSV.
 *
 * ⚠️ IT EXPORTS THE SAME ROWS THE PAGE SHOWS, FROM THE SAME COMMAND. A second implementation of the timeline would
 * be a second answer to "what happened", and the day the two disagree is the day one of them is evidence.
 *
 * ⚠️ AN EXPORT NEEDS NO EXTRA PERMISSION BEYOND BEING A PARTY. Both parties are entitled to the record of their own
 * job; the command already refuses anybody else, and this route asks the same command.
 *
 * ⚠️ NO CHAT, AND NOTHING EDITABLE. The query excludes message events, and the file is a copy — the record itself
 * cannot be changed by exporting it.
 */

function csvCell(value: string | null): string {
  return `"${(value ?? '').replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, denied } = await getProject(projectId);
  if (denied || !project) {
    return new Response('Not found.', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_project_timeline_command', { p_assignment_id: projectId });
  if (error) {
    return new Response('The record could not be read.', { status: 503, headers: { 'content-type': 'text/plain' } });
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  if (raw.allowed !== true) {
    return new Response('Not found.', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  const events = Array.isArray(raw.events) ? (raw.events as Record<string, unknown>[]) : [];

  const lines = [['timestamp_utc', 'caused_by', 'event', 'record', 'record_id', 'reason', 'platform_or_automatic'].join(',')];
  for (const event of events) {
    lines.push(
      [
        csvCell(event.at ? String(event.at) : ''),
        csvCell(event.actor_role ? String(event.actor_role) : ''),
        csvCell(event.description ? String(event.description) : ''),
        csvCell(event.resource_type ? String(event.resource_type) : ''),
        csvCell(event.resource_id ? String(event.resource_id) : ''),
        csvCell(event.reason_code ? String(event.reason_code) : ''),
        csvCell(event.is_override === true ? 'yes' : 'no'),
      ].join(','),
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="project-timeline-${projectId.slice(0, 8)}-${today}.csv"`,
      // A private record: never cached.
      'cache-control': 'no-store, private',
    },
  });
}
