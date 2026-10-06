import Link from 'next/link';
import { ArrowRight, Banknote, Download, Landmark, Scale, TriangleAlert } from '@/components/ui/icons';
import { BADGE_AMBER, CARD, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PendingButton } from '@/components/provider/ProviderControls';
import { formatMoney } from '@/features/provider-workspace/format';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import { PLATFORM_FEE_STATUS, requestReference, type CurrencyBooks, type EarningItem, type EarningsRead } from '@/features/provider-workspace/earnings';
import { requestPayoutsAction } from '@/features/provider-workspace/payout-actions';

/**
 * The earnings page.
 *
 * ⚠️ "TOTAL EARNED" IS WHAT CUSTOMERS HAVE PAID, NOT WHAT HAS ARRIVED. The card that answers "how much have I
 * made" is the gross figure from the ledger; the card that answers "what can I do now" is the balance, split into
 * held, ready and on its way. Presenting one number as both is how a provider ends up expecting money that is
 * still in escrow.
 *
 * ⚠️ EVERY FIGURE CARRIES ITS CURRENCY, AND NOTHING IS TOTALLED ACROSS CURRENCIES. Adding naira to dollars gives
 * a number with no meaning, so the cards are per currency and so is the payout request.
 *
 * ⚠️ THE RECONCILIATION LINE IS SHOWN WHETHER OR NOT IT IS FLATTERING. `reconciliation_delta_minor` is the
 * ledger minus the operational rows; when it is not zero the page says so instead of displaying a confident
 * total. That is the whole point of claiming the ledger is the truth.
 */

export function EarningsHeader({ earnings }: { earnings: EarningsRead }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">Earnings</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Your books
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Every figure here is read from the platform&apos;s double-entry ledger and cross-checked against the jobs
          and payouts it describes. The ledger is the financial record; this page is a view of it, not a summary
          kept beside it.
        </p>
      </div>
      <span
        className={
          earnings.provider.payoutVerified
            ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1 font-sans text-[11px] font-bold tracking-wider text-primary uppercase'
            : BADGE_AMBER
        }
      >
        {earnings.provider.payoutVerified ? 'Payout account verified' : 'No verified payout account'}
      </span>
    </div>
  );
}

function Figure({ label, value, note, tone = 'slate' }: { label: string; value: string; note?: string; tone?: 'teal' | 'amber' | 'slate' }) {
  const colour = tone === 'teal' ? 'text-primary' : tone === 'amber' ? 'text-amber-800' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-solid border-slate-200 p-3.5">
      <p className="font-sans text-[11px] font-bold tracking-wider text-slate-500 uppercase">{label}</p>
      <p className={`mt-1 text-lg font-extrabold tracking-tight ${colour}`}>{value}</p>
      {note ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p> : null}
    </div>
  );
}

export function EarningsCards({ books }: { books: CurrencyBooks }) {
  const owed = books.ledgerBalanceMinor;
  const reconciled = books.reconciliationDeltaMinor === 0;

  return (
    <section className={`${CARD} p-5`} aria-labelledby={`earnings-${books.currencyCode}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`earnings-${books.currencyCode}`} className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          <Landmark aria-hidden="true" className="h-4 w-4 text-primary" />
          {books.currencyCode}
        </h2>
        <p className="font-sans text-[11px] tracking-wide text-slate-500 uppercase">
          Ledger balance {formatMoney(owed, books.currencyCode)}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Figure
          label="Total earned"
          value={formatMoney(books.grossFundedMinor, books.currencyCode)}
          note="Everything customers have paid for your work, ever — gross, before any deduction."
        />
        <Figure
          label="Owed to you now"
          value={formatMoney(owed, books.currencyCode)}
          tone="teal"
          note="The liability the ledger carries for your account. It is money the platform holds and has not sent."
        />
        <Figure
          label="Held until the job is finished"
          value={formatMoney(books.inEscrowMinor, books.currencyCode)}
          note="Funded work that is not complete yet. Nothing to request here: it is not yours to be paid for until the customer signs it off."
        />
        <Figure
          label="Ready to request"
          value={formatMoney(books.eligibleMinor, books.currencyCode)}
          tone={books.eligibleMinor > 0 ? 'teal' : 'slate'}
          note={books.eligibleMinor > 0 ? 'Completed and funded. Ask for it below.' : 'No payout is waiting to be requested.'}
        />
        <Figure
          label="On its way"
          value={formatMoney(books.inFlightMinor, books.currencyCode)}
          note="Requested and being sent to your payout account."
        />
        <Figure
          label="Paid out"
          value={formatMoney(books.paidOutMinor, books.currencyCode)}
          note="Confirmed by the payment provider and debited from the ledger."
        />
        <Figure
          label="Refunds and reversals"
          value={formatMoney(books.reducedMinor, books.currencyCode)}
          tone={books.reducedMinor > 0 ? 'amber' : 'slate'}
          note="Money returned to customers or reversed by the provider. Refunds reduce what the platform owes you, because the customer got it back."
        />
        <Figure
          label="Platform fees and taxes"
          value={formatMoney(books.platformFeeMinor, books.currencyCode)}
          note={PLATFORM_FEE_STATUS}
        />
        <Figure
          label="Held back"
          value={formatMoney(books.blockedMinor, books.currencyCode)}
          tone={books.blockedMinor > 0 ? 'amber' : 'slate'}
          note="Payouts the platform did not send — usually a reversed transfer or a refund that must be reconciled first."
        />
      </div>

      {!reconciled ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-solid border-secondary bg-secondary-light p-3.5 text-xs leading-relaxed text-amber-900">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
          <span>
            <strong className="font-semibold">The books do not balance.</strong> The ledger says{' '}
            {formatMoney(owed, books.currencyCode)} is owed, while the jobs and payouts add up to{' '}
            {formatMoney(owed - books.reconciliationDeltaMinor, books.currencyCode)} — a difference of{' '}
            {formatMoney(Math.abs(books.reconciliationDeltaMinor), books.currencyCode)}. The ledger is the financial
            record, so treat its figure as the true one and tell support before relying on either.
          </span>
        </p>
      ) : (
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Scale aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            Reconciled: the ledger balance equals the jobs and payouts behind it
            ({formatMoney(books.inEscrowMinor + books.eligibleMinor + books.inFlightMinor + books.blockedMinor, books.currencyCode)}).
          </span>
        </p>
      )}
    </section>
  );
}

export function EarningsActions() {
  return (
    <section className={`${CARD} flex flex-wrap items-center gap-4 p-5`}>
      <Link href={PROVIDER_PATHS.payouts} className={LINK_ARROW}>
        <Banknote aria-hidden="true" className="h-3.5 w-3.5" />
        Manage payout methods
      </Link>
      <a href={PROVIDER_PATHS.earningsSummary} className={LINK_ARROW} download>
        <Download aria-hidden="true" className="h-3.5 w-3.5" />
        Download tax and earnings summary
      </a>
      <p className="text-xs leading-relaxed text-slate-500">
        The summary is a CSV of the same rows below, so the figures you hand an accountant are the figures on this
        page.
      </p>
    </section>
  );
}

/**
 * Ask to be paid.
 *
 * ⚠️ ONE FORM PER CURRENCY, BECAUSE A DESTINATION IS ONE CURRENCY. The button posts every eligible payout id in
 * that currency; the database decides each one separately, and a refusal on one does not stop the others.
 */
export function PayoutRequestPanels({ earnings }: { earnings: EarningsRead }) {
  const groups = new Map<string, EarningItem[]>();
  for (const item of earnings.items) {
    if (item.payoutStatus !== 'eligible' || !item.payoutId) continue;
    const list = groups.get(item.currencyCode) ?? [];
    list.push(item);
    groups.set(item.currencyCode, list);
  }

  if (groups.size === 0) {
    return (
      <EmptyState title="Nothing ready to pay out">
        A payout becomes eligible when a job is complete and the customer&apos;s payment has been reconciled. Until
        then the money is held, and this page shows it under held-until-finished.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4">
      {[...groups.entries()].map(([currencyCode, list]) => {
        const total = list.reduce((sum, item) => sum + (item.payoutAmountMinor ?? item.netPayableMinor), 0);
        return (
          <section key={currencyCode} className={`${CARD} p-5`} aria-labelledby={`request-${currencyCode}`}>
            <h2 id={`request-${currencyCode}`} className="text-sm font-bold tracking-tight text-slate-900">
              Request {formatMoney(total, currencyCode)}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              {list.length} completed job{list.length === 1 ? '' : 's'} ready. Requesting puts the payout in the
              platform&apos;s queue; the transfer itself is submitted from the platform&apos;s side, because a
              browser session never moves money. Every check the platform applies — a verified default destination,
              an unreversed transfer, a reconciled refund — is applied again when you ask.
            </p>

            <ul className="mt-3 grid gap-1.5 text-xs text-slate-600">
              {list.map(item => (
                <li key={item.obligationId} className="flex items-center justify-between gap-3">
                  <span>
                    {requestReference(item.requestId)} · {item.needText}
                  </span>
                  <span className="font-sans">{formatMoney(item.payoutAmountMinor ?? item.netPayableMinor, currencyCode)}</span>
                </li>
              ))}
            </ul>

            <form action={requestPayoutsAction} className="mt-4 border-t border-solid border-slate-200 pt-4">
              <input type="hidden" name="next" value={PROVIDER_PATHS.earnings} />
              {list.map(item => (
                <input key={item.payoutId ?? item.obligationId} type="hidden" name="payout_ids" value={item.payoutId ?? ''} />
              ))}
              <PendingButton
                idle={`Request ${list.length === 1 ? 'this payout' : 'these payouts'}`}
                pending="Requesting…"
                icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
                className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
              />
            </form>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The itemised list.
 *
 * ⚠️ THE FEE COLUMN SAYS "NONE CHARGED" RATHER THAN A ZERO, WHEN NOTHING WAS CHARGED. A `0.00` under a heading
 * that says "platform fee" reads as "we took nothing this time", which invites the question of when we will. The
 * copy states the actual position: no fee schedule is in force.
 */
export function EarningsTable({ items }: { items: EarningItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState title="No financial records yet">
        An obligation appears here when a customer funds an accepted quote, and a payout when the finished work is
        signed off.
      </EmptyState>
    );
  }

  return (
    <div className={`${CARD} overflow-x-auto p-5`}>
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Every obligation for this provider, with what the customer paid, what was deducted and what is owed.
        </caption>
        <thead>
          <tr className="font-sans text-[11px] tracking-wider text-slate-500 uppercase">
            <th scope="col" className="pb-2">Job</th>
            <th scope="col" className="pb-2">Completed</th>
            <th scope="col" className="pb-2 text-right">Gross paid</th>
            <th scope="col" className="pb-2 text-right">Fee</th>
            <th scope="col" className="pb-2 text-right">Refunded</th>
            <th scope="col" className="pb-2 text-right">Net owed</th>
            <th scope="col" className="pb-2">Payout</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.obligationId} className="border-t border-solid border-slate-100 align-top">
              <th scope="row" className="py-2.5 pr-3 font-normal">
                <span className="block font-semibold text-slate-800">{requestReference(item.requestId)}</span>
                <span className="mt-0.5 block max-w-xs truncate text-xs text-slate-500">{item.needText}</span>
              </th>
              <td className="py-2.5 pr-3 text-xs text-slate-600">
                {item.completedAt
                  ? new Date(item.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Not complete yet'}
              </td>
              <td className="py-2.5 pr-3 text-right font-sans text-slate-800">
                {formatMoney(item.grossMinor, item.currencyCode)}
              </td>
              <td className="py-2.5 pr-3 text-right text-xs text-slate-500">
                {PLATFORM_FEE_STATUS.startsWith('No fee schedule') ? 'None charged' : formatMoney(0, item.currencyCode)}
              </td>
              <td className="py-2.5 pr-3 text-right font-sans text-xs text-slate-600">
                {item.refundedMinor > 0 ? `−${formatMoney(item.refundedMinor, item.currencyCode)}` : '—'}
              </td>
              <td className="py-2.5 pr-3 text-right font-sans font-semibold text-slate-900">
                {formatMoney(item.netPayableMinor, item.currencyCode)}
              </td>
              <td className="py-2.5 text-xs">
                {item.payoutStatus ? (
                  <span className={item.payoutStatus === 'paid' ? 'font-semibold text-primary' : 'text-slate-700'}>
                    {item.payoutStatus.replaceAll('_', ' ')}
                    {item.payoutPaidAt
                      ? ` · ${new Date(item.payoutPaidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                      : ''}
                  </span>
                ) : (
                  <span className="text-slate-500">No payout yet</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FeeDisclosure() {
  return (
    <section className={`${CARD} p-5`} aria-labelledby="fees-heading">
      <h2 id="fees-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Fees and taxes
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{PLATFORM_FEE_STATUS}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        Tax is yours to account for: the platform does not withhold it, and no tax line exists on this page until one
        is posted against your account. The CSV above is the record to hand to whoever files for you.
      </p>
      <p className="mt-3">
        <Link href="/pricing" className={LINK_ARROW}>
          What the platform charges
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </p>
    </section>
  );
}
