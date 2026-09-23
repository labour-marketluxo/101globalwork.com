/**
 * One sentence reused by the trust pages when a role cannot read a queue.
 *
 * ⚠️ IT EXISTS SO THE THREE QUEUES SAY THE SAME THING. "You do not have access" written three ways becomes
 * three different claims about what is missing, and one of them will eventually suggest the platform is
 * broken rather than that a role is narrower than the reader expected.
 */
export const ACCESS_NOTE =
  'This queue is behind the platform trust capability. Nothing here is broken and nothing has changed — ask a platform owner or a trust lead if you need it.';
