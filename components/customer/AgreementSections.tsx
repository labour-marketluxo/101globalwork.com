import { AlertTriangle, BadgeCheck, CircleSlash, Download, KeyRound, MailCheck, MessageSquare, ShieldCheck } from '@/components/ui/icons';
import { CARD, FIELD, LABEL } from '@/components/discovery/tokens';
import {
  acceptAgreementAction,
  clarifyAgreementAction,
  declineAgreementAction,
  sendAgreementCodeAction,
} from '@/features/customer/actions';
import { CONSENT_VERSION, type AgreementSection, type ProjectAgreement } from '@/features/customer/agreement';
import { DecisionNotice } from '@/components/customer/QuoteSections';

/**
 * The agreement document and the box that accepts it.
 *
 * ⚠️ THE TWO HALVES OF THIS ARE DELIBERATELY SEPARATE. The document above is data turned into prose; the box
 * below is what records agreement to it. `currentHash` is computed from the very sections rendered here, so a
 * recorded acceptance can be checked against the terms on screen right now — which is what makes the
 * "these terms have changed since you accepted" notice possible at all.
 */

export function AgreementTerms({ sections }: { sections: AgreementSection[] }) {
  return (
    <section aria-labelledby="terms-heading" className={`${CARD} p-5 sm:p-6`}>
      <h2 id="terms-heading" className="text-base font-bold text-slate-900">
        The agreement
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
        Every line below is built from this assignment: the accepted quote version, the price in it, the
        payment obligation beside it, and what the platform does and does not do. Nothing here is boilerplate
        that could describe a different job.
      </p>

      <div className="mt-5 space-y-6">
        {sections.map(section => (
          <div key={section.title}>
            <h3 className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
              {section.title}
            </h3>
            <ul className="mt-2 space-y-2">
              {section.lines.map((line, index) => (
                <li key={index} className="text-sm leading-relaxed text-slate-700">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The three things a customer can do instead of signing: keep a copy, ask a question, or walk away.
 *
 * ⚠️ "DECLINE" IS ROUTED TO CANCELLING THE REQUEST, BECAUSE THAT IS WHAT IT ACTUALLY IS. Accepting the quote
 * created the assignment and the payment obligation and locked the version; nothing in this schema un-accepts a
 * quote. What a customer who will not sign can really do is end the job before any money moves, which is the
 * cancel command — and after money has moved that command refuses and says a refund has to be raised. A
 * "decline" button that quietly did nothing would be worse than the wrong word.
 */
export function AgreementAlternatives({ agreement }: { agreement: ProjectAgreement }) {
  return (
    <section aria-labelledby="alternatives-heading" className={`${CARD} p-5`}>
      <h2
        id="alternatives-heading"
        className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase"
      >
        Not ready to accept?
      </h2>

      <a
        href={`/customer/projects/${agreement.assignmentId}/agreement/download`}
        className="mt-3 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 no-underline uppercase transition-colors hover:border-primary hover:text-primary"
      >
        <Download aria-hidden="true" className="h-3.5 w-3.5" />
        Download Draft Agreement
      </a>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        The terms exactly as they are on this page, with the fingerprint that would be recorded if you accept
        them. It is headed as a draft for as long as it is one.
      </p>

      <details className="mt-4 border-t border-solid border-slate-200 pt-4">
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
          <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
          Ask about something in this agreement
        </summary>
        <form action={clarifyAgreementAction} className="mt-3 space-y-3">
          <input type="hidden" name="assignment_id" value={agreement.assignmentId} />
          <input type="hidden" name="quote_id" value={agreement.quoteId} />
          <div>
            <label className={LABEL} htmlFor="agreement-question">
              Your question
            </label>
            <textarea
              id="agreement-question"
              name="message"
              rows={3}
              required
              minLength={10}
              maxLength={2000}
              className={FIELD}
              placeholder="e.g. The warranty line says nothing about the parts. Can you confirm what is covered?"
            />
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            There is no chat here. The question is recorded against quote version {agreement.quoteVersionLabel},
            which is the only channel to the provider — they read it on their own copy. Asking does not change
            these terms, and a question about them is not a reason they change.
          </p>
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
          >
            Send the question
          </button>
        </form>
      </details>

      <details className="mt-4 border-t border-solid border-slate-200 pt-4">
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
          <CircleSlash aria-hidden="true" className="h-3.5 w-3.5" />
          Decline — end this job before it starts
        </summary>
        <form action={declineAgreementAction} className="mt-3 space-y-3">
          <input type="hidden" name="assignment_id" value={agreement.assignmentId} />
          <input type="hidden" name="request_id" value={agreement.requestId} />
          <div>
            <label className={LABEL} htmlFor="agreement-decline-reason">
              Why are you not going ahead?
            </label>
            <textarea
              id="agreement-decline-reason"
              name="reason"
              rows={3}
              required
              minLength={10}
              maxLength={2000}
              className={FIELD}
              placeholder="e.g. The warranty is not what I need, so I would rather not start than argue later."
            />
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            This cancels the request and ends the assignment
            {agreement.obligation ? `, and cancels the ${agreement.obligation.status} payment obligation beside it` : ''}
            . It does not un-accept the quote — an accepted version stays locked as the record of what was on the
            table; what ends is the job. If money has already been paid, the platform refuses this and a refund has
            to be raised by the platform team.
          </p>
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
          >
            <CircleSlash aria-hidden="true" className="h-3.5 w-3.5" />
            Decline and cancel the request
          </button>
        </form>
      </details>
    </section>
  );
}

function HumanDate({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <>
      {new Date(value).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}
    </>
  );
}

export function AcceptancePanel({
  agreement,
  currentHash,
  failed,
  verify,
  signed,
  asked,
}: {
  agreement: ProjectAgreement;
  currentHash: string;
  failed?: string;
  verify?: boolean;
  signed?: boolean;
  asked?: boolean;
}) {
  const acceptance = agreement.acceptance;
  const hashMatches = acceptance ? acceptance.agreementHash === currentHash : true;

  return (
    <section aria-labelledby="accept-heading" className="space-y-4">
      <DecisionNotice failed={failed} verify={verify} signed={signed} decided={asked ? 'asked' : undefined} />

      <div className={`${CARD} p-5`}>
        <h2 id="accept-heading" className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-slate-400" />
          Accepting this agreement
        </h2>

        {acceptance ? (
          <div className="mt-3 space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <BadgeCheck aria-hidden="true" className="h-4 w-4" />
              Accepted on <HumanDate value={acceptance.acceptedAt} />
            </p>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className={LABEL}>How it was verified</dt>
                <dd className="text-slate-700">
                  A one-time code by email
                  <span className="block text-slate-500">auth method recorded: {acceptance.authMethod}</span>
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Verification itself happened at</dt>
                <dd className="text-slate-700">
                  <HumanDate value={acceptance.verifiedAt} />
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className={LABEL}>Terms version</dt>
                <dd className="font-mono text-[11px] break-all text-slate-600">
                  {acceptance.consentVersion} · sha256 {acceptance.agreementHash}
                </dd>
              </div>
            </dl>

            {hashMatches ? (
              <p className="rounded-lg bg-primary-surface px-3 py-2 text-xs text-primary-deep">
                The terms on this page are the terms that were accepted — the fingerprint still matches.
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-lg border border-solid border-amber-300 bg-secondary-light px-3 py-2 text-xs font-semibold text-amber-900">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  These terms have changed since you accepted them (the fingerprint no longer matches the
                  accepted one). Your acceptance still stands for the version recorded above; treat anything
                  that differs as a change you have not agreed to.
                </span>
              </p>
            )}
          </div>
        ) : verify ? (
          <div className="mt-3 space-y-4">
            <form action={acceptAgreementAction} className="space-y-4">
              <input type="hidden" name="assignment_id" value={agreement.assignmentId} />
              <input type="hidden" name="agreement_hash" value={currentHash} />
              <input type="hidden" name="consent_version" value={CONSENT_VERSION} />

              <div>
                <label className={LABEL} htmlFor="token">
                  The six-digit code we emailed you
                </label>
                <input
                  id="token"
                  name="token"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  className={`${FIELD} max-w-40 font-mono text-lg tracking-[0.4em]`}
                  placeholder="000000"
                />
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Entering it is the verification. The platform checks, in the database, that the session calling
                  the acceptance authenticated seconds ago — a click on its own is not accepted as proof.
                </p>
              </div>

              <button
                type="submit"
                className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-3 font-mono text-sm font-bold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
              >
                <KeyRound aria-hidden="true" className="h-4 w-4" />
                Verify and sign
              </button>
            </form>

            {/* A sibling of the code form, not nested inside it: a form inside a form is invalid HTML and
                browsers drop the inner one. */}
            <form action={sendAgreementCodeAction}>
              <input type="hidden" name="assignment_id" value={agreement.assignmentId} />
              <input type="hidden" name="agree" value="on" />
              <button type="submit" className="text-xs font-semibold text-slate-500 underline hover:text-primary">
                Send a new code
              </button>
            </form>
          </div>
        ) : (
          <form action={sendAgreementCodeAction} className="mt-3 space-y-4">
            <input type="hidden" name="assignment_id" value={agreement.assignmentId} />

            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-slate-600">
              <input type="checkbox" name="agree" required className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
              <span>
                I have read the agreement above. I accept the price of the accepted quote
                {' '}(version {agreement.quoteVersionLabel}) and I understand that accepting it does not pay
                anything on its own — payment is released against approved work. I also understand that a code
                will be sent to {agreement.customerEmail ?? 'my email address'} and that entering it is what
                records my acceptance.
              </span>
            </label>

            <button
              type="submit"
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-3 font-mono text-sm font-bold text-white shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
            >
              <MailCheck aria-hidden="true" className="h-4 w-4" />
              Sign &amp; Accept Agreement
            </button>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                There are no <span className="font-mono">Download</span> buttons here beyond the browser&apos;s
                own print-to-PDF: no document is generated or stored, only these terms and the record of
                accepting them. Nothing on this page is an e-signature.
              </span>
            </p>
          </form>
        )}
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          Recorded against this agreement
        </h2>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className={LABEL}>Customer</dt>
            <dd className="text-slate-700">{agreement.customerLabel}</dd>
          </div>
          <div>
            <dt className={LABEL}>Provider</dt>
            <dd className="text-slate-700">
              {agreement.providerName}
              {agreement.providerIdentityVerified ? ' · identity verified' : ' · identity not verified'}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>Assignment</dt>
            <dd className="font-mono text-[11px] break-all text-slate-600">{agreement.assignmentId}</dd>
          </div>
          <div>
            <dt className={LABEL}>Status</dt>
            <dd className="text-slate-700">{agreement.assignmentStatus}</dd>
          </div>
          <div>
            <dt className={LABEL}>Payment obligation</dt>
            <dd className="text-slate-700">
              {agreement.obligation ? agreement.obligation.status : 'none'}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>Scheduled</dt>
            <dd className="text-slate-700">
              {agreement.schedule?.scheduledStart ? <HumanDate value={agreement.schedule.scheduledStart} /> : 'not scheduled yet'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          The obligation above is recorded, but funding it is not part of this agreement and the platform does
          not gate payment on this acceptance: the money path is the same one it has always been.
        </p>
      </div>
    </section>
  );
}
