import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProject } from '@/features/projects/project';

/**
 * Serve one document version.
 *
 * ⚠️ A SIGNED URL, MINTED PER REQUEST, EXPIRING IN A MINUTE. The bucket is private and the storage policy decides
 * whether this caller may read the object at all — a document marked provider-only fails there for a customer, so a
 * guessed id reaches nothing. Nothing is cached and nothing is proxied: the redirect hands over a temporary link and
 * stops.
 *
 * ⚠️ THE CALLER MUST BE A PARTICIPANT. The project read is what establishes that, before any storage call happens.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
  const { projectId, documentId } = await params;
  const { project, denied } = await getProject(projectId);
  if (denied || !project) {
    return new Response('Not found.', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const supabase = await createSupabaseServerClient();
  const { data: document, error } = await supabase
    .from('project_documents')
    .select('storage_path,mime_type')
    .eq('id', documentId)
    .eq('assignment_id', projectId)
    .maybeSingle();

  if (error || !document) {
    return new Response('That document is not on this project.', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const inline = new URL(request.url).searchParams.get('inline') === '1';
  const { data: signed, error: signError } = await supabase.storage
    .from('work-evidence')
    .createSignedUrl(document.storage_path, 60, inline ? { download: false } : { download: true });

  if (signError || !signed?.signedUrl) {
    // The storage policy is the gate: a refusal here means this caller may not read this object.
    return new Response('That file is not available to you.', { status: 403, headers: { 'content-type': 'text/plain' } });
  }

  redirect(signed.signedUrl);
}
