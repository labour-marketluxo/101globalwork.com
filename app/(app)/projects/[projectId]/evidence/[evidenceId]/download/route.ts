import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProject } from '@/features/projects/project';

/**
 * Serve one evidence file.
 *
 * ⚠️ THE SAME SHAPE AS THE DOCUMENT ROUTE, FOR THE SAME REASON. Evidence lives in the private bucket under a path the
 * storage policy checks against the assignment, so a signed URL is the only way to it and the participant check
 * happens before any of that.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; evidenceId: string }> },
) {
  const { projectId, evidenceId } = await params;
  const { project, denied } = await getProject(projectId);
  if (denied || !project) {
    return new Response('Not found.', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const supabase = await createSupabaseServerClient();
  const { data: evidence, error } = await supabase
    .from('work_evidence')
    .select('storage_object_path')
    .eq('id', evidenceId)
    .eq('assignment_id', projectId)
    .maybeSingle();

  if (error || !evidence?.storage_object_path) {
    return new Response('That file is not on this project.', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const inline = new URL(request.url).searchParams.get('inline') === '1';
  const { data: signed, error: signError } = await supabase.storage
    .from('work-evidence')
    .createSignedUrl(evidence.storage_object_path, 60, inline ? { download: false } : { download: true });

  if (signError || !signed?.signedUrl) {
    return new Response('That file is not available to you.', { status: 403, headers: { 'content-type': 'text/plain' } });
  }

  redirect(signed.signedUrl);
}
