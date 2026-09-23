import { CircleCheck, Info, LifeBuoy } from 'lucide-react';
import { BADGE_SLATE, CARD } from '@/components/discovery/tokens';
import { PROVIDER_PUBLISH_STEPS, type ProviderPublishStepKey } from '@/features/provider-workspace/paths';

/**
 * The onboarding chrome: progress, eligibility rules, and what to do when stuck.
 *
 * ⚠️ THE FOUR STEPS ARE FOUR FACTS, NOT FOUR PAGES. Each one is derived from the provider's own records
 * — a name, an active service and area, a verified identity, a verified payout destination — so the bar
 * cannot claim a step is done because a form was submitted with an empty value in it. That also means
 * the provider can finish the steps in any order, which is what the page allows: nothing is gated on
 * reaching step three before step four.
 *
 * ⚠️ PAYOUT SETUP IS THE LAST STEP AND NOT A PUBLICATION GATE, and the bar says so rather than implying
 * that publishing waits on it. Publication needs the first three; a payout account is needed before
 * cleared money can move, which is a different deadline.
 */

export type OnboardingStep = {
  key: ProviderPublishStepKey;
  done: boolean;
  detail: string;
  href: string;
  cta: string;
};

export function OnboardingSteps({ steps }: { steps: OnboardingStep[] }) {
  const doneCount = steps.filter(step => step.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);
  const current = steps.find(step => !step.done) ?? null;

  return (
    <section className={`${CARD} p-5`} aria-labelledby="setup-progress-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-progress-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Setup progress
        </h2>
        <p className="font-mono text-xs text-slate-600">
          {doneCount}/{steps.length} · {percent}%
        </p>
      </div>

      {/* The bar is decorative: the list below carries the same information as text, which is what a
          screen reader reads and what a visitor with no colour perception can use. */}
      <div aria-hidden="true" className="mt-3 flex gap-1.5">
        {PROVIDER_PUBLISH_STEPS.map(step => {
          const state = steps.find(candidate => candidate.key === step.key);
          return (
            <span
              key={step.key}
              className={`h-1.5 flex-1 rounded-full ${state?.done ? 'bg-primary' : 'bg-slate-200'}`}
            />
          );
        })}
      </div>

      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {PROVIDER_PUBLISH_STEPS.map((step, index) => {
          const state = steps.find(candidate => candidate.key === step.key);
          const isCurrent = current?.key === step.key;
          return (
            <li
              key={step.key}
              className={`rounded-xl border border-solid p-3.5 ${
                state?.done
                  ? 'border-primary-subtle bg-primary-surface'
                  : isCurrent
                    ? 'border-secondary bg-secondary-light'
                    : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold tracking-tight text-slate-900">
                  {index + 1}. {step.label}
                </p>
                {state?.done ? (
                  <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : isCurrent ? (
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber-800 uppercase">
                    Next
                  </span>
                ) : (
                  <span className={BADGE_SLATE}>Later</span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{state?.detail ?? step.note}</p>
              {state?.href ? (
                <a
                  href={state.href}
                  className="mt-2 inline-block font-mono text-xs font-semibold text-primary underline underline-offset-2"
                >
                  {state.cta}
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The eligibility rules, in the order the platform applies them.
 *
 * ⚠️ THESE ARE THE REAL RULES, WRITTEN OUT. Matching is decided by `find_eligible_providers` /
 * `evaluate_provider_match`: an active provider, offering the request's service, covering its area, with
 * readiness at or above 60. Publication additionally requires a verified identity. A provider who
 * understands these can predict exactly which requests will reach them — which is the point of showing
 * them rather than a vague sentence about "quality".
 */
export function EligibilityPanel() {
  return (
    <section className={`${CARD} p-5`} aria-labelledby="eligibility-heading">
      <h2 id="eligibility-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <Info aria-hidden="true" className="h-4 w-4 text-primary" />
        How eligibility is decided
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        The platform applies these in order, and every one of them must hold before a request is offered
        to you. Nothing here is a judgement of quality — they are facts about your records.
      </p>
      <ol className="mt-3 grid gap-2">
        <li className="rounded-xl border border-solid border-slate-200 p-3 text-xs leading-relaxed text-slate-600">
          <strong className="font-semibold text-slate-800">Market.</strong> The request must belong to a
          market your provider identity is registered in.
        </li>
        <li className="rounded-xl border border-solid border-slate-200 p-3 text-xs leading-relaxed text-slate-600">
          <strong className="font-semibold text-slate-800">Category.</strong> The request&apos;s trade
          must be on your active service list. A category you have not selected is work you are invisible
          for, whatever else the profile says.
        </li>
        <li className="rounded-xl border border-solid border-slate-200 p-3 text-xs leading-relaxed text-slate-600">
          <strong className="font-semibold text-slate-800">Coverage.</strong> The request&apos;s location
          must be inside one of your active service areas. The platform holds no street address for you
          or for the customer — this check is area to area.
        </li>
        <li className="rounded-xl border border-solid border-slate-200 p-3 text-xs leading-relaxed text-slate-600">
          <strong className="font-semibold text-slate-800">Readiness.</strong> Your readiness score must
          be 60 or above, which in practice means an active service, an active area and a written public
          profile.
        </li>
        <li className="rounded-xl border border-solid border-slate-200 p-3 text-xs leading-relaxed text-slate-600">
          <strong className="font-semibold text-slate-800">Publication.</strong> A profile that is not
          published is not in the marketplace at all, and publication itself requires a verified
          identity.
        </li>
      </ol>
    </section>
  );
}

/**
 * "Get help", answered honestly.
 *
 * There is no support inbox in this project — nothing in the repository contains one — so a mailto link
 * would be an address the platform cannot read. What this panel can do is answer the questions that
 * actually arrive during setup, and say plainly that there is no human to escalate to yet. A support
 * link that goes nowhere is worse than saying so.
 */
export function HelpPanel({ providerName }: { providerName: string | null }) {
  return (
    <details className={`${CARD} p-5`}>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <LifeBuoy aria-hidden="true" className="h-4 w-4 text-primary" />
        Get help with setup
      </summary>

      <div className="mt-3 grid gap-3 text-xs leading-relaxed text-slate-600">
        <p>
          <strong className="font-semibold text-slate-800">Nothing is saving.</strong> Each step saves on
          its own when you press its button — there is no single save at the end, and no draft to lose.
          If a step refuses, it says why above the form rather than silently keeping your input.
        </p>
        <p>
          <strong className="font-semibold text-slate-800">I cannot publish.</strong> Publication needs a
          verified identity, at least one active service, at least one active area, a public description
          of 80 characters or more, and a readiness score of at least 60. The progress list above names
          which of those is still open and links to the page that changes it.
        </p>
        <p>
          <strong className="font-semibold text-slate-800">My verification is pending.</strong> Review is
          manual. You can keep editing the profile while it is pending; publishing waits, and nothing else
          does.
        </p>
        <p>
          <strong className="font-semibold text-slate-800">I need a person.</strong> This platform has no
          support inbox yet — it would be dishonest to show a contact link that nobody reads. The rules on
          this page are the same ones the platform enforces, so a step that refuses will always name the
          rule it refused on.
        </p>
        {providerName ? (
          <p className="font-mono text-[11px] tracking-wide text-slate-500 uppercase">
            Setup for: {providerName}
          </p>
        ) : null}
      </div>
    </details>
  );
}
