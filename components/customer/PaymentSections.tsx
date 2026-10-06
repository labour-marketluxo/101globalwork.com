import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Clock,
  CreditCard,
  Download,
  FileText,
  Hourglass,
  Info,
  QrCode,
  ShieldCheck,
  XCircle,
} from '@/components/ui/icons';
import { BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { PayButton, SendCodeButton } from '@/components/customer/PayButton';
import {
  raisePaymentDisputeRequestAction,
  sendCheckoutCodeAction,
  startCheckoutAction,
  verifyCheckoutCodeAction,
  withdrawPaymentDisputeRequestAction,
} from '@/features/customer/payment-actions';
import {
  CHANNEL_LABELS,
  PAYMENT_FAILURE_COPY,
  PAYMENT_GROUPS,
  RECONCILED_COPY,
  formatMoney,
  isPayable,
  paymentFailureCode,
  paymentGroupOf,
  type CheckoutAdapter,
  type CheckoutBreakdown,
  type PaymentAttempt,
  type PaymentLedgerRow,
  type ReconciledState,
} from '@/features/customer/payments';

/**
 * The payment surfaces: the ledger list, one payment's record, and the checkout that starts a payment.
 *
 * ⚠️ "RECONCILED" IS THE ONLY BADGE THAT MEANS ANYTHING, AND IT IS DERIVED FROM THE LEDGER. Every card here
 * shows a reconciliation badge whose state comes from `payment_reconciliations` — a verified provider event
 * matched to a balanced ledger transaction. An attempt the gateway reported as succeeded, but that no event
 * has matched, reads "Awaiting reconciliation", because that is what the platform's books say, and the books
 * are the authority.
 */

const AMBER =
  'inline-flex items-center gap-1.5 rounded-full bg-secondary-light px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-amber-800 uppercase';
const TEAL =
  'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase';

export function PaymentNotice({
  failed,
  requested,
  paymentError,
}: {
  failed?: string;
  requested?: string;
  paymentError?: string;
}) {
  // Two vocabularies reach these pages: the customer actions' codes, and the checkout API's `payment_error`
  // codes. Both are fixed lists; neither is ever the database's or the gateway's own text.
  const code = paymentFailureCode(failed ?? paymentError);

  const requestedCopy: Record<string, string> = {
    dispute:
      'Recorded. The platform team reads these — the panel below says what happens next, and what the platform cannot do on its own.',
    refund:
      'Recorded. A refund is raised by the platform team, not from this page; they will see your reason against this payment.',
    withdrawn: 'Your request was withdrawn.',
  };

  return (
    <div className="mb-6 space-y-3">
      {code ? (
        <p
          role="alert"
          className="rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900"
        >
          {PAYMENT_FAILURE_COPY[code]}
        </p>
      ) : null}
      {!code && requested && requestedCopy[requested] ? (
        <p className="rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-sm font-semibold text-primary">
          {requestedCopy[requested]}
        </p>
      ) : null}
    </div>
  );
}

export function ReconciledBadge({ state }: { state: ReconciledState }) {
  const copy = RECONCILED_COPY[state];
  const icon =
    state === 'reconciled' ? (
      <BadgeCheck aria-hidden="true" className="h-3 w-3" />
    ) : state === 'attention' ? (
      <XCircle aria-hidden="true" className="h-3 w-3" />
    ) : (
      <Hourglass aria-hidden="true" className="h-3 w-3" />
    );
  return (
    <span
      title={copy.explanation}
      className={state === 'reconciled' ? TEAL : state === 'attention' ? AMBER : BADGE_SLATE}
    >
      {icon}
      {copy.label}
    </span>
  );
}

/** Initials, not a photograph: the platform holds no provider images, and an empty frame is worse. */
function ProviderAvatar({ name }: { name: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('') || '?';
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-solid border-slate-300 bg-white font-mono text-xs font-bold text-primary"
    >
      {initials}
    </span>
  );
}

/**
 * The "Due" line.
 *
 * ⚠️ THE PLATFORM SETS NO DUE DATE, AND THIS SAYS SO RATHER THAN PRINTING ONE. `payment_obligations` has no
 * `due_at`, nothing writes one, and an obligation becomes payable the moment it exists. Rendering a date the
 * platform would not enforce — a quote's validity, or the row's creation time dressed up as a deadline —
 * would be inventing a financial term, which is the one thing this page must not do.
 */
function DueLine({ row }: { row: PaymentLedgerRow }) {
  if (isPayable(row)) {
    return (
      <>
        Payable now
        <span className="mt-0.5 block text-xs text-slate-500">
          No due date is set — it became payable when you accepted the quote.
        </span>
      </>
    );
  }
  if (row.releasedAt) {
    return (
      <>
        Settled{' '}
        {new Date(row.releasedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        <span className="mt-0.5 block text-xs text-slate-500">Released to the provider.</span>
      </>
    );
  }
  if (row.settledAt) {
    return (
      <>
        Settled{' '}
        {new Date(row.settledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        <span className="mt-0.5 block text-xs text-slate-500">Confirmed against the ledger.</span>
      </>
    );
  }
  return (
    <>
      Nothing owed
      <span className="mt-0.5 block text-xs text-slate-500">No money has been taken for this payment.</span>
    </>
  );
}

export function PaymentCard({ row }: { row: PaymentLedgerRow }) {
  return (
    <li className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ProviderAvatar name={row.providerName} />
          <div className="min-w-0">
            <p className="text-lg font-bold text-primary">{formatMoney(row.amountMinor, row.currencyCode)}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{row.providerName}</p>
            <Link
              href={`/customer/requests/${row.requestId}`}
              className="mt-0.5 block truncate text-xs text-slate-500 no-underline hover:text-primary"
            >
              {row.requestLabel}
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ReconciledBadge state={row.reconciledState} />
          <span className={BADGE_SLATE}>{row.obligationStatus.replace(/_/g, ' ')}</span>
        </div>
      </div>

      <dl className="mt-3 grid gap-3 border-t border-solid border-slate-200 pt-3 sm:grid-cols-2">
        <div>
          <dt className={LABEL}>Due</dt>
          <dd className="text-sm text-slate-800">
            <DueLine row={row} />
          </dd>
        </div>
        <div>
          <dt className={LABEL}>Reference</dt>
          <dd className="font-mono text-xs break-all text-slate-700">
            {row.paymentReference ?? 'No payment has been started'}
          </dd>
        </div>
      </dl>

      {row.refundedMinor > 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Refunded so far:{' '}
          <span className="font-semibold">{formatMoney(row.refundedMinor, row.currencyCode)}</span> of{' '}
          {formatMoney(row.amountMinor, row.currencyCode)}.
        </p>
      ) : null}

      {row.openDisputeRequests > 0 ? (
        <p className="mt-3 rounded-lg border border-solid border-amber-300 bg-secondary-light px-3 py-2 text-xs font-semibold text-amber-900">
          You have an open request about this payment. The platform team reads it; nothing has changed about the
          money yet.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-3">
        {isPayable(row) ? (
          <Link
            href={`/customer/payments/${row.paymentId}/checkout`}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-4 py-2 font-mono text-xs font-bold text-white no-underline shadow-sm transition-colors hover:bg-secondary-dark"
          >
            Pay {formatMoney(row.amountMinor, row.currencyCode)} safely
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        <Link href={`/customer/payments/${row.paymentId}`} className={LINK_ARROW}>
          Open the record <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
        <a href={`/customer/payments/${row.paymentId}/receipt`} className={LINK_ARROW}>
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          Receipt
        </a>
      </div>
    </li>
  );
}

export function PaymentLedger({ rows }: { rows: PaymentLedgerRow[] }) {
  return (
    <div className="space-y-8">
      {PAYMENT_GROUPS.map(group => {
        // The grouping rule lives in `paymentGroupOf` and is called, not re-implemented: a second copy here is
        // exactly how a list and a badge start disagreeing about the same payment.
        const groupRows = rows.filter(row => paymentGroupOf(row) === group.key);
        if (groupRows.length === 0) return null;
        return (
          <section key={group.key} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                {group.label}
              </h2>
              <span className="font-mono text-[11px] font-bold text-slate-400">{groupRows.length}</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">{group.blurb}</p>
            <ul className="space-y-3">
              {groupRows.map(row => (
                <PaymentCard key={row.paymentId} row={row} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function PaymentEmpty() {
  return (
    <div className="rounded-2xl border border-dashed border-solid border-slate-300 bg-white px-6 py-12 text-center">
      <Banknote aria-hidden="true" className="mx-auto h-8 w-8 text-slate-300" />
      <h2 className="mt-3 text-base font-bold text-slate-900">No payments yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
        A payment appears here when you accept a quote. It is payable straight away, and none of it reaches the
        provider until you approve the finished work.
      </p>
      <Link href="/customer/requests" className={`${LINK_ARROW} mt-4`}>
        Open your requests
      </Link>
    </div>
  );
}

/**
 * A read failure, which is not the same answer as "you have nothing".
 *
 * ⚠️ THIS EXISTS SO A FAILED READ CANNOT BECOME A 404. `getCustomerPayment` returns no row both when a payment
 * is not yours and when the ledger read itself failed; the pages distinguish those with the `unavailable`
 * flag, because telling somebody their payment does not exist when the query merely errored is a lie about
 * their money.
 */
export function PaymentUnavailable() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-solid border-amber-300 bg-secondary-light px-6 py-8 text-center"
    >
      <p className="text-sm font-semibold text-amber-900">
        Your payment record could not be read just now.
      </p>
      <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-amber-900/90">
        Nothing has changed about any payment — this is a read failure on the platform&apos;s side, not a
        statement that the payment is missing or unpaid. Reload in a moment.
      </p>
      <Link href="/customer/payments" className={`${LINK_ARROW} mt-4`}>
        Back to payments
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// One payment's record
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type TimelineStep = {
  key: string;
  title: string;
  at: string | null;
  detail: string;
  tone: 'done' | 'current' | 'failed' | 'waiting';
};

/**
 * The status timeline, built from timestamps that exist.
 *
 * ⚠️ EVERY STEP IS AN INSTANT SOMEBODY RECORDED. "Created" is the attempt row, the event steps are the
 * verified provider events with the time they were received, and "Reconciled" is the moment a balanced ledger
 * transaction was posted. Nothing here is a progress bar: a step with no timestamp is shown as not reached,
 * and the current step says what it waits on rather than how long it should take, because the platform
 * promises no processing time anywhere.
 */
export function paymentTimeline(row: PaymentLedgerRow, attempts: PaymentAttempt[]): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const latest = attempts[0];

  if (!latest) {
    steps.push({
      key: 'created',
      title: 'No payment started',
      at: null,
      detail: 'Nobody has opened a checkout for this payment yet.',
      tone: 'waiting',
    });
    return steps;
  }

  steps.push({
    key: 'created',
    title: 'Payment created',
    at: latest.createdAt,
    detail: `A payment attempt was opened with ${latest.providerAdapter}.`,
    tone: 'done',
  });

  if (latest.status === 'pending_provider' && latest.events.length === 0) {
    steps.push({
      key: 'processing',
      title: 'Processing',
      at: latest.updatedAt,
      detail:
        'You were sent to the gateway’s own secure page. Nothing is confirmed until a verified event comes back.',
      tone: 'current',
    });
  }

  for (const event of latest.events) {
    const rejected = event.status === 'rejected' || Boolean(event.rejectionReason);
    steps.push({
      key: `event-${event.eventId}`,
      title: rejected ? 'Event rejected' : 'Provider event received',
      at: event.receivedAt || null,
      detail: rejected
        ? `Not used: ${(event.rejectionReason ?? 'the event did not pass verification').replace(/_/g, ' ')}. Nothing was posted to the ledger from it.`
        : `${event.eventType}${event.signatureVerified ? ', signature verified' : ''}.`,
      tone: rejected ? 'failed' : 'done',
    });

    if (event.result === 'matched' && event.ledgerTransactionId) {
      steps.push({
        key: `reconciled-${event.eventId}`,
        title: 'Reconciled against the ledger',
        at: event.reconciledAt,
        detail: 'The event was matched to a balanced ledger transaction. This is the record that counts.',
        tone: 'done',
      });
    }
    if (event.result === 'mismatch') {
      steps.push({
        key: `mismatch-${event.eventId}`,
        title: 'Amount or currency did not match',
        at: event.reconciledAt,
        detail: 'The event was recorded but nothing was posted, because it did not match this obligation.',
        tone: 'failed',
      });
    }
  }

  if (latest.status === 'succeeded') {
    steps.push({
      key: 'succeeded',
      title: 'Succeeded',
      at: latest.updatedAt,
      detail: row.hasLedgerTransaction
        ? 'The payment is funded and held until you approve the work.'
        : 'The gateway reported success. The ledger has not been matched yet — refresh shortly.',
      tone: row.hasLedgerTransaction ? 'done' : 'current',
    });
  } else if (latest.status === 'failed') {
    steps.push({
      key: 'failed',
      title: 'Failed',
      at: latest.updatedAt,
      detail:
        'No money was taken and nothing was posted to the ledger. You can start again from the checkout page.',
      tone: 'failed',
    });
  }

  return steps;
}

const TIMELINE_DOT: Record<TimelineStep['tone'], string> = {
  done: 'border-transparent bg-primary text-white',
  current: 'border-primary bg-white text-primary',
  failed: 'border-amber-500 bg-secondary-light text-amber-800',
  waiting: 'border-slate-300 bg-white text-slate-400',
};

export function PaymentStatusTimeline({ row, attempts }: { row: PaymentLedgerRow; attempts: PaymentAttempt[] }) {
  const steps = paymentTimeline(row, attempts);

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Status timeline
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
        Built from the timestamps the platform holds: the attempt, each verified provider event, and the ledger
        reconciliation. A browser returning from the gateway is not on this list, because it proves nothing.
      </p>

      <ol className="mt-4 space-y-4">
        {steps.map(step => (
          <li key={step.key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-solid text-[10px] font-bold ${TIMELINE_DOT[step.tone]}`}
            >
              {step.tone === 'done' ? '✓' : step.tone === 'failed' ? '!' : '·'}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-slate-900">{step.title}</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {step.at
                    ? new Date(step.at).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'not reached'}
                </span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Checkout
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'card') return <CreditCard aria-hidden="true" className="h-4 w-4" />;
  if (channel === 'qr') return <QrCode aria-hidden="true" className="h-4 w-4" />;
  return <Banknote aria-hidden="true" className="h-4 w-4" />;
}

/**
 * The checkout form.
 *
 * ⚠️ THE BREAKDOWN CANNOT DISAGREE WITH THE CHARGE. The gateway is initialised with
 * `payment_obligations.amount_minor`, and reconciliation refuses any event whose amount or currency differs —
 * so the total printed here is read from that same row rather than recomputed from parts. The platform's own
 * fee comes from the published policy, which is currently unpublished, and the page says exactly that instead
 * of showing a zero and letting the reader assume a schedule exists.
 */
export function CheckoutPanel({
  row,
  adapters,
  breakdown,
  adaptersUnavailable,
}: {
  row: PaymentLedgerRow;
  adapters: CheckoutAdapter[];
  breakdown: CheckoutBreakdown;
  adaptersUnavailable: boolean;
}) {
  const payable = isPayable(row);
  const primary = adapters[0];
  const channels = primary?.channels ?? [];

  return (
    <section className={`${CARD} p-5 sm:p-6`}>
      <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        What you are paying for
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{row.requestLabel}</p>
      <p className="mt-1 text-xs text-slate-500">
        {row.providerName} · payment reference {row.paymentReference ?? 'not started yet'}
      </p>

      <dl className="mt-5 border-t border-solid border-slate-200 pt-5">
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-sm text-slate-600">Agreed price for the work</dt>
          <dd className="text-sm font-medium text-slate-900">{formatMoney(row.amountMinor, row.currencyCode)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-sm text-slate-600">Platform fee</dt>
          <dd className="text-right text-sm text-slate-700">
            {formatMoney(breakdown.platformFeeMinor ?? 0, row.currencyCode)}
            <span className="mt-0.5 block text-xs text-slate-500">
              {breakdown.feeSchedulePublished
                ? 'A fee schedule is in force. This payment carries no separate fee line — the amount charged is the obligation created from the accepted quote.'
                : 'No fee schedule is in force, so the platform adds nothing. The pricing page says the same.'}
            </span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-sm text-slate-600">Taxes</dt>
          <dd className="text-right text-sm text-slate-700">
            <span className="block text-xs text-slate-500">
              The platform records no tax on this payment and adds none on the provider&apos;s behalf. Anything
              they owe on their own income is theirs to settle.
            </span>
          </dd>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-solid border-slate-200 pt-3">
          <dt className="text-sm font-bold text-slate-900">Total to pay</dt>
          <dd className="text-xl font-bold text-primary">
            {formatMoney(breakdown.totalMinor, row.currencyCode)}
          </dd>
        </div>
      </dl>

      <p className="mt-5 flex items-start gap-2 rounded-xl border border-solid border-primary-subtle bg-primary-surface px-4 py-3 text-xs leading-relaxed text-primary-deep">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-semibold">Payments are protected by platform milestone release rules.</span> The
          money is held, not handed over: it is released to the provider only after you approve the finished
          work. Nothing on this page can release it early.
        </span>
      </p>

      {!payable ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          This payment is not waiting to be paid any more — its status is{' '}
          <span className="font-semibold">{row.obligationStatus.replace(/_/g, ' ')}</span>. Nothing was charged
          from this page.
        </p>
      ) : adaptersUnavailable ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900"
        >
          The payment providers could not be read just now, so this page cannot say which methods are available.
          This is a read failure rather than a statement about {row.currencyCode} — reload in a moment. Nothing was
          charged.
        </p>
      ) : adapters.length === 0 ? (
        <p className="mt-4 rounded-xl border border-solid border-amber-300 bg-secondary-light px-4 py-3 text-sm font-semibold text-amber-900">
          No payment provider is enabled for {row.currencyCode}, so this payment cannot be started. Nothing was
          charged, and the obligation is unchanged.
        </p>
      ) : (
        <form action={startCheckoutAction} className="mt-5 border-t border-solid border-slate-200 pt-5">
          <input type="hidden" name="payment_id" value={row.paymentId} />

          <fieldset>
            <legend className={LABEL}>How you want to pay</legend>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              These are the channels {primary?.displayName} offers for {row.currencyCode}. The secure entry of the
              details — card number, bank login or the USSD code — happens on the provider&apos;s own page, never
              on this one. This platform never sees your card.
            </p>

            {channels.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                This provider has no channel list configured, so its own page will offer every method it supports.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {channels.map((channel, index) => {
                  const copy = CHANNEL_LABELS[channel] ?? {
                    label: channel.replace(/_/g, ' '),
                    detail: 'Offered by the gateway.',
                  };
                  return (
                    <label
                      key={channel}
                      className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-solid border-slate-200 px-3.5 py-3 transition-colors hover:border-primary"
                    >
                      <input
                        type="radio"
                        name="channel"
                        value={channel}
                        defaultChecked={index === 0}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                          <ChannelIcon channel={channel} />
                          {copy.label}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{copy.detail}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className="mt-5 space-y-3">
            <PayButton label={`Pay ${formatMoney(row.amountMinor, row.currencyCode)} Safely`} />
            <p className="text-xs leading-relaxed text-slate-500">
              The button is disabled while the request is in flight, and the request itself is idempotent: two
              presses, or a retry after a dropped connection, resolve to a single payment attempt. Nothing is
              charged twice.
            </p>
            <Link
              href={`/customer/payments/${row.paymentId}`}
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 no-underline uppercase transition-colors hover:border-primary hover:text-primary"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * The step-up gate.
 *
 * ⚠️ IT STANDS IN FRONT OF THE FORM, NOT BEHIND IT. The checkout path refuses a session that has not
 * authenticated in the last 15 minutes — the same window the agreement acceptance uses — so the page asks for
 * the code before the payer commits to anything, rather than letting them press Pay and then explaining that
 * the press did not count.
 */
export function CheckoutStepUp({
  paymentId,
  email,
  verify,
  verified,
}: {
  paymentId: string;
  email: string | null;
  verify: boolean;
  verified: boolean;
}) {
  if (verified) {
    return (
      <section className={`${CARD} p-5`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <BadgeCheck aria-hidden="true" className="h-4 w-4" />
          Verified. You can start the payment now.
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          The verification is good for a short while. If it lapses before you press Pay, the payment will be
          refused and you will be asked for a new code — and nothing will have been charged.
        </p>
      </section>
    );
  }

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Before you pay
      </h2>

      {verify ? (
        <form action={verifyCheckoutCodeAction} className="mt-3 space-y-4">
          <input type="hidden" name="payment_id" value={paymentId} />
          <div>
            <label className={LABEL} htmlFor="checkout-token">
              The six-digit code we emailed you
            </label>
            <input
              id="checkout-token"
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              className={`${FIELD} max-w-40 font-mono text-lg tracking-[0.4em]`}
              placeholder="000000"
            />
          </div>
          <SendCodeButton label="Verify and continue" />
          <p className="text-xs leading-relaxed text-slate-500">
            Entering the code is what makes this session fresh. The platform checks, in the database, that the
            session starting the payment authenticated seconds ago.
          </p>
        </form>
      ) : (
        <form action={sendCheckoutCodeAction} className="mt-3 space-y-4">
          <input type="hidden" name="payment_id" value={paymentId} />
          <p className="text-sm leading-relaxed text-slate-600">
            Paying is a sensitive step, so we ask you to confirm it is you. We will email a one-time code to{' '}
            <span className="font-semibold">{email ?? 'the address on your account'}</span> and you enter it here.
            No card details are asked for on this page at any point.
          </p>
          <SendCodeButton label="Email me a code" />
        </form>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The dispute / refund entry point
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type DisputeRequest = {
  id: string;
  kind: 'refund' | 'dispute';
  message: string;
  status: string;
  createdAt: string;
};

/**
 * Asking the platform team to look at a payment.
 *
 * ⚠️ THIS PAGE CANNOT MOVE MONEY, AND IT SAYS SO. A refund is executed by a capability-gated admin command
 * with a step-up; a payout hold is applied by the refund and dispute interlocks. None of that is reachable
 * from here, and weakening it so a button could work would be the wrong trade on a financial path. What this
 * records is that the customer asked, with a reason, for somebody to look.
 */
export function DisputeRequestPanel({ row, requests }: { row: PaymentLedgerRow; requests: DisputeRequest[] }) {
  const moneyTaken = ['funded', 'partially_refunded', 'refunded', 'disputed'].includes(row.obligationStatus);

  return (
    <section className={`${CARD} p-5`}>
      <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Something wrong with this payment?
      </h2>

      {requests.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {requests.map(request => (
            <li key={request.id} className="rounded-xl border border-solid border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800">
                  {request.kind === 'refund' ? 'Refund requested' : 'Asked for a review'}
                </span>
                <span className={request.status === 'open' ? AMBER : BADGE_SLATE}>
                  {request.status === 'open' ? 'awaiting the platform team' : request.status}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-600">{request.message}</p>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {new Date(request.createdAt).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {request.status === 'open' ? (
                <form action={withdrawPaymentDisputeRequestAction} className="mt-2">
                  <input type="hidden" name="payment_id" value={row.paymentId} />
                  <input type="hidden" name="dispute_request_id" value={request.id} />
                  <button type="submit" className="text-xs font-semibold text-slate-500 underline hover:text-primary">
                    Withdraw this request
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!moneyTaken ? (
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-600">
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            No money has been taken for this payment, so there is nothing to dispute here. If you no longer want
            the work, cancel the booking instead — that is the step that closes it.
          </span>
        </p>
      ) : (
        <details className="mt-3">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-amber-600" />
            Ask the platform team to look at this
          </summary>

          <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            <FileText aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              This records your request against the payment. It does not move money on its own: a refund is
              raised by the platform team through a command only they hold, and while one is open it holds the
              provider&apos;s payout for this job. Once money has been sent to a provider, a refund may not be
              possible at all — they will tell you which it is.
            </span>
          </p>

          <form action={raisePaymentDisputeRequestAction} className="mt-3 space-y-3">
            <input type="hidden" name="payment_id" value={row.paymentId} />

            <fieldset>
              <legend className={LABEL}>What are you asking for?</legend>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                  <input
                    type="radio"
                    name="kind"
                    value="refund"
                    defaultChecked
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="font-semibold">A refund</span> — you want some or all of this money back.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                  <input type="radio" name="kind" value="dispute" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
                  <span>
                    <span className="font-semibold">A review</span> — something is wrong and you want it looked at
                    before any money is released.
                  </span>
                </label>
              </div>
            </fieldset>

            <div>
              <label className={LABEL} htmlFor={`dispute-${row.paymentId}`}>
                What went wrong?
              </label>
              <textarea
                id={`dispute-${row.paymentId}`}
                name="message"
                rows={4}
                required
                minLength={10}
                maxLength={2000}
                className={FIELD}
                placeholder="e.g. The provider has not turned up twice and will not answer about a new time."
              />
            </div>

            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-slate-700 uppercase transition-colors hover:border-primary hover:text-primary"
            >
              <Clock aria-hidden="true" className="h-3.5 w-3.5" />
              Send this to the platform team
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
