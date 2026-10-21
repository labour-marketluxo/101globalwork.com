'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { SUPPORT_PATH } from '@/features/support/paths';
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  type SupportFailureCode,
} from '@/features/support/copy';

/**
 * The support workspace's writes.
 *
 * ⚠️ EVERY ACTION IS SCOPED BY THE COMMAND, NOT BY THE FORM. `case_id` arrives from the browser and could name
 * anybody's case; each command re-derives the caller and looks the case up through
 * `app_private.support_case_owned_by`, so a forged id gets the same "case not found" as a nonexistent one.
 * Nothing here is the authorisation — this file only decides which sentence comes back.
 *
 * ⚠️ ATTACHMENTS ARE STORED FIRST AND RECORDED SECOND. The browser uploads straight to storage under a policy
 * that only permits the caller's own folder; the command then writes the row, and it re-validates the path
 * shape rather than trusting it. An upload that fails leaves nothing behind; a row written first would leave a
 * link to a file that might never arrive.
 */

function failureCode(message: string): SupportFailureCode {
  if (message.includes('not authorized') || message.includes('authentication required')) return 'not_authorized';
  if (message.includes('case not found')) return 'not_found';
  if (message.includes('is closed')) return 'closed_case';
  if (message.includes('has not been resolved')) return 'not_resolved';
  if (message.includes('larger than 10 MB') || message.includes('no larger than 10 MB')) return 'attachment_too_large';
  if (message.includes('file type')) return 'attachment_type';
  if (message.includes('required') || message.includes('characters')) return 'bad_request';
  return 'unavailable';
}

/** Back to the case, preserving nothing else: the case page's own filters are its status, not a query string. */
function casePath(caseId: string, params: Record<string, string | number | undefined> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  const base = `${SUPPORT_PATH}/${caseId}`;
  return encoded ? `${base}?${encoded}` : base;
}

async function requireSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: SUPPORT_PATH }));
  return supabase;
}

export async function createSupportCaseAction(formData: FormData) {
  const supabase = await requireSession();

  const target = String(formData.get('target_id') ?? '').trim();
  const { data, error } = await supabase.rpc('create_support_case_command', {
    p_kind: String(formData.get('kind') ?? 'general'),
    p_subject: String(formData.get('subject') ?? '').trim(),
    p_body: String(formData.get('body') ?? '').trim(),
    p_target_id: target.length > 0 ? target : null,
  });

  if (error) redirect(casePath(SUPPORT_PATH, { failed: failureCode(error.message) }));

  const created = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const id = typeof created.id === 'string' ? created.id : '';
  if (!id) redirect(casePath(SUPPORT_PATH, { failed: 'unavailable' }));

  // The case page carries the confirmation rather than the list: the first thing somebody should see after
  // opening a case is the case, with its deadline and their own words on it.
  redirect(casePath(id, { saved: 'created' }));
}

export async function replyToSupportCaseAction(formData: FormData) {
  const supabase = await requireSession();
  const caseId = String(formData.get('case_id') ?? '');

  const { data, error } = await supabase.rpc('reply_to_support_case_command', {
    p_case_id: caseId,
    p_body: String(formData.get('body') ?? '').trim(),
  });
  if (error) redirect(casePath(caseId, { failed: failureCode(error.message) }));

  const result = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  redirect(casePath(caseId, { saved: result.reopened === true ? 'reopened' : 'replied' }));
}

export async function closeSupportCaseAction(formData: FormData) {
  const supabase = await requireSession();
  const caseId = String(formData.get('case_id') ?? '');
  const reason = String(formData.get('close_reason') ?? '').trim();

  const { error } = await supabase.rpc('close_my_support_case_command', {
    p_case_id: caseId,
    p_reason: reason.length > 0 ? reason : null,
  });
  if (error) redirect(casePath(caseId, { failed: failureCode(error.message) }));

  redirect(casePath(caseId, { saved: 'closed' }));
}

export async function submitSupportFeedbackAction(formData: FormData) {
  const supabase = await requireSession();
  const caseId = String(formData.get('case_id') ?? '');
  const rating = Number.parseInt(String(formData.get('rating') ?? ''), 10);
  const comment = String(formData.get('comment') ?? '').trim();

  const { error } = await supabase.rpc('submit_support_case_feedback_command', {
    p_case_id: caseId,
    p_rating: Number.isFinite(rating) ? rating : null,
    p_comment: comment.length > 0 ? comment : null,
  });
  if (error) redirect(casePath(caseId, { failed: failureCode(error.message) }));

  redirect(casePath(caseId, { saved: 'feedback' }));
}

export async function attachSupportFileAction(formData: FormData) {
  const supabase = await requireSession();
  const caseId = String(formData.get('case_id') ?? '');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(casePath(caseId, { failed: 'bad_request' }));
  }
  // Both rules are checked here as well as in the bucket and in the command: the bucket's limit is the last
  // line, and a visitor who picks a 40 MB photo deserves the answer without waiting for the upload.
  if (file.size > MAX_ATTACHMENT_BYTES) {
    redirect(casePath(caseId, { failed: 'attachment_too_large' }));
  }
  if (!ATTACHMENT_TYPES.includes(file.type)) {
    redirect(casePath(caseId, { failed: 'attachment_type' }));
  }

  const { data: account } = await supabase.from('accounts').select('id').maybeSingle();
  if (!account?.id) redirect(casePath(caseId, { failed: 'not_authorized' }));

  // The name is kept for the person reading the thread and sanitised for the path: a slash or a newline in a
  // file name would otherwise be a path segment, and the row would describe a file the policy refuses.
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'attachment';
  const objectPath = `${account.id}/${caseId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('support-attachments')
    .upload(objectPath, file, { upsert: false, contentType: file.type });
  if (uploadError) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[support] could not store the attachment: ${uploadError.message}`);
    }
    redirect(casePath(caseId, { failed: 'unavailable' }));
  }

  const { error } = await supabase.rpc('register_support_attachment_command', {
    p_case_id: caseId,
    p_object_path: objectPath,
    p_file_name: file.name.slice(0, 200),
    p_content_type: file.type,
    p_size_bytes: file.size,
  });
  if (error) redirect(casePath(caseId, { failed: failureCode(error.message) }));

  redirect(casePath(caseId, { saved: 'attached' }));
}
