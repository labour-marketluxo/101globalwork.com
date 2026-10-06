import Link from 'next/link';
import { BadgeCheck, ExternalLink, Info, Lock, Star } from '@/components/ui/icons';
import { CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { submitProviderReviewAction } from '@/features/customer/review-actions';
import {
  RATING_LABELS,
  REVIEW_DIMENSIONS,
  REVIEW_FAILURE_COPY,
  reviewAverage,
  reviewFailureCode,
  type ProviderReview,
} from '@/features/customer/reviews';

/**
 * Reviewing the provider.
 *
 * ⚠️ THE PAGE CANNOT OFFER A REVIEW FOR WORK THAT WAS NOT VERIFIED COMPLETE, AND IT DOES NOT PRETEND TO. The
 * eligibility test is a row: `completion_approvals` for this assignment. If it is missing, this component
 * renders why rather than a form that the database would refuse. That is the anti-manipulation rule made
 * visible — a review here is attached to work the customer paid for and accepted, and to nothing else.
 *
 * ⚠️ THE PHOTOGRAPH FIELD IS A LINK FIELD AND SAYS SO. There is no object storage in this project, so a
 * dropzone would be a control that collected bytes with nowhere to put them. The page asks for links to
 * photographs and explains that plainly, which is worse than a dropzone and true, rather than better and false.
 */

export function ReviewNotice({ failed, reviewed }: { failed?: string; reviewed?: string }) {
  const code = reviewFailureCode(failed);
  return (
    <div className="mb-6 space-y-3">
      {code ? (
        <p
          role="alert"
          className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900"
        >
          {REVIEW_FAILURE_COPY[code]}
        </p>
      ) : null}
      {!code && reviewed ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          Thank you — your review is recorded against this job and the provider can read it.
        </p>
      ) : null}
    </div>
  );
}

/**
 * One dimension, as five radios.
 *
 * Radios rather than stars a script has to paint: a rating is a choice between five labelled options, and a
 * group of radios is that choice with keyboard support, a screen-reader announcement, and no JavaScript. The
 * star is the label, not the control.
 */
function RatingField({ dimensionKey, label, question }: { dimensionKey: string; label: string; question: string }) {
  const id = `rating-${dimensionKey}`;
  return (
    <fieldset className="border-t border-solid border-slate-200 pt-4 first:border-0 first:pt-0">
      <legend className="text-sm font-bold text-slate-900">{label}</legend>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{question}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5].map(score => (
          <label
            key={score}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-solid border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-primary has-checked:border-primary has-checked:bg-primary-subtle has-checked:text-primary"
          >
            <input
              type="radio"
              id={`${id}-${score}`}
              name={dimensionKey}
              value={score}
              required
              className="sr-only"
            />
            <Star aria-hidden="true" className="h-3.5 w-3.5" />
            <span aria-hidden="true">{score}</span>
            <span className="sr-only">
              {score} out of 5 — {RATING_LABELS[score]}
            </span>
            <span aria-hidden="true" className="hidden sm:inline">
              {RATING_LABELS[score]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReviewForm({
  assignmentId,
  providerName,
}: {
  assignmentId: string;
  providerName: string;
}) {
  return (
    <section className={`${CARD} p-5 sm:p-6`}>
      <h2 className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Your review of {providerName}
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
        Four ratings and, if you want, some words. All four ratings are required, because an average of three
        answers and a blank is not a rating.
      </p>

      <form action={submitProviderReviewAction} className="mt-5 space-y-5">
        <input type="hidden" name="assignment_id" value={assignmentId} />

        {REVIEW_DIMENSIONS.map(dimension => (
          <RatingField
            key={dimension.key}
            dimensionKey={dimension.key}
            label={dimension.label}
            question={dimension.question}
          />
        ))}

        <div className="border-t border-solid border-slate-200 pt-4">
          <label className={LABEL} htmlFor="review-comment">
            Anything you want to add <span className="font-normal normal-case">(optional)</span>
          </label>
          <textarea
            id="review-comment"
            name="comment"
            rows={5}
            maxLength={2000}
            className={FIELD}
            placeholder="What would you tell somebody else hiring them?"
          />
        </div>

        <fieldset className="border-t border-solid border-slate-200 pt-4">
          <legend className={LABEL}>Links to photographs</legend>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            The platform stores links, not files: there is no upload here, so paste links to photographs (they must
            start with https://). Up to six.
          </p>
          <div className="space-y-2">
            {[0, 1, 2].map(index => (
              <input
                key={index}
                name="photo_url"
                type="url"
                inputMode="url"
                placeholder="https://"
                aria-label={`Photograph link ${index + 1}`}
                className={FIELD}
              />
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-0 bg-primary px-5 py-3 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark"
        >
          <Star aria-hidden="true" className="h-4 w-4" />
          Post this review
        </button>
      </form>
    </section>
  );
}

/** The review already written for this job. */
export function ReviewSummary({ review }: { review: ProviderReview }) {
  const average = reviewAverage(review);
  return (
    <section className={`${CARD} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            <BadgeCheck aria-hidden="true" className="h-4 w-4 text-primary" />
            Your review
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Written{' '}
            {new Date(review.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-sans text-sm font-bold text-primary">
          <Star aria-hidden="true" className="h-3.5 w-3.5" />
          {average.toFixed(1)} / 5
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {REVIEW_DIMENSIONS.map(dimension => (
          <div key={dimension.key}>
            <dt className={LABEL}>{dimension.label}</dt>
            <dd className="flex items-center gap-1 text-sm text-slate-800">
              {[1, 2, 3, 4, 5].map(score => (
                <Star
                  key={score}
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 ${score <= review[dimension.key] ? 'text-primary' : 'text-slate-200'}`}
                />
              ))}
              <span className="ml-1 text-xs text-slate-500">
                {review[dimension.key]}/5 {RATING_LABELS[review[dimension.key]]}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {review.comment ? (
        <p className="mt-4 border-t border-solid border-slate-200 pt-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
          {review.comment}
        </p>
      ) : null}

      {review.photoUrls.length > 0 ? (
        <div className="mt-4 border-t border-solid border-slate-200 pt-4">
          <h3 className={LABEL}>Photographs</h3>
          <ul className="space-y-1.5">
            {review.photoUrls.map(url => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer noopener nofollow" className={LINK_ARROW}>
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  Open photograph
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Why there is no form.
 *
 * ⚠️ A MISSING FORM WITH NO EXPLANATION READS AS A BUG, so this names the rule. It is also the honest place to
 * say that the platform does not publish these reviews: collecting a rating and implying it is displayed would
 * be a worse promise than collecting one and saying who can read it.
 */
export function ReviewNotAvailable({
  assignmentId,
  requestId,
  reason,
}: {
  assignmentId: string;
  requestId: string;
  reason: 'not_completed' | 'not_found' | 'unavailable';
}) {
  const copy = {
    not_completed:
      'You can review this provider once you have approved the work as complete. That order is the whole anti-manipulation rule: a review has to be attached to work somebody actually accepted and paid for.',
    not_found: 'There is no review for this job, and none can be written for it.',
    unavailable:
      'Your review could not be read just now, so this page cannot say whether one exists. Reload in a moment rather than writing a second one — the platform allows one review per job.',
  }[reason];

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        <Lock aria-hidden="true" className="h-4 w-4 text-slate-400" />
        No review to write yet
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href={`/customer/projects/${assignmentId}/completion`} className={LINK_ARROW}>
          Open the completion review
        </Link>
        <Link href={`/customer/requests/${requestId}`} className={LINK_ARROW}>
          Open the job
        </Link>
      </div>
    </section>
  );
}

/** Where a review goes, stated once, because "who can read this?" is the fair question. */
export function ReviewAudienceNote() {
  return (
    <section className={`${CARD} p-5`}>
      <h2 className="flex items-center gap-2 font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        <Info aria-hidden="true" className="h-4 w-4 text-slate-400" />
        Who reads this
      </h2>
      <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
        <li>· You, on this page, for as long as the job exists.</li>
        <li>· The provider it is about, on their own copy of the job.</li>
        <li>· The platform&apos;s trust team.</li>
        <li>
          · <span className="font-semibold">Not the public.</span> There is no review wall on this platform, and a
          provider&apos;s public trust score is set by the platform rather than calculated from these ratings.
        </li>
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        A review cannot be edited after it is posted, and there is one per job. If something changes, the
        correction or dispute path on the completion page is the record that moves.
      </p>
    </section>
  );
}

export function ReviewStars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${score} out of 5`}>
      {[1, 2, 3, 4, 5].map(value => (
        <Star
          key={value}
          aria-hidden="true"
          className={`h-3 w-3 ${value <= score ? 'text-primary' : 'text-slate-200'}`}
        />
      ))}
    </span>
  );
}
