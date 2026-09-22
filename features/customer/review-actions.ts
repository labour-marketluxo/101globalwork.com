'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { reviewFailureFromMessage } from '@/features/customer/reviews';

/**
 * Submitting a review.
 *
 * ⚠️ THE PROVENANCE CHECK IS IN THE DATABASE, SO POSTING HERE DIRECTLY CHANGES NOTHING. The command looks for
 * the `completion_approvals` row for this assignment and attaches the review to it; without that row there is
 * no review. This action only turns the answer into a redirect.
 *
 * ⚠️ PHOTOGRAPHS ARE LINKS, AND THE FORM SAYS SO. There is no object storage configured in this project, so a
 * dropzone would collect bytes that had nowhere to go. Links are held instead, validated as https by the
 * command, and the copy on the page says exactly that rather than implying an upload happened.
 */

const reviewPath = (assignmentId: string) => `/customer/projects/${assignmentId}/review`;

function rating(formData: FormData, name: string): number | null {
  const value = Number(String(formData.get(name) ?? ''));
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

export async function submitProviderReviewAction(formData: FormData) {
  const assignmentId = String(formData.get('assignment_id') ?? '');
  const back = reviewPath(assignmentId);

  const workmanship = rating(formData, 'workmanship');
  const punctuality = rating(formData, 'punctuality');
  const communication = rating(formData, 'communication');
  const quoteAccuracy = rating(formData, 'quote_accuracy');

  if (
    workmanship === null || punctuality === null || communication === null || quoteAccuracy === null
  ) {
    redirect(`${back}?failed=ratings_required`);
  }

  const photos = formData
    .getAll('photo_url')
    .map(value => String(value).trim())
    .filter(Boolean);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(back)}`);

  const { error } = await supabase.rpc('submit_provider_review_command', {
    p_assignment_id: assignmentId,
    p_workmanship: workmanship,
    p_punctuality: punctuality,
    p_communication: communication,
    p_quote_accuracy: quoteAccuracy,
    p_comment: String(formData.get('comment') ?? '').trim() || null,
    p_photo_urls: photos,
  });

  if (error) redirect(`${back}?failed=${reviewFailureFromMessage(error.message)}`);
  redirect(`${reviewPath(assignmentId)}?reviewed=1`);
}
