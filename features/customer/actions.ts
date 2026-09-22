'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCustomerRequestDetail, getRequestDraft } from '@/features/customer/requests';
import { failureFromMessage } from '@/features/customer/quotes';
import { CUSTOMER_PATHS, NOT_SURE, type IntakeFailure, type IntakeStep, type RequestScope } from '@/features/customer/intake';

/**
 * The guided intake's writes.
 *
 * EVERY STEP POSTS TO THE SAME PAIR OF ACTIONS. That is deliberate: the steps differ in which fields
 * they render, not in how a draft is saved, and four near-identical actions would be four places for
 * the ownership check to be forgotten. What a step sends identifies it (`step`), and the scope JSON is
 * MERGED with what is already stored rather than replaced — so going Back to step 2 and pressing
 * Continue cannot erase the access notes somebody typed at step 3.
 *
 * ⚠️ THE SCOPE IS READ-MODIFY-WRITE, which is only safe because it is a draft: one person, one device,
 * one browser tab at a time. Two tabs editing the same draft would have the second save win, and that
 * is written here rather than silently assumed — a lost-update guard belongs with the versions column
 * `request_scopes` already has, and it is not worth one until a draft can be shared.
 */

const STEP_PATHS: Record<IntakeStep, string> = {
  intent: CUSTOMER_PATHS.newRequest,
  clarify: CUSTOMER_PATHS.clarify,
  logistics: CUSTOMER_PATHS.logistics,
  review: CUSTOMER_PATHS.review,
};

const NEXT_STEP: Record<IntakeStep, IntakeStep> = {
  intent: 'clarify',
  clarify: 'logistics',
  logistics: 'review',
  // The review step never advances through this action: its Continue button is the SUBMIT form, which
  // posts to submitIntakeAction. Reaching here means Save as Draft, which stays put.
  review: 'review',
};

function codeFrom(message: string): IntakeFailure {
  if (message.includes('already been submitted')) return 'already_submitted';
  if (message.includes('draft not found') || message.includes('not authorized')) return 'not_found';
  if (message.includes('description')) return 'missing_description';
  return 'save_failed';
}

async function currentAccountId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  return data?.id ?? null;
}

export async function saveIntakeDraftAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(CUSTOMER_PATHS.newRequest)}`);

  const step = (String(formData.get('step') ?? 'intent') as IntakeStep);
  const path = STEP_PATHS[step] ?? CUSTOMER_PATHS.newRequest;
  const draftId = String(formData.get('draft_id') ?? '');
  const staying = String(formData.get('intent') ?? 'continue') === 'save';

  const existing = draftId ? await getRequestDraft(draftId) : null;
  if (draftId && !existing) redirect(`${path}?failed=not_found`);

  const needText = String(formData.get('need_text') ?? '').trim();
  const urgency = String(formData.get('urgency') ?? '');
  const locationId = String(formData.get('location_id') ?? '');
  const serviceEntityId = String(formData.get('service_entity_id') ?? '');

  // Merged, not replaced. See the note above.
  const scope: RequestScope = { ...((existing?.scope ?? {}) as RequestScope) };

  if (step === 'intent') {
    // THE NAME IS RESOLVED, NOT COPIED. A draft created by this very step has no catalogue in memory
    // yet — `existing` is null — so reading the name out of it left `service_name` null on every first
    // save, and the merge then carried that null forward for the life of the draft. One lookup makes
    // the stored scope readable on its own, without a join to know what was actually chosen.
    let serviceName = serviceEntityId
      ? existing?.services.find(service => service.id === serviceEntityId)?.name ?? null
      : null;

    if (serviceEntityId && !serviceName) {
      const { data: service } = await supabase
        .from('public_service_catalog')
        .select('display_name')
        .eq('service_entity_id', serviceEntityId)
        .maybeSingle();
      serviceName = service?.display_name ?? null;
    }

    scope.classifier = { service_id: serviceEntityId || null, service_name: serviceName };
  }

  if (step === 'clarify') {
    const questions = formData.getAll('question_id').map(String);
    const answers: Record<string, string> = {};
    const notSure: string[] = [];

    for (const id of questions) {
      if (formData.get(`not_sure__${id}`) !== null) {
        notSure.push(id);
        // "Not sure" is an ANSWER, not a gap: it goes into the scope so a provider reads
        // "they do not know yet" rather than an empty field they will ask about twice. When the box is
        // ticked AND something was typed, the typed text is kept and only the uncertainty is recorded —
        // discarding words somebody took the trouble to write is the one outcome worse than an
        // ambiguous answer.
        const partial = String(formData.get(`answer__${id}`) ?? '').trim();
        answers[id] = partial || NOT_SURE;
        continue;
      }
      const value = String(formData.get(`answer__${id}`) ?? '').trim();
      if (value) answers[id] = value;
    }

    scope.answers = answers;
    scope.not_sure = notSure;
  }

  if (step === 'logistics') {
    scope.access_notes = String(formData.get('access_notes') ?? '').trim() || undefined;
    scope.landmark = String(formData.get('landmark') ?? '').trim() || undefined;
    scope.area_text = String(formData.get('area_text') ?? '').trim() || undefined;
    scope.preferred_window = String(formData.get('preferred_window') ?? '') || undefined;
    scope.preferred_date = String(formData.get('preferred_date') ?? '') || undefined;
    scope.hazardous = formData.get('hazardous') === 'true';
  }

  if (step === 'review') {
    scope.contact_preference = String(formData.get('contact_preference') ?? '') || undefined;
    // Consent is recorded when the box is there, and required by the SUBMIT action, which is the only
    // placement that makes sense: a draft is not an agreement to anything, so saving one must not be
    // blocked by a consent checkbox nobody has to have ticked yet.
    if (formData.get('agree') !== null) scope.agreed_at = new Date().toISOString();
  }

  // The market is not a question in this flow: the platform operates in one, so the flow resolves it
  // rather than asking. A draft created here records the same market the catalogue publishes.
  const { data: market } = await supabase
    .from('public_market_catalog')
    .select('market_id')
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase.rpc('save_customer_request_draft_command', {
    p_draft_id: draftId || null,
    p_need_text: needText,
    // An existing draft already names its market; a new one takes the catalogue's only market.
    p_market_id: existing?.marketId ?? market?.market_id ?? null,
    p_service_entity_id: serviceEntityId || null,
    p_location_id: locationId || null,
    p_urgency: (urgency || 'normal') as 'normal' | 'soon' | 'urgent' | 'emergency_redirect',
    p_scope: scope,
  });

  if (error || !data) {
    const code = error ? codeFrom(error.message) : 'save_failed';
    redirect(`${path}${draftId ? `?draft=${draftId}&` : '?'}failed=${code}`);
  }

  const savedId = String(data);

  if (staying) {
    redirect(`${path}?draft=${savedId}&saved=1`);
  }

  const next = NEXT_STEP[step];
  if (next === step) redirect(`${path}?draft=${savedId}`);
  redirect(`${STEP_PATHS[next]}?draft=${savedId}`);
}

/**
 * Submit. Idempotent on the server: the transition is `state = 'draft' → 'submitted'`, so a second
 * click — or a double POST, or a retry after a timeout — updates no rows and returns the same request
 * id. The browser does not need to prevent double submission, and does not.
 */
export async function submitIntakeAction(formData: FormData) {
  const draftId = String(formData.get('draft_id') ?? '');
  if (!draftId) redirect(`${CUSTOMER_PATHS.review}?failed=not_found`);

  // THE CONSENT CHECK LIVES HERE, on the action that creates the obligation, and not on the save
  // action. The form marks the box `required`, and this is the check that does not depend on the
  // browser honouring that — a POST to this action from anywhere else has to carry it too.
  if (formData.get('agree') === null) {
    redirect(`${CUSTOMER_PATHS.review}?draft=${draftId}&failed=consent_required`);
  }

  const accountId = await currentAccountId();
  if (!accountId) redirect(`/auth/sign-in?next=${encodeURIComponent(CUSTOMER_PATHS.review)}`);

  const supabase = await createSupabaseServerClient();

  /**
   * THE REVIEW STEP'S OWN ANSWERS ARE PART OF THE SUBMIT, NOT A SEPARATE SAVE.
   *
   * The contact preference and the moment of consent are on the form that submits, so a visitor who
   * picks a preference and presses Submit — without ever pressing Save draft again — would otherwise
   * have submitted a request that carried neither. They go through the same draft command first, with
   * the draft's own values re-sent unchanged, so the only thing this write can alter is the scope.
   */
  const draft = await getRequestDraft(draftId);
  if (!draft) redirect(`${CUSTOMER_PATHS.review}?failed=not_found`);

  const scope: RequestScope = { ...(draft.scope as RequestScope) };
  scope.contact_preference =
    String(formData.get('contact_preference') ?? '') || scope.contact_preference;
  scope.agreed_at = new Date().toISOString();

  const { error: saveError } = await supabase.rpc('save_customer_request_draft_command', {
    p_draft_id: draftId,
    p_need_text: draft.needText,
    p_market_id: draft.marketId,
    p_service_entity_id: draft.serviceEntityId,
    p_location_id: draft.locationId,
    p_urgency: draft.urgency as 'normal' | 'soon' | 'urgent' | 'emergency_redirect',
    p_scope: scope,
  });

  if (saveError) {
    redirect(`${CUSTOMER_PATHS.review}?draft=${draftId}&failed=${codeFrom(saveError.message)}`);
  }

  const { data, error } = await supabase.rpc('submit_customer_request_draft_command', {
    p_draft_id: draftId,
  });

  if (error || !data) {
    const code = error ? codeFrom(error.message) : 'save_failed';
    redirect(`${CUSTOMER_PATHS.review}?draft=${draftId}&failed=${code}`);
  }

  redirect(CUSTOMER_PATHS.confirmation(String(data)));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Decisions on a live request: accept, decline, ask for a change, cancel, sign the agreement.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every one of these posts to a command that re-derives the caller from `auth.uid()` and asserts ownership
 * inside the database. The actions below do not repeat those checks — they translate a refusal into a
 * phrase and send the visitor back to the page they came from with nothing changed.
 */
const DECISION_PATHS = {
  request: (id: string) => `/customer/requests/${id}`,
  quotes: (id: string) => `/customer/requests/${id}/quotes`,
  quote: (requestId: string, quoteId: string) => `/customer/requests/${requestId}/quotes/${quoteId}`,
  agreement: (assignmentId: string) => `/customer/projects/${assignmentId}/agreement`,
} as const;

/** Runs a decision RPC and turns a refusal into a code on the URL. Returns the error message, or null. */
async function runDecision(
  fn: 'decline_quote_command' | 'request_quote_change_command' | 'withdraw_quote_change_command' |
      'cancel_request_command' | 'accept_project_agreement_command' | 'update_customer_request_command',
  args: Record<string, unknown>,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, args);
  return error ? error.message : null;
}

export async function declineQuoteAction(formData: FormData) {
  const quoteId = String(formData.get('quote_id') ?? '');
  const requestId = String(formData.get('request_id') ?? '');
  const back = DECISION_PATHS.quotes(requestId);

  const message = await runDecision('decline_quote_command', {
    p_quote_id: quoteId,
    p_reason: String(formData.get('reason') ?? ''),
  });

  if (message) redirect(`${DECISION_PATHS.quote(requestId, quoteId)}?failed=${failureFromMessage(message)}`);
  redirect(`${back}?decided=declined`);
}

export async function requestQuoteChangeAction(formData: FormData) {
  const quoteId = String(formData.get('quote_id') ?? '');
  const requestId = String(formData.get('request_id') ?? '');
  const kind = String(formData.get('kind') ?? 'clarification');

  const message = await runDecision('request_quote_change_command', {
    p_quote_id: quoteId,
    p_kind: kind === 'revision' ? 'revision' : 'clarification',
    p_message: String(formData.get('message') ?? ''),
  });

  if (message) redirect(`${DECISION_PATHS.quote(requestId, quoteId)}?failed=${failureFromMessage(message)}`);
  redirect(`${DECISION_PATHS.quote(requestId, quoteId)}?decided=asked`);
}

export async function withdrawQuoteChangeAction(formData: FormData) {
  const changeId = String(formData.get('change_id') ?? '');
  const quoteId = String(formData.get('quote_id') ?? '');
  const requestId = String(formData.get('request_id') ?? '');

  const message = await runDecision('withdraw_quote_change_command', { p_change_id: changeId });
  if (message) redirect(`${DECISION_PATHS.quote(requestId, quoteId)}?failed=${failureFromMessage(message)}`);
  redirect(`${DECISION_PATHS.quote(requestId, quoteId)}?decided=withdrawn`);
}

export async function cancelRequestAction(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '');

  const message = await runDecision('cancel_request_command', {
    p_request_id: requestId,
    p_reason: String(formData.get('reason') ?? ''),
  });

  if (message) redirect(`${DECISION_PATHS.request(requestId)}?failed=${failureFromMessage(message)}`);
  redirect(`${DECISION_PATHS.request(requestId)}?decided=cancelled`);
}

/**
 * Edit an open request.
 *
 * ⚠️ THE SCOPE IS MERGED HERE, NOT REPLACED. `request_scopes` holds the answers from the guided flow plus the
 * logistics the edit form may not even show. The command versions whatever it is given, so sending only the
 * fields on this form would drop the answers a provider is reading. The read is the same ownership-checked read
 * the page uses, and the command re-checks ownership inside the database regardless.
 */
export async function updateRequestAction(formData: FormData) {
  const requestId = String(formData.get('request_id') ?? '');
  const back = DECISION_PATHS.request(requestId);

  const request = await getCustomerRequestDetail(requestId);
  if (!request) redirect(`${back}?failed=not_found`);

  const scope: Record<string, unknown> = { ...request.scope };
  const text = (name: string) => String(formData.get(name) ?? '').trim();

  const accessNotes = text('access_notes');
  const landmark = text('landmark');
  const preferredWindow = text('preferred_window');

  // Emptying a field is an edit too, so a cleared box removes the note rather than leaving the previous one.
  if (accessNotes) scope.access_notes = accessNotes;
  else delete scope.access_notes;
  if (landmark) scope.landmark = landmark;
  else delete scope.landmark;
  if (preferredWindow) scope.preferred_window = preferredWindow;
  else delete scope.preferred_window;

  const message = await runDecision('update_customer_request_command', {
    p_request_id: requestId,
    p_need_text: String(formData.get('need_text') ?? ''),
    p_urgency: String(formData.get('urgency') ?? request.urgency),
    p_location_id: String(formData.get('location_id') ?? '') || null,
    p_scope: scope,
  });

  if (message) redirect(`${back}?failed=${failureFromMessage(message)}`);
  redirect(`${back}?decided=edited`);
}

/**
 * Accept. The command is idempotent (the unique constraints on `assignments` and `payment_obligations`, plus
 * `state = 'quoted' → 'accepted'`), so a double click cannot create two assignments — and the browser does
 * nothing to prevent one.
 *
 * ⚠️ ACCEPTING LANDS ON THE AGREEMENT. The acceptance is what creates the assignment and its payment
 * obligation in one step, so the agreement is where the customer should read what they have just agreed to.
 */
export async function acceptQuoteAction(formData: FormData) {
  const quoteId = String(formData.get('quote_id') ?? '');
  const requestId = String(formData.get('request_id') ?? '');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('accept_quote_command', { p_quote_id: quoteId });

  if (error || !data) {
    const code = error ? failureFromMessage(error.message) : 'failed';
    redirect(`${DECISION_PATHS.quote(requestId, quoteId)}?failed=${code}`);
  }

  redirect(`${DECISION_PATHS.agreement(String(data))}?accepted=1`);
}

/**
 * Sends the step-up code. The address comes from the session, never from the form — a form field here would
 * let anyone request a code to an address they control and then "verify" as somebody else.
 */
export async function sendAgreementCodeAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const agree = formData.get('agree') !== null;

  if (!agree) {
    redirect(`${DECISION_PATHS.agreement(assignmentId)}?failed=too_short`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect(`/auth/sign-in?next=${encodeURIComponent(DECISION_PATHS.agreement(assignmentId))}`);

  // `shouldCreateUser: false` because this is a verification of an existing session. Without it, a typo in
  // an address turns a step-up into an account creation.
  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] agreement step-up code not sent: ${error.message}`);
    }
    redirect(`${DECISION_PATHS.agreement(assignmentId)}?failed=code_send_failed`);
  }

  redirect(`${DECISION_PATHS.agreement(assignmentId)}?verify=1`);
}

/**
 * Verifies the code and records the acceptance.
 *
 * ⚠️ THE ORDER MATTERS AND IS THE POINT. `verifyOtp` first, so the session that calls the acceptance command
 * carries a fresh `amr` — and the command asserts exactly that, in SQL, with `42501` when it is stale. A UI
 * that called the command first and asked for the code afterwards would be a checkbox with extra steps.
 */
export async function acceptAgreementAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const token = String(formData.get('token') ?? '').trim();
  const expectedHash = String(formData.get('agreement_hash') ?? '');
  const consentVersion = String(formData.get('consent_version') ?? '');

  const back = DECISION_PATHS.agreement(assignmentId);
  if (!/^\d{6}$/.test(token)) redirect(`${back}?verify=1&failed=bad_code`);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect(`/auth/sign-in?next=${encodeURIComponent(back)}`);

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: user.email,
    token,
    type: 'email',
  });

  if (verifyError) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] step-up verification failed: ${verifyError.message}`);
    }
    redirect(`${back}?verify=1&failed=bad_code`);
  }

  /**
   * A FRESH CLIENT, deliberately. `verifyOtp` rotated the session cookies; a client created after the
   * rotation is guaranteed to send the NEW access token — the one whose `amr` timestamp the command checks.
   */
  const refreshed = await createSupabaseServerClient();
  const { error } = await refreshed.rpc('accept_project_agreement_command', {
    p_assignment_id: assignmentId,
    p_agreement_hash: expectedHash,
    p_consent_version: consentVersion,
  });

  if (error) {
    const code = failureFromMessage(error.message);
    redirect(code === 'step_up_required' ? `${back}?verify=1&failed=step_up_required` : `${back}?failed=${code}`);
  }

  redirect(`${back}?signed=1`);
}

/**
 * A question about the agreement or the accepted quote behind it.
 *
 * ⚠️ IT GOES ON THE QUOTE, NOT ON THE AGREEMENT, AND THAT IS THE ONLY PLACE IT CAN GO. There is no agreement
 * messaging table and no provider-side agreement view. `quote_change_requests` already has a provider reader —
 * their own copy of the quote — so a question recorded there is one somebody will actually see. The command
 * allows a clarification against an accepted (locked) version because a question cannot change a price; a
 * revision request on a locked version is still refused.
 */
export async function clarifyAgreementAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const quoteId = String(formData.get('quote_id') ?? '');
  const back = DECISION_PATHS.agreement(assignmentId);

  const message = await runDecision('request_quote_change_command', {
    p_quote_id: quoteId,
    p_kind: 'clarification',
    p_message: String(formData.get('message') ?? ''),
  });

  if (message) redirect(`${back}?failed=${failureFromMessage(message)}`);
  redirect(`${back}?asked=1`);
}

/**
 * Declining the agreement, which — before any money has moved — is cancelling the request.
 *
 * ⚠️ THERE IS NO "UN-ACCEPT THE QUOTE" AND THIS DOES NOT PRETEND TO BE ONE. Accepting created an assignment and a
 * payment obligation; the version is locked, and `accept_quote_command` has no inverse. What the customer can
 * actually do at this point is walk away, which is `cancel_request_command`: it closes the request, ends the
 * assignment and cancels the pending obligation in one guarded step. After money has moved the command refuses,
 * and the page shows that refusal rather than a button that would fail.
 */
export async function declineAgreementAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const requestId = String(formData.get('request_id') ?? '');
  const back = DECISION_PATHS.agreement(assignmentId);

  const message = await runDecision('cancel_request_command', {
    p_request_id: requestId,
    p_reason: String(formData.get('reason') ?? ''),
  });

  if (message) redirect(`${back}?failed=${failureFromMessage(message)}`);
  redirect(`${DECISION_PATHS.request(requestId)}?decided=cancelled`);
}
