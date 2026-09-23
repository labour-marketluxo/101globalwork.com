'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith, safeInternalPath } from '@/features/auth/post-auth';
import type { ProjectFailureCode } from '@/features/projects/failure-copy';

/**
 * The project workspace's writes.
 *
 * ⚠️ EVERY ONE OF THESE IS A THIN WRAPPER, AND THAT IS THE DESIGN. Authorisation, the state machine, the reorder
 * sentinel and the validation all live in the database commands, which is what lets the same rules apply to a page,
 * a queued replay or any future caller. What this module does is authenticate, map a refusal onto a code the page
 * can render words for, and send the caller back where they were.
 */

async function authedClient(next: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next }));
  return supabase;
}

function targetPath(formData: FormData, fallback: string): string {
  return safeInternalPath(String(formData.get('next') ?? ''), fallback);
}

function backTo(formData: FormData, params: Record<string, string>, fallback: string): never {
  const target = targetPath(formData, fallback);
  const [path, existing] = target.split('?');
  const query = new URLSearchParams(existing ?? '');
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const search = query.toString();
  redirect(search ? `${path}?${search}` : path);
}

/**
 * Map a database refusal onto the page's own words.
 *
 * The messages the commands raise are written for a developer; these codes are what the notice renders. A transition
 * refusal and a "task is complete" refusal get different sentences because they mean different things to the person
 * who pressed the button.
 */
function failureCode(message: string): ProjectFailureCode {
  const text = message.toLowerCase();
  if (text.includes('authentication required') || text.includes('active account required')) return 'not_authorized';
  if (text.includes('not authorized') || text.includes('forbidden') || text.includes('not found')) return 'not_authorized';
  if (text.includes('complete') && text.includes('history')) return 'completed';
  if (text.includes('cannot move a task') || text.includes('not allowed')) return 'transition';
  if (text.includes('invalid') || text.includes('required') || text.includes('must be') || text.includes('needs a')) {
    return 'bad_request';
  }
  return 'unavailable';
}

/**
 * `key: value` lines into the scope object.
 *
 * ⚠️ THE FORM SENDS LINES, NOT JSON, AND THIS BUILDS THE OBJECT. A textarea of JSON is a form that fails on one
 * missing brace with an error nobody can act on; a line per parameter is something a person can type on a phone.
 * A line without a colon is kept with an empty value rather than dropped, because silently losing half of what
 * somebody typed is worse than storing an empty one.
 */
function scopeFromLines(formData: FormData): Record<string, string> {
  const raw = String(formData.get('scope_lines') ?? '');
  const scope: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(':');
    const key = (separator === -1 ? trimmed : trimmed.slice(0, separator)).trim().slice(0, 60);
    const value = separator === -1 ? '' : trimmed.slice(separator + 1).trim().slice(0, 400);
    if (key) scope[key] = value;
  }
  return scope;
}

/** One criterion per line, each a label with `done: false` — a criterion is met by submitting, not by ticking. */
function criteriaFromLines(formData: FormData): { label: string; done: boolean }[] {
  const existing = String(formData.get('criteria_lines') ?? '');
  const criteria: { label: string; done: boolean }[] = [];
  for (const line of existing.split('\n')) {
    const label = line.trim().slice(0, 200);
    if (!label) continue;
    criteria.push({ label, done: line.trim().startsWith('[x]') || line.trim().toLowerCase().startsWith('done:') });
  }
  return criteria.slice(0, 40);
}

export async function addProjectStageAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/work`);
  const { error } = await supabase.rpc('add_project_stage_command', {
    p_assignment_id: assignmentId,
    p_title: String(formData.get('title') ?? '').trim(),
    p_description: String(formData.get('description') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/work`);
  backTo(formData, { added: 'stage' }, `/projects/${assignmentId}/work`);
}

export async function addProjectTaskAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/work`);
  const { error } = await supabase.rpc('add_project_task_command', {
    p_assignment_id: assignmentId,
    p_stage_id: String(formData.get('stage_id') ?? ''),
    p_title: String(formData.get('title') ?? '').trim(),
    p_description: String(formData.get('description') ?? '').trim() || null,
    p_assignee_account_id: String(formData.get('assignee_account_id') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/work`);
  backTo(formData, { added: 'task' }, `/projects/${assignmentId}/work`);
}

export async function updateProjectTaskAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const taskId = String(formData.get('task_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/tasks/${taskId}`);
  const { error } = await supabase.rpc('update_project_task_command', {
    p_task_id: taskId,
    p_title: String(formData.get('title') ?? '').trim(),
    p_description: String(formData.get('description') ?? '').trim() || null,
    p_scope_parameters: scopeFromLines(formData),
    // The page pre-fills this box with the criteria already on the task, so an empty box means "no criteria" rather
    // than "wipe the checklist" — the definition of done is the one thing here worth being careful with.
    p_completion_criteria: criteriaFromLines(formData),
    p_scheduled_start: String(formData.get('scheduled_start') ?? '').trim() || null,
    p_scheduled_end: String(formData.get('scheduled_end') ?? '').trim() || null,
  });
  if (error) {
    return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/tasks/${taskId}`);
  }
  backTo(formData, { saved: 'task' }, `/projects/${assignmentId}/tasks/${taskId}`);
}

/**
 * The state machine, from the page.
 *
 * ⚠️ NO OPTIMISTIC UI, AND NOTHING IS RENDERED FROM THE FORM. The command decides whether the move is legal for this
 * caller, and the page re-reads the task afterwards — so the status shown is always the status stored.
 */
export async function setProjectTaskStatusAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const taskId = String(formData.get('task_id') ?? '');
  const status = String(formData.get('status') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/tasks/${taskId}`);
  const { error } = await supabase.rpc('set_project_task_status_command', {
    p_task_id: taskId,
    p_status: status,
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) {
    return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/tasks/${taskId}`);
  }
  backTo(formData, { moved: status }, `/projects/${assignmentId}/tasks/${taskId}`);
}

export async function moveProjectTaskAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/work`);
  const { error } = await supabase.rpc('move_project_task_command', {
    p_task_id: String(formData.get('task_id') ?? ''),
    p_direction: String(formData.get('direction') ?? ''),
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/work`);
  backTo(formData, { moved: 'task' }, `/projects/${assignmentId}/work`);
}

export async function sendProjectMessageAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/messages`);
  const { error } = await supabase.rpc('send_project_message_command', {
    p_assignment_id: assignmentId,
    p_context_kind: String(formData.get('context_kind') ?? 'project'),
    p_context_id: String(formData.get('context_id') ?? '').trim() || null,
    p_body: String(formData.get('body') ?? '').trim(),
    p_attachment_evidence_id: String(formData.get('attachment_evidence_id') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/messages`);
  backTo(formData, { sent: '1' }, `/projects/${assignmentId}/messages`);
}

/**
 * Flag an evidence item.
 *
 * ⚠️ A FLAG IS A STATEMENT BY A PARTY, NOT A VERDICT. The platform records who said what, when, and why; it does
 * not decide that the photograph is wrong. That is why the gallery shows the flag beside the item rather than
 * removing it, and why an admin cannot raise one.
 */
export async function flagEvidenceAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/evidence`);
  const { error } = await supabase.rpc('flag_project_evidence_command', {
    p_evidence_id: String(formData.get('evidence_id') ?? ''),
    p_reason_code: String(formData.get('reason_code') ?? 'other'),
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/evidence`);
  backTo(formData, { flagged: '1' }, `/projects/${assignmentId}/evidence`);
}

export async function withdrawEvidenceFlagAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/evidence`);
  const { error } = await supabase.rpc('withdraw_project_evidence_flag_command', {
    p_flag_id: String(formData.get('flag_id') ?? ''),
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/evidence`);
  backTo(formData, { flagged: 'withdrawn' }, `/projects/${assignmentId}/evidence`);
}

/**
 * Register a document version.
 *
 * ⚠️ THE FILE IS ALREADY IN STORAGE WHEN THIS RUNS. The browser uploads to the project's document prefix — checked
 * by the storage policy, not by this action — and then posts the path here. A new version is a new row; nothing in
 * this path can update or delete an earlier one.
 */
export async function addProjectDocumentAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/documents`);
  const { error } = await supabase.rpc('add_project_document_command', {
    p_assignment_id: assignmentId,
    p_title: String(formData.get('title') ?? '').trim(),
    p_document_type: String(formData.get('document_type') ?? 'other'),
    p_storage_path: String(formData.get('storage_path') ?? '').trim(),
    p_access_scope: String(formData.get('access_scope') ?? 'participants'),
    p_mime_type: String(formData.get('mime_type') ?? '').trim() || null,
    p_size_bytes: String(formData.get('size_bytes') ?? '').trim() ? Number(formData.get('size_bytes')) : null,
    p_document_group_id: String(formData.get('document_group_id') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/documents`);
  backTo(formData, { document: 'added' }, `/projects/${assignmentId}/documents`);
}

export async function decideProjectDocumentAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/documents`);
  const { error } = await supabase.rpc('decide_project_document_command', {
    p_document_id: String(formData.get('document_id') ?? ''),
    p_decision: String(formData.get('decision') ?? 'approved'),
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/documents`);
  backTo(formData, { document: 'decided' }, `/projects/${assignmentId}/documents`);
}

// ── Change requests, cases, and the escrow checkpoint ─────────────────────────────────────────

/** The baseline, the deltas and the decision are all taken from rows; the form supplies only the proposal. */
export async function createChangeRequestAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/changes`);
  const priceRaw = String(formData.get('proposed_total_minor') ?? '').trim();
  const scheduleRaw = String(formData.get('proposed_scheduled_start') ?? '').trim();
  const evidenceIds = formData.getAll('evidence_ids').map(value => String(value)).filter(Boolean);

  const { error } = await supabase.rpc('create_project_change_request_command', {
    p_assignment_id: assignmentId,
    p_title: String(formData.get('title') ?? '').trim(),
    p_description: String(formData.get('description') ?? '').trim(),
    p_change_kind: String(formData.get('change_kind') ?? 'scope'),
    // Money comes from the form in MAJOR units and is stored in minor ones, the same as every other price here.
    p_proposed_total_minor: priceRaw ? Math.round(Number(priceRaw) * 100) : null,
    p_proposed_scheduled_start: scheduleRaw || null,
    p_evidence_ids: evidenceIds,
    p_submit: String(formData.get('intent') ?? 'propose') === 'propose',
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/changes`);
  backTo(formData, { change: 'created' }, `/projects/${assignmentId}/changes`);
}

export async function decideChangeRequestAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/changes`);
  const { error } = await supabase.rpc('decide_project_change_request_command', {
    p_change_id: String(formData.get('change_id') ?? ''),
    p_decision: String(formData.get('decision') ?? 'rejected'),
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/changes`);
  backTo(formData, { change: String(formData.get('decision') ?? 'decided') }, `/projects/${assignmentId}/changes`);
}

export async function withdrawChangeRequestAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/changes`);
  const { error } = await supabase.rpc('withdraw_project_change_request_command', {
    p_change_id: String(formData.get('change_id') ?? ''),
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/changes`);
  backTo(formData, { change: 'withdrawn' }, `/projects/${assignmentId}/changes`);
}

/**
 * Open a case.
 *
 * ⚠️ THE HOLD IS DECIDED BY THE KIND, IN THE DATABASE. A safety, privacy or financial case starts under a legal hold
 * that stops a self-service payout; the form cannot ask for one and cannot skip one.
 */
export async function openProjectIssueAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/milestones`);
  const dueRaw = String(formData.get('response_due_at') ?? '').trim();
  const { error } = await supabase.rpc('open_project_issue_command', {
    p_assignment_id: assignmentId,
    p_kind: String(formData.get('kind') ?? 'operational'),
    p_summary: String(formData.get('summary') ?? '').trim(),
    p_response_due_at: dueRaw ? new Date(dueRaw).toISOString() : null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/milestones`);
  backTo(formData, { case: 'opened' }, `/projects/${assignmentId}/milestones`);
}

export async function respondToIssueAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const issueId = String(formData.get('issue_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/issues/${issueId}`);
  const { error } = await supabase.rpc('respond_to_project_issue_command', {
    p_issue_id: issueId,
    p_kind: String(formData.get('kind') ?? 'response'),
    p_body: String(formData.get('body') ?? '').trim(),
    p_evidence_id: String(formData.get('evidence_id') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/issues/${issueId}`);
  backTo(formData, { case: 'responded' }, `/projects/${assignmentId}/issues/${issueId}`);
}

export async function setIssueStatusAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const issueId = String(formData.get('issue_id') ?? '');
  const supabase = await authedClient(`/projects/${assignmentId}/issues/${issueId}`);
  const { error } = await supabase.rpc('set_project_issue_status_command', {
    p_issue_id: issueId,
    p_status: String(formData.get('status') ?? 'escalated'),
    p_resolution: String(formData.get('resolution') ?? '').trim() || null,
  });
  if (error) return backTo(formData, { failed: failureCode(error.message) }, `/projects/${assignmentId}/issues/${issueId}`);
  backTo(formData, { case: String(formData.get('status') ?? 'moved') }, `/projects/${assignmentId}/issues/${issueId}`);
}
