import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IntakeStepShell } from '@/components/customer/IntakeChrome';
import { CARD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { saveIntakeDraftAction, submitIntakeAction } from '@/features/customer/actions';
import {
  CONTACT_PREFERENCES,
  CUSTOMER_PATHS,
  NOT_SURE,
  STEP_LABELS,
  clarifyingQuestions,
  suggestService,
  type ClarifyQuestion,
  type RequestScope,
} from '@/features/customer/intake';
import { getRequestDraft } from '@/features/customer/requests';

export const metadata = {
  title: 'Check and submit',
  robots: { index: false, follow: false },
};

type Params = { draft?: string; failed?: string; saved?: string };

const URGENCY_LABELS: Record<string, string> = {
  emergency_redirect: 'Emergency',
  urgent: 'Within 24 hours',
  soon: 'Within a few days',
  normal: 'Flexible',
};

/**
 * Step 4 — Review, and the only place a request becomes visible to anybody.
 *
 * ⚠️ TWO FORMS, ONE SCREEN, AND THAT IS THE POINT. Submit and Save draft are different intentions with
 * different consequences — one ends the draft's life and starts matching, the other does not — so they
 * are separate forms rather than two buttons in one. The consent checkbox belongs to the submit form
 * alone: a draft is not an agreement to anything, and making Save draft carry a consent box would have
 * been a way of recording consent nobody gave.
 *
 * The submission itself is idempotent in the database (`state = 'draft' → 'submitted'`, guarded), so a
 * double click, a browser retry or a second tab cannot create a second request. Nothing in the browser
 * tries to prevent a double submission, because nothing in the browser needs to.
 */
export default async function IntakeReviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;

  if (!params.draft) redirect(`${CUSTOMER_PATHS.newRequest}?failed=not_found`);

  const draft = await getRequestDraft(params.draft);
  if (!draft) redirect(`${CUSTOMER_PATHS.newRequest}?failed=not_found`);

  const scope = draft.scope as RequestScope;
  const answers = scope.answers ?? {};
  const notSure = new Set(scope.not_sure ?? []);

  const chosenService = draft.services.find(service => service.id === draft.serviceEntityId)?.name ?? '';
  const { tags } = suggestService(`${draft.needText} ${chosenService}`, draft.services);
  const questions = clarifyingQuestions(tags);
  const questionText = new Map(questions.map((question: ClarifyQuestion) => [question.id, question]));

  const answeredIds = Object.keys(answers);
  const locationName = draft.locations.find(location => location.id === draft.locationId)?.name ?? null;

  return (
    <IntakeStepShell
      step="review"
      title="Check it before it goes out"
      lede="This is the last screen before providers can see it. Read it as a stranger would — anything you edit here is what they will read, not what you meant."
      failed={params.failed}
      saved={params.saved === '1'}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {/* ── Intent ──────────────────────────────────────────────────────────────────── */}
          <section className={CARD}>
            <header className="flex items-center justify-between gap-3 border-b border-solid border-slate-200 px-5 py-3">
              <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                {STEP_LABELS.intent}
              </h2>
              <Link href={`${CUSTOMER_PATHS.newRequest}?draft=${draft.id}`} className={LINK_ARROW}>
                Edit →
              </Link>
            </header>
            <div className="px-5 py-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                {draft.needText.trim() || (
                  <span className="font-semibold text-amber-800">No description yet.</span>
                )}
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className={LABEL}>Service</dt>
                  <dd className="text-sm text-slate-700">
                    {chosenService || 'Not chosen — the description is all a provider gets'}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* ── Clarify ─────────────────────────────────────────────────────────────────── */}
          <section className={CARD}>
            <header className="flex items-center justify-between gap-3 border-b border-solid border-slate-200 px-5 py-3">
              <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                {STEP_LABELS.clarify}
              </h2>
              <Link href={`${CUSTOMER_PATHS.clarify}?draft=${draft.id}`} className={LINK_ARROW}>
                Edit →
              </Link>
            </header>
            <div className="px-5 py-4">
              {answeredIds.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nothing answered yet — that is allowed. A provider will ask what they need to know.
                </p>
              ) : (
                <dl className="space-y-3">
                  {answeredIds.map(id => {
                    const value = answers[id];
                    const isNotSure = value === NOT_SURE || notSure.has(id);
                    return (
                      <div key={id}>
                        <dt className="text-xs font-semibold text-slate-500">
                          {questionText.get(id)?.question ?? id}
                        </dt>
                        <dd className="mt-0.5 text-sm text-slate-800">
                          {value === NOT_SURE ? (
                            <span className="font-mono text-[11px] font-bold tracking-wider text-amber-800 uppercase">
                              Not sure yet
                            </span>
                          ) : (
                            value
                          )}
                          {value !== NOT_SURE && isNotSure ? (
                            <span className="ml-2 font-mono text-[11px] font-bold tracking-wider text-amber-800 uppercase">
                              not certain
                            </span>
                          ) : null}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
              <p className="mt-3 text-xs text-slate-500">
                “Not sure yet” is passed on as exactly that, so a provider reads it as something to ask
                about rather than as a blank they should assume is fine.
              </p>
            </div>
          </section>

          {/* ── Logistics ───────────────────────────────────────────────────────────────── */}
          <section className={CARD}>
            <header className="flex items-center justify-between gap-3 border-b border-solid border-slate-200 px-5 py-3">
              <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                {STEP_LABELS.logistics}
              </h2>
              <Link href={`${CUSTOMER_PATHS.logistics}?draft=${draft.id}`} className={LINK_ARROW}>
                Edit →
              </Link>
            </header>
            <div className="px-5 py-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className={LABEL}>Service area</dt>
                  <dd className="text-sm text-slate-800">
                    {locationName ?? (
                      <span className="font-semibold text-amber-800">Not chosen yet</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className={LABEL}>Urgency</dt>
                  <dd className="text-sm text-slate-800">
                    {URGENCY_LABELS[draft.urgency] ?? draft.urgency}
                  </dd>
                </div>
                <div>
                  <dt className={LABEL}>Landmark</dt>
                  <dd className="text-sm text-slate-800">{scope.landmark || '—'}</dd>
                </div>
                <div>
                  <dt className={LABEL}>Preferred</dt>
                  <dd className="text-sm text-slate-800">
                    {[scope.preferred_date, scope.preferred_window].filter(Boolean).join(' · ') || 'No preference'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className={LABEL}>Access notes</dt>
                  <dd className="text-sm whitespace-pre-wrap text-slate-800">
                    {scope.access_notes || '—'}
                  </dd>
                </div>
              </dl>

              {scope.hazardous ? (
                <p className="mt-4 rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900">
                  This description matched a trade that can be dangerous. If anything is unsafe right
                  now, call the emergency services first — submitting this form contacts nobody.
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {/* ── Submit ───────────────────────────────────────────────────────────────────── */}
        <aside className="space-y-4">
          <form action={submitIntakeAction} className={`${CARD} p-5`}>
            <input type="hidden" name="draft_id" value={draft.id} />
            <input type="hidden" name="urgency" value={draft.urgency} />

            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className={LABEL}>How should we contact you?</legend>
              <div className="space-y-2.5">
                {CONTACT_PREFERENCES.map(preference => (
                  <label
                    key={preference.value}
                    className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700"
                  >
                    <input
                      type="radio"
                      name="contact_preference"
                      value={preference.value}
                      defaultChecked={(scope.contact_preference ?? 'in_app') === preference.value}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="block font-semibold text-slate-800">{preference.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{preference.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-5 flex cursor-pointer items-start gap-2.5 border-t border-solid border-slate-200 pt-4 text-xs leading-relaxed text-slate-600">
              <input
                type="checkbox"
                name="agree"
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <span>
                The details above are accurate as far as I know, and I agree that this description may be
                shown to providers matched to the work, along with how to contact me. I understand that
                this platform does not send anyone until I accept a quote.
              </span>
            </label>

            <button
              type="submit"
              className="mt-4 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-3 font-mono text-sm font-bold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
            >
              Submit request →
            </button>

            <p className="mt-2 text-center text-xs text-slate-500">
              Matching begins immediately. Quotes usually arrive before any provider is assigned, and
              nothing is charged at this step.
            </p>
          </form>

          <form action={saveIntakeDraftAction} className={`${CARD} p-5`}>
            <input type="hidden" name="step" value="review" />
            <input type="hidden" name="draft_id" value={draft.id} />
            <input type="hidden" name="intent" value="save" />

            <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Not ready?
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Saving keeps this as a draft only you can see. No provider is contacted and nothing is
              matched until you submit.
            </p>
            <button
              type="submit"
              className="mt-3 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
            >
              Save as draft
            </button>
          </form>

          <div className="rounded-xl border border-solid border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              What happens after this
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">
              <li>
                · The request is written to your account and queued for provider matching. The reference
                it gets is shown on the next screen.
              </li>
              <li>
                · No email, SMS or push message is sent by this platform yet — the notification channel
                is not built, and the confirmation screen says so rather than offering switches that do
                nothing.
              </li>
              <li>
                · Your contact preference above is recorded on the request so it is there for whichever
                channel is built first.
              </li>
            </ul>
          </div>

          <Link
            href={`${CUSTOMER_PATHS.logistics}?draft=${draft.id}`}
            className={`${LINK_ARROW} text-xs`}
          >
            ← Back to logistics
          </Link>
        </aside>
      </div>
    </IntakeStepShell>
  );
}
