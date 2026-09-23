/**
 * The words a page shows for a refused project write.
 *
 * ⚠️ OUTSIDE THE `'use server'` MODULE ON PURPOSE. Next 16 requires every export of a `'use server'` file to be an
 * async function; this is a synchronous lookup table. It sat in the actions module until the build refused the whole
 * app over it — which is the right outcome, because the constraint is real and the fix belongs here rather than in a
 * loosened config.
 */

export type ProjectFailureCode = 'not_authorized' | 'bad_request' | 'transition' | 'completed' | 'unavailable';

const FAILURE_COPY: Record<ProjectFailureCode, string> = {
  not_authorized: 'That project is not yours to change, so nothing was saved.',
  bad_request: 'That request was missing something it needed. Nothing was changed.',
  transition: 'That move is not allowed from where the task is now, or it is not yours to make. Nothing was changed.',
  completed: 'That task is complete. A finished task is history — raise a new one if more work is needed.',
  unavailable: 'That did not work and nothing was saved. Try again.',
};

export function projectFailureCopy(code: string | undefined | null): string | null {
  if (!code) return null;
  return FAILURE_COPY[code as ProjectFailureCode] ?? FAILURE_COPY.unavailable;
}
