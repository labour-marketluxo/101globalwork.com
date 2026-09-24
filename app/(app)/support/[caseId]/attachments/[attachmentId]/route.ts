import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * One case attachment — /support/[caseId]/attachments/[attachmentId]
 *
 * ⚠️ THE FILE IS RESOLVED THROUGH THE CASE, NOT BY ITS PATH. The command returns the object path only when the
 * attachment belongs to a case the caller owns, so a guessed attachment id gets a 404 and a guessed storage
 * path never reaches storage at all. The storage policy is the second line: the bucket is private, and the
 * only objects a session may read are inside its own account folder.
 *
 * ⚠️ `Content-Disposition: attachment` ALWAYS. These are files somebody else uploaded — a PDF, a photograph of
 * damage, a spreadsheet of amounts — and rendering one inline is how a support thread becomes an execution
 * surface. Combined with `nosniff` and `no-store`, the browser saves the bytes instead of interpreting them.
 *
 * ⚠️ THE FILE NAME IS NOT TRUSTED IN THE HEADER. It comes from the uploader, so it is stripped of quotes,
 * newlines and control characters before it goes into a response header, and it is sent twice: once as a
 * plain-ASCII fallback and once RFC 5987 encoded, which is what non-Latin names need.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string; attachmentId: string }> },
) {
  const { attachmentId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Not signed in', { status: 401 });

  const { data, error } = await supabase.rpc('get_my_support_attachment_command', {
    p_attachment_id: attachmentId,
  });

  if (error) {
    // "Not found" covers both a missing attachment and somebody else's, which is the same statement the case
    // page makes for the same reason. Nothing about a refusal is leaked in the status line either.
    if (process.env.NODE_ENV !== 'production' && !error.message.includes('not found')) {
      console.warn(`[support] could not resolve the attachment: ${error.message}`);
    }
    return new Response('Not found', { status: 404 });
  }

  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const objectPath = typeof record.objectPath === 'string' ? record.objectPath : null;
  if (!objectPath) return new Response('Not found', { status: 404 });

  const { data: file, error: downloadError } = await supabase.storage
    .from('support-attachments')
    .download(objectPath);
  if (downloadError || !file) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[support] could not read the stored attachment: ${downloadError?.message ?? 'no data'}`);
    }
    return new Response('Not found', { status: 404 });
  }

  const rawName = typeof record.fileName === 'string' && record.fileName.trim().length > 0 ? record.fileName : 'attachment';
  const asciiName = rawName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_').slice(0, 120);

  return new Response(await file.arrayBuffer(), {
    headers: {
      'Content-Type': typeof record.contentType === 'string' ? record.contentType : 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
