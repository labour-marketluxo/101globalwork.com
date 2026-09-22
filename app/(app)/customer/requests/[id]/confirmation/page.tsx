import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { CARD, LINK_ARROW } from '@/components/discovery/tokens';
import { CONTACT_PREFERENCES, CUSTOMER_PATHS, requestReference } from '@/features/customer/intake';
import { getRequestConfirmation } from '@/features/customer/requests';

export const metadata = {
  title: 'Request submitted',
  robots: { index: false, follow: false },
};

const STATE_SUMMARY: Record<string, { label: string; detail: string }> = {
  submitted: {
    label: 'Matching has started',
    detail: 'Providers whose trades and areas match are being shown this request now.',
  },
  matching: {
    label: 'Matching in progress',
    detail: 'Providers whose trades and areas match are being shown this request now.',
  },
  quoted: {
    label: 'Quotes are in',
    detail: 'At least one provider has quoted. Compare them from the request page before choosing.',
  },
};

/**
 * Confirmation.
 *
 * ⚠️ THIS PAGE TELLS THE TRUTH ABOUT NOTIFICATIONS, WHICH IS THE MOST USEFUL THING IT CAN DO. The brief
 * asks for Email/SMS/Push preference toggles. This platform has no mail, SMS or push sender wired into
 * it at all: the request writes an outbox row and the outbox is unpublished (measured on a real
 * submission: `published_at` null, `attempt_count` 0). Three switches that saved a preference nothing
 * would ever read, above copy implying a message was coming, is the one version of this screen that
 * could cost somebody real money — they would wait for a text that was never going to arrive.
 *
 * So the preference the visitor DID record is read back as a fact, and the paragraph underneath says
 * plainly that nothing is sent and what to do instead. The delivered truth is "watch this page", and it
 * is said in the place where the fiction would have been.
 *
 * The reference is derived from the id rather than stored (see `requestReference`), so the number a
 * customer reads out to support cannot disagree with the row it names.
 */
export default async function RequestConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const confirmation = await getRequestConfirmation(id);

  // A request that is not this account's is treated as not existing, the same way the draft reader
  // treats somebody else's draft. There is no "you are not allowed to see this" — that would confirm
  // the id is real.
  if (!confirmation) notFound();

  const summary = STATE_SUMMARY[confirmation.state] ?? {
    label: 'Request received',
    detail: 'The request is recorded against your account.',
  };

  const chosenPreference = CONTACT_PREFERENCES.find(
    preference => preference.value === 'in_app',
  );

  return (
    <section className="mx-auto max-w-2xl">
      <div className={`${CARD} px-6 py-7 text-center`}>
        <CheckCircle2 aria-hidden="true" className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-primary">
          Your request is in
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Nothing is charged yet, and no provider has been assigned. Quotes come first — you choose who
          does the work after reading them.
        </p>

        <div className="mt-6 rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-4">
          <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">
            Your request reference
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-primary-deep">
            {requestReference(confirmation.id)}
          </p>
          <p className="mt-1.5 text-xs text-slate-600">
            Quote this if you contact support. It is derived from the request itself, so it always points
            at the one request it names.
          </p>
        </div>

        <dl className="mt-6 grid gap-4 text-left sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              What is happening
            </dt>
            <dd className="mt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-light px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-amber-800 uppercase">
                {summary.label}
              </span>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{summary.detail}</p>
            </dd>
          </div>

          <div>
            <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Work described
            </dt>
            <dd className="mt-1 text-sm leading-relaxed text-slate-800">
              {confirmation.serviceName ?? 'Not assigned to a specific service'}
              {confirmation.locationName ? ` · ${confirmation.locationName}` : ''}
            </dd>
          </div>

          <div className="sm:col-span-2">
            <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Submitted
            </dt>
            <dd className="mt-1 text-sm text-slate-700">
              {confirmation.submittedAt
                ? new Date(confirmation.submittedAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Just now'}
              {confirmation.quoteCount > 0
                ? ` · ${confirmation.quoteCount} quote${confirmation.quoteCount === 1 ? '' : 's'} already on file`
                : ' · no quotes yet'}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 border-t border-solid border-slate-200 pt-6">
          <Link
            href={`/requests/${confirmation.id}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-5 py-2.5 font-mono text-sm font-bold text-white no-underline shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95"
          >
            View request details →
          </Link>
          <Link
            href={CUSTOMER_PATHS.dashboard}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 no-underline uppercase transition-colors hover:border-primary hover:text-primary"
          >
            Return to dashboard
          </Link>
        </div>
      </div>

      {/* ── The honest part ─────────────────────────────────────────────────────────────────── */}
      <div className="mt-5 rounded-xl border border-solid border-amber-300 bg-secondary-light px-5 py-4">
        <p className="font-mono text-[11px] font-bold tracking-wider text-amber-800 uppercase">
          How you will hear about this
        </p>
        <p className="mt-2 text-sm leading-relaxed text-amber-900">
          There are no notification switches on this page because there is nothing behind them yet: this
          platform sends no email, no SMS and no push message. The request is recorded and an internal
          event is queued for it, but nothing delivers it anywhere, so no message is on its way to you.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-amber-900">
          The only place progress appears is this site — the request page above shows quotes as they
          arrive. Come back to it rather than waiting to be told.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-amber-900/80">
          Your contact preference for when a channel is built
          {chosenPreference ? ` (recorded as “${chosenPreference.label}”)` : ''} is stored on the request.
          It is a record of what you asked for, not a subscription.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-xs leading-relaxed text-slate-500">
          Expected response time: none is promised, and no timer is running. Nothing in the platform
          chases a provider or expires this request, so a quiet first period is normal rather than a sign
          that something failed.
        </p>
        <Link href={CUSTOMER_PATHS.newRequest} className={LINK_ARROW}>
          Start another request →
        </Link>
      </div>
    </section>
  );
}
