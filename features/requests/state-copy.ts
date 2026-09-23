/**
 * The request state machine's vocabulary in words.
 *
 * ⚠️ ONE DEFINITION, TWO CONSOLES. The organisation portfolio and the platform's project console both list
 * requests by state, and a second copy of these labels is how one of them starts calling `submitted_for_approval`
 * something the other does not. It lives in its own module — and imports nothing — so a client component may
 * use it without dragging a request-scoped database client into the browser bundle.
 */

export const REQUEST_STATE_COPY: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  matching: 'Finding providers',
  quoted: 'Quotes ready',
  accepted: 'Accepted',
  scheduled: 'Scheduled',
  in_progress: 'Under way',
  submitted_for_approval: 'Awaiting approval',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

/** The three phases the state machine's states fall into, plus the two that are exceptions rather than phases. */
export const REQUEST_PHASE_COPY: Record<string, string> = {
  pre_work: 'Before the work is committed',
  contracted: 'Work committed',
  closed: 'Closed',
  cancelled: 'Cancelled',
  exception: 'Needs attention',
};
