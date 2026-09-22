import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Reviews of a provider, by the customer who paid for the work.
 *
 * ⚠️ VERIFIED WORK PROVENANCE IS ENFORCED IN THE DATABASE, NOT BY THIS PAGE. `submit_provider_review_command`
 * looks for the `completion_approvals` row that recorded the customer accepting this job, and the review table
 * carries that row as a NOT NULL foreign key. So a review can only exist for work that was submitted by a
 * provider and explicitly approved by the customer — there is no path that produces a rating from nothing, and
 * no way to review a job you did not commission.
 *
 * ⚠️ WHAT IS COLLECTED AND WHERE IT IS SHOWN. The four ratings and the written feedback are readable by the
 * customer who wrote them, by the provider they are about, and by the platform's trust capability. There is no
 * public review wall, and this module does not build one: `provider_public_profiles.trust_score` is a separate
 * platform-controlled figure, and deriving it from these rows is a decision for whoever owns that score, not a
 * side effect of adding a form.
 */

export const REVIEW_DIMENSIONS = [
  {
    key: 'workmanship',
    label: 'Workmanship',
    question: 'Was the work itself done well?',
  },
  {
    key: 'punctuality',
    label: 'Punctuality',
    question: 'Did they arrive and finish when they said they would?',
  },
  {
    key: 'communication',
    label: 'Communication',
    question: 'Could you reach them, and did they tell you what was happening?',
  },
  {
    key: 'quoteAccuracy',
    label: 'Quote accuracy',
    question: 'Was the final price the price you agreed?',
  },
] as const;

export type ReviewDimensionKey = (typeof REVIEW_DIMENSIONS)[number]['key'];

export const RATING_LABELS: Record<number, string> = {
  1: 'Bad',
  2: 'Poor',
  3: 'Fine',
  4: 'Good',
  5: 'Excellent',
};

export type ProviderReview = {
  id: string;
  assignmentId: string;
  providerId: string;
  workmanship: number;
  punctuality: number;
  communication: number;
  quoteAccuracy: number;
  comment: string | null;
  photoUrls: string[];
  createdAt: string;
};

type ReviewRow = {
  id: string;
  assignment_id: string;
  provider_id: string;
  workmanship: number;
  punctuality: number;
  communication: number;
  quote_accuracy: number;
  comment: string | null;
  photo_urls: unknown;
  created_at: string;
};

function parseUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export async function getReviewForAssignment(assignmentId: string): Promise<{
  review: ProviderReview | null;
  unavailable: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('provider_reviews')
    .select('id,assignment_id,provider_id,workmanship,punctuality,communication,quote_accuracy,comment,photo_urls,created_at')
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[customer] could not read the review: ${error.message}`);
    }
    return { review: null, unavailable: true };
  }
  if (!data) return { review: null, unavailable: false };

  const row = data as ReviewRow;
  return {
    review: {
      id: row.id,
      assignmentId: row.assignment_id,
      providerId: row.provider_id,
      workmanship: row.workmanship,
      punctuality: row.punctuality,
      communication: row.communication,
      quoteAccuracy: row.quote_accuracy,
      comment: row.comment,
      photoUrls: parseUrls(row.photo_urls),
      createdAt: row.created_at,
    },
    unavailable: false,
  };
}

/** The mean of the four ratings, shown after a review exists. Not stored: a stored average is one more number
 *  that can disagree with the four it came from. */
export function reviewAverage(review: ProviderReview): number {
  return (
    (review.workmanship + review.punctuality + review.communication + review.quoteAccuracy) / 4
  );
}

export const REVIEW_FAILURES = [
  'not_found',
  'not_authorized',
  'not_completed',
  'already_reviewed',
  'ratings_required',
  'bad_link',
  'too_long',
  'failed',
] as const;
export type ReviewFailure = (typeof REVIEW_FAILURES)[number];

export const REVIEW_FAILURE_COPY: Record<ReviewFailure, string> = {
  not_found: 'That job is no longer on your account.',
  not_authorized: 'That is not yours to review.',
  not_completed:
    'Only work you have approved as complete can be reviewed. That rule is what makes a review worth reading.',
  already_reviewed: 'You have already reviewed this job.',
  ratings_required: 'Give a rating from 1 to 5 on all four.',
  bad_link:
    'Photograph links have to start with https://. The platform stores links, not files — there is no upload here.',
  too_long: 'That feedback is too long. Keep it under 2,000 characters.',
  failed: 'That did not work, and nothing was saved. Try again.',
};

export function reviewFailureCode(value: string | undefined | null): ReviewFailure | null {
  if (!value) return null;
  return (REVIEW_FAILURES as readonly string[]).includes(value) ? (value as ReviewFailure) : null;
}

export function reviewFailureFromMessage(message: string): ReviewFailure {
  const text = message.toLowerCase();
  if (text.includes('already reviewed')) return 'already_reviewed';
  if (text.includes('not been approved complete') || text.includes('is not complete')) return 'not_completed';
  if (text.includes('duplicate key')) return 'already_reviewed';
  if (text.includes('whole number from 1 to 5')) return 'ratings_required';
  if (text.includes('must start with https')) return 'bad_link';
  if (text.includes('at most') || text.includes('too long')) return 'too_long';
  if (text.includes('not authorized')) return 'not_authorized';
  if (text.includes('not found')) return 'not_found';
  return 'failed';
}
