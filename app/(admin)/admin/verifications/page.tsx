import { redirect } from 'next/navigation';

/**
 * /admin/verifications now redirects into the trust namespace.
 *
 * ⚠️ WHY THE PATH MOVED. Deciding a submission needs a per-record review hub — the claim, the document
 * reference, the checks the platform ran and the decision history — and that route needs a parent queue.
 * Putting verifications, credentials and moderation cases under one namespace is what makes the hub, its
 * queue and the two sibling queues a single console rather than three unrelated pages. The old path is kept
 * as a redirect so bookmarks, links from the incident feed and anything an operator has saved keep working.
 *
 * ⚠️ THE OLD PAGE'S ACTION IS DELETED WITH IT, AND THE COMMAND IT CALLED IS REVOKED IN MIGRATION
 * 20260923270000. REVIEWING IS NOW `decide_provider_verification_command`, which requires a reason code, a
 * note, a policy version and a second factor. Leaving the reason-less path alive would have meant two ways to
 * approve a verification, one of which records nothing about why.
 */
export default function RetiredVerificationQueuePage() {
  redirect('/admin/trust/verifications');
}
