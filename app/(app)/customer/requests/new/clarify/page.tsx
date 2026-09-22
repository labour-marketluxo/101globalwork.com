import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IntakeStepShell } from '@/components/customer/IntakeChrome';
import { CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { saveIntakeDraftAction } from '@/features/customer/actions';
import {
  CUSTOMER_PATHS,
  NOT_SURE,
  clarifyingQuestions,
  suggestService,
  type ClarifyQuestion,
} from '@/features/customer/intake';
import { getRequestDraft } from '@/features/customer/requests';

export const metadata = {
  title: 'A few questions',
  robots: { index: false, follow: false },
};

type Params = { draft?: string; failed?: string; saved?: string };

/**
 * Step 2 — Clarify.
 *
 * ⚠️ THE QUESTION SET IS DERIVED, NOT STORED. It comes from the same deterministic classifier step 1
 * used, re-run here over the description AND the service the visitor chose — so picking "Plumbing
 * repair" next to a vague description still produces the plumbing questions. Storing the question list
 * would have meant a draft written before a question was added could never be asked it.
 *
 * Every question carries a real "why", because "how does a provider get to the work" reads like
 * bureaucracy until you know that access is where site visits fail. And every question — including the
 * ones with choices — carries "Not sure", because a form that cannot be finished honestly gets finished
 * dishonestly.
 *
 * The reasoning is behind `<details>` rather than always visible: it matters to the people who want it
 * and is noise to the people who just want to answer. The default disclosure marker is left in place —
 * it is the one part of the control a keyboard and a screen reader both already understand.
 */
export default async function IntakeClarifyPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;

  if (!params.draft) redirect(`${CUSTOMER_PATHS.newRequest}?failed=not_found`);

  const draft = await getRequestDraft(params.draft);
  // A draft that is gone — submitted in another tab, or someone else's id — sends the visitor back to
  // the start rather than to an empty question set with no request behind it.
  if (!draft) redirect(`${CUSTOMER_PATHS.newRequest}?failed=not_found`);

  const chosenService = draft.services.find(service => service.id === draft.serviceEntityId)?.name ?? '';
  // The service name joins the description so a chosen service contributes its own words to the match.
  const { tags } = suggestService(`${draft.needText} ${chosenService}`, draft.services);
  const questions = clarifyingQuestions(tags);

  const scope = draft.scope as { answers?: Record<string, string>; not_sure?: string[] };
  const answers = scope.answers ?? {};
  const notSure = new Set(scope.not_sure ?? []);

  return (
    <IntakeStepShell
      step="clarify"
      title="A few questions about the work"
      lede="These are the questions a provider would otherwise have to ask before pricing it. Answer what you can and mark the rest “Not sure” — that is a real answer too, and it is better than a guess."
      failed={params.failed}
      saved={params.saved === '1'}
    >
      <form action={saveIntakeDraftAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <input type="hidden" name="step" value="clarify" />
        <input type="hidden" name="draft_id" value={draft.id} />

        <div className="space-y-4">
          {questions.map((question: ClarifyQuestion) => {
            const prior = answers[question.id];
            const priorIsNotSure = notSure.has(question.id) || prior === NOT_SURE;

            return (
              <fieldset key={question.id} className={`${CARD} m-0 min-w-0 p-5`}>
                <input type="hidden" name="question_id" value={question.id} />

                <legend className="p-0 text-sm font-bold text-slate-900">{question.question}</legend>

                <details className="mt-2">
                  <summary className={`${LABEL} mt-0 cursor-pointer`}>Why we ask this</summary>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{question.why}</p>
                </details>

                <div className="mt-3">
                  {question.kind === 'choice' && question.options ? (
                    <div className="space-y-2">
                      {question.options.map(option => (
                        <label key={option} className="flex items-start gap-2.5 text-sm text-slate-700">
                          <input
                            type="radio"
                            name={`answer__${question.id}`}
                            value={option}
                            defaultChecked={prior === option}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      id={`answer__${question.id}`}
                      type="text"
                      name={`answer__${question.id}`}
                      defaultValue={prior && prior !== NOT_SURE ? prior : ''}
                      placeholder={question.placeholder}
                      className={FIELD}
                    />
                  )}
                </div>

                <label className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    name={`not_sure__${question.id}`}
                    defaultChecked={priorIsNotSure}
                    className="h-4 w-4 shrink-0 accent-secondary"
                  />
                  Not sure
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  {question.measurable
                    ? 'If you can measure it, a provider can price it without a visit. If you cannot, say so — that is what the site visit is for.'
                    : 'Marking this records that you do not know yet, which a provider reads differently from a blank answer.'}
                </p>
              </fieldset>
            );
          })}

          <div className="flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-5">
            <button
              type="submit"
              name="intent"
              value="continue"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-2.5 font-mono text-sm font-bold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
            >
              Continue to logistics →
            </button>
            <button
              type="submit"
              name="intent"
              value="save"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
            >
              Save draft
            </button>
            <Link
              href={`${CUSTOMER_PATHS.newRequest}?draft=${draft.id}`}
              className={`${LINK_ARROW} ml-auto`}
            >
              ← Back to intent
            </Link>
          </div>
        </div>

        <aside className="space-y-3">
          <div className={CARD}>
            <div className="border-b border-solid border-slate-200 px-4 py-3">
              <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                What you have so far
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm leading-relaxed text-slate-700">
                {draft.needText.trim() || 'No description yet.'}
              </p>
              {chosenService ? (
                <p className="mt-2 font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
                  {chosenService}
                </p>
              ) : null}
            </div>
          </div>

          <div className={CARD}>
            <div className="px-4 py-3">
              <p className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Why these questions
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {tags.length > 0
                  ? `They were picked from the trades your description matched: ${tags.join(', ')}.`
                  : 'Your description did not match a specific trade, so this is the short set that applies to any work.'}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                {questions.length} question{questions.length === 1 ? '' : 's'} — deliberately no more.
                A clarification step long enough to be abandoned costs a quote entirely.
              </p>
            </div>
          </div>
        </aside>
      </form>
    </IntakeStepShell>
  );
}
