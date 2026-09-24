'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { programmeWorkersPath } from '@/features/programmes/paths';
import type { ProgrammeFailureCode } from '@/features/programmes/copy';

/**
 * The programme workspace's writes.
 *
 * ⚠️ NONE OF THESE ACTIONS DECIDES ANYTHING PRIVACY-RELATED, AND THAT IS THE POINT. The threshold, the noise and
 * the consent rule are all inside the database — a page cannot choose a smaller group, ask for a name, or record a
 * consent on somebody's behalf. What is here maps the database's refusal onto a sentence.
 *
 * ⚠️ THE ENROL ACTION STORES AN IDENTITY AND MUST NOT ECHO IT BACK. The response the page shows is the pseudonym;
 * the name the steward just typed is not re-rendered by the platform, because the rule is that a name is only
 * visible under a consent and a steward does not have one yet.
 */

function failureCode(message: string): ProgrammeFailureCode {
  if (message.includes('already enrolled')) return 'duplicate_worker';
  if (message.includes('only they can consent') || message.includes('cannot grant consent')) return 'consent_withheld';
  if (message.includes('no active consent')) return 'no_consent';
  if (message.includes('not authorized') || message.includes('authentication required')) return 'not_authorized';
  if (message.includes('not found') || message.includes('not linked')) return 'not_found';
  return 'bad_request';
}

function backWith(programmeId: string, params: Record<string, string | number | undefined>): string {
  const base = programmeWorkersPath(programmeId);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `${base}?${encoded}` : base;
}

async function requireSession(programmeId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: programmeWorkersPath(programmeId) }));
  return supabase;
}

/** Skills arrive as one field, comma separated, which is how a person types them. */
function skillsFrom(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(',')
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
}

export async function enrolWorkerAction(formData: FormData) {
  const programmeId = String(formData.get('programme_id') ?? '');
  const supabase = await requireSession(programmeId);

  const cohortId = String(formData.get('cohort_id') ?? '').trim();
  const email = String(formData.get('contact_email') ?? '').trim();

  const { error } = await supabase.rpc('enrol_programme_worker_command', {
    p_programme_id: programmeId,
    p_legal_name: String(formData.get('legal_name') ?? '').trim(),
    p_contact_email: email.length > 0 ? email : null,
    p_region_label: String(formData.get('region_label') ?? '').trim() || null,
    p_skills: skillsFrom(formData.get('skills')),
    p_worker_account_id: null,
    p_cohort_id: cohortId.length > 0 ? cohortId : null,
  });

  if (error) redirect(backWith(programmeId, { failed: failureCode(error.message) }));
  redirect(backWith(programmeId, { saved: 'enrolled' }));
}

export async function recordCredentialAction(formData: FormData) {
  const programmeId = String(formData.get('programme_id') ?? '');
  const supabase = await requireSession(programmeId);

  const issued = String(formData.get('issued_on') ?? '').trim();
  const expires = String(formData.get('expires_on') ?? '').trim();

  const { error } = await supabase.rpc('record_programme_credential_command', {
    p_programme_id: programmeId,
    p_worker_id: String(formData.get('worker_id') ?? ''),
    p_kind: String(formData.get('kind') ?? 'identity'),
    p_reference: String(formData.get('reference') ?? '').trim() || null,
    p_issued_on: issued.length > 0 ? issued : null,
    p_expires_on: expires.length > 0 ? expires : null,
    p_decision: String(formData.get('decision') ?? 'pending'),
    p_note: String(formData.get('decision_note') ?? '').trim() || null,
  });

  if (error) redirect(backWith(programmeId, { failed: failureCode(error.message) }));
  redirect(backWith(programmeId, { saved: 'credential' }));
}

export async function assignWorkerAction(formData: FormData) {
  const programmeId = String(formData.get('programme_id') ?? '');
  const supabase = await requireSession(programmeId);

  const { error } = await supabase.rpc('assign_programme_worker_command', {
    p_programme_id: programmeId,
    p_worker_id: String(formData.get('worker_id') ?? ''),
    p_assignment_id: String(formData.get('assignment_id') ?? ''),
    p_role_label: String(formData.get('role_label') ?? '').trim(),
  });

  if (error) redirect(backWith(programmeId, { failed: failureCode(error.message) }));
  redirect(backWith(programmeId, { saved: 'allocated' }));
}

export async function recordConsentAction(formData: FormData) {
  const programmeId = String(formData.get('programme_id') ?? '');
  const supabase = await requireSession(programmeId);

  const grant = String(formData.get('grant') ?? 'true') === 'true';
  const assignmentId = String(formData.get('assignment_id') ?? '').trim();

  const { error } = await supabase.rpc('record_programme_consent_command', {
    p_programme_id: programmeId,
    p_worker_id: String(formData.get('worker_id') ?? ''),
    p_scope: String(formData.get('scope') ?? 'programme'),
    p_assignment_id: assignmentId.length > 0 ? assignmentId : null,
    p_purpose: String(formData.get('purpose') ?? '').trim(),
    p_grant: grant,
  });

  if (error) redirect(backWith(programmeId, { failed: failureCode(error.message) }));
  redirect(backWith(programmeId, { saved: grant ? 'consent' : 'consent_revoked' }));
}

/**
 * Link or unlink a project.
 *
 * ⚠️ THE CALLER HAS TO BE A PARTY TO THE PROJECT, and this action does not check that itself — the command does,
 * through `project_role_for`. An institution bringing itself onto somebody else's job is exactly the kind of
 * action a page should not be able to authorise.
 */
export async function linkProjectAction(formData: FormData) {
  const programmeId = String(formData.get('programme_id') ?? '');
  const supabase = await requireSession(programmeId);
  const assignmentId = String(formData.get('assignment_id') ?? '').trim();

  if (assignmentId.length === 0) redirect(backWith(programmeId, { failed: 'bad_request' }));

  const { error } = await supabase.rpc('link_programme_project_command', {
    p_programme_id: programmeId,
    p_assignment_id: assignmentId,
    p_note: String(formData.get('link_note') ?? '').trim() || null,
  });

  if (error) redirect(backWith(programmeId, { failed: failureCode(error.message) }));
  redirect(backWith(programmeId, { saved: 'allocated' }));
}

export async function unlinkProjectAction(formData: FormData) {
  const programmeId = String(formData.get('programme_id') ?? '');
  const supabase = await requireSession(programmeId);

  const { error } = await supabase.rpc('unlink_programme_project_command', {
    p_programme_id: programmeId,
    p_assignment_id: String(formData.get('assignment_id') ?? ''),
  });

  if (error) redirect(backWith(programmeId, { failed: failureCode(error.message) }));
  redirect(backWith(programmeId, { saved: 'allocated' }));
}
