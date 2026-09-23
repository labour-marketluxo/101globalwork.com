import Link from 'next/link';
import { ArrowRight, BadgeCheck, Landmark, RefreshCw, ShieldCheck, Smartphone, TriangleAlert } from 'lucide-react';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PendingButton } from '@/components/provider/ProviderControls';
import { formatMoney } from '@/features/provider-workspace/format';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import {
  DESTINATION_STATUS_COPY,
  destinationKindLabel,
  transferStatusCopy,
  type PayoutDestination,
  type PayoutTransfer,
} from '@/features/provider-workspace/payouts';
import { retryPayoutVerificationAction, savePayoutDestinationAction } from '@/features/provider-workspace/payout-actions';

/**
 * Where the money goes, and where it has been.
 *
 * ⚠️ THE MASK IS THE POINT. The platform stores a recipient code and the last four digits — never the full number
 * — so the panel can show which account is in use without holding anything worth stealing. `•••• 4417` is enough
 * for a provider to recognise their own account and useless to anybody else.
 *
 * ⚠️ CHANGING IT IS A STEP-UP ACTION, AND THE PAGE SAYS SO BEFORE THE FORM. If the account has a second factor the
 * save goes through `/auth/challenge` first; if it has none the page says that plainly rather than implying a check
 * that will not happen, because the platform has no password re-entry to offer instead.
 */

export function DestinationPanel({
  destinations,
  mode,
  hasFactor,
}: {
  destinations: PayoutDestination[];
  mode: string;
  hasFactor: boolean;
}) {
  const active = destinations.find(destination => destination.isDefault) ?? destinations[0] ?? null;

  return (
    <section className={`${CARD} p-5`} aria-labelledby="destination-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="destination-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
          {active?.destinationType === 'mobile_money' ? (
            <Smartphone aria-hidden="true" className="h-4 w-4 text-primary" />
          ) : (
            <Landmark aria-hidden="true" className="h-4 w-4 text-primary" />
          )}
          Payout destination
        </h2>
        {active ? (
          <span
            className={
              DESTINATION_STATUS_COPY[active.verificationStatus]?.tone === 'teal'
                ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase'
                : DESTINATION_STATUS_COPY[active.verificationStatus]?.tone === 'amber'
                  ? BADGE_AMBER
                  : BADGE_SLATE
            }
          >
            {DESTINATION_STATUS_COPY[active.verificationStatus]?.label ?? active.verificationStatus}
          </span>
        ) : null}
      </div>

      {active ? (
        <>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Account</dt>
              <dd className="mt-0.5 text-slate-700">
                •••• {active.accountLast4 ?? '----'}
                <span className="mt-0.5 block text-slate-500">{active.accountName ?? 'Name not confirmed'}</span>
              </dd>
            </div>
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Type</dt>
              <dd className="mt-0.5 text-slate-700">
                {destinationKindLabel(active.destinationType)}
                <span className="mt-0.5 block text-slate-500">
                  {active.adapterKey} · {active.currencyCode}
                </span>
              </dd>
            </div>
            <div>
              <dt className="font-mono font-bold tracking-wider text-slate-500 uppercase">Default</dt>
              <dd className="mt-0.5 text-slate-700">
                {active.isDefault ? 'Yes — this is where payouts go' : 'No'}
                {active.updatedAt ? (
                  <span className="mt-0.5 block text-slate-500">
                    Checked{' '}
                    {new Date(active.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-solid border-slate-200 pt-4">
            <form action={retryPayoutVerificationAction}>
              <input type="hidden" name="destination_id" value={active.id} />
              <input type="hidden" name="next" value={PROVIDER_PATHS.payouts} />
              <PendingButton
                idle="Retry verification"
                pending="Checking…"
                icon={<RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
                className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </form>
            <p className="text-xs leading-relaxed text-slate-500">
              Asks the payment provider whether this recipient can still receive transfers. The account number is not
              asked for again and is not stored here.
            </p>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <EmptyState title="No payout destination yet">
            Until one is verified, completed work can be marked eligible but nothing can actually be sent to you.
          </EmptyState>
        </div>
      )}

      {mode !== 'test' ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-solid border-secondary bg-secondary-light p-3.5 text-xs leading-relaxed text-amber-900">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
          <span>
            The payment provider is configured in <strong className="font-semibold">{mode}</strong> mode. Verifying a
            destination now will fail unless a test secret is configured on the platform — that is a configuration
            problem, not something wrong with your details.
          </span>
        </p>
      ) : null}

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>
          {hasFactor
            ? 'Changing this destination asks for your second factor first: it is the account your money leaves through, so the platform re-checks that it is you.'
            : 'Your account has no second factor, so the platform cannot ask for one before this change — it has no password re-entry step to offer. Set one up under Two-factor if you want that protection.'}
        </span>
      </p>
    </section>
  );
}

/** Add or replace the destination. Bank account and mobile money are one form with two shapes. */
export function AddDestinationForm({
  providerId,
  providers,
  banks,
  currencyCode,
  hasFactor,
}: {
  providerId: string;
  providers: { id: string; name: string }[];
  banks: { code: string; name: string }[];
  currencyCode: string;
  hasFactor: boolean;
}) {
  return (
    <form action={savePayoutDestinationAction} className={`${CARD} grid gap-4 p-5`}>
      <input type="hidden" name="next" value={PROVIDER_PATHS.payouts} />
      <div>
        <h2 className="text-sm font-bold tracking-tight text-slate-900">Add or change the payout account</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          The number goes to the payment provider to be resolved; the platform keeps the recipient reference they
          return, the name they confirm and the last four digits. It never stores the whole number.
        </p>
        {hasFactor ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary-surface px-3 py-1.5 text-xs font-semibold text-primary">
            <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
            Saving this will ask for your second factor.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="provider_id" className={LABEL}>
            Provider
          </label>
          <select id="provider_id" name="provider_id" required defaultValue={providerId} className={FIELD}>
            {providers.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="destination_type" className={LABEL}>
            Where the money should go
          </label>
          <select id="destination_type" name="destination_type" required defaultValue="bank_account" className={FIELD}>
            <option value="bank_account">Bank account</option>
            <option value="mobile_money">Mobile money</option>
          </select>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Choose the one that matches the code below. A wallet number submitted as a bank account is rejected by the
            provider in a way that reads like a wrong number.
          </p>
        </div>
        <div>
          <label htmlFor="bank_code" className={LABEL}>
            Bank or wallet code
          </label>
          {banks.length > 0 ? (
            <select id="bank_code" name="bank_code" required defaultValue="" className={FIELD}>
              <option value="" disabled>
                Choose a bank or wallet provider
              </option>
              {banks.map(bank => (
                <option key={`${bank.code}:${bank.name}`} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="bank_code"
              name="bank_code"
              required
              pattern="[0-9]{3,12}"
              inputMode="numeric"
              placeholder="Provider code"
              aria-describedby="bank_code-help"
              className={FIELD}
            />
          )}
          <p id="bank_code-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
            {banks.length > 0
              ? 'The list comes from the payment provider for this market.'
              : 'The provider list could not be read, so enter the code the payment provider uses.'}
          </p>
        </div>
        <div>
          <label htmlFor="account_number" className={LABEL}>
            Account or wallet number
          </label>
          <input
            id="account_number"
            name="account_number"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9 ]{8,20}"
            required
            className={FIELD}
          />
        </div>
      </div>

      <input type="hidden" name="currency_code" value={currencyCode} />

      <div className="border-t border-solid border-slate-200 pt-4">
        <PendingButton
          idle="Verify and save"
          pending="Verifying…"
          icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
          className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </form>
  );
}

/**
 * Transfer history, straight from the payout rows.
 *
 * ⚠️ THE LEDGER IS THE FINANCIAL RECORD; THIS IS THE OPERATIONAL ONE. These rows say what the platform decided to
 * send and what the provider confirmed. The amounts are the ledger's own figures for the same payouts, and the
 * earnings page is where the two are reconciled.
 */
export function TransferHistory({ transfers }: { transfers: PayoutTransfer[] }) {
  return (
    <section className={`${CARD} p-5`} aria-labelledby="history-heading">
      <h2 id="history-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Transfer history
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        One row per completed job. A payout only exists once the work is done and the customer&apos;s payment has been
        reconciled.
      </p>

      {transfers.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Nothing has been sent yet, and nothing is waiting. Payouts appear when a job is complete and funded.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {transfers.map(transfer => {
            const copy = transferStatusCopy(transfer.status);
            return (
              <li key={transfer.id} className="rounded-xl border border-solid border-slate-200 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {formatMoney(transfer.amountMinor, transfer.currencyCode)}
                  </span>
                  <span
                    className={
                      copy.tone === 'teal'
                        ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-primary uppercase'
                        : copy.tone === 'amber'
                          ? BADGE_AMBER
                          : BADGE_SLATE
                    }
                  >
                    {copy.label}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{copy.note}</p>
                <p className="mt-1 font-mono text-[11px] tracking-wide text-slate-400 uppercase">
                  {transfer.providerReference ?? 'No reference yet'}
                  {transfer.updatedAt
                    ? ` · ${new Date(transfer.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : ''}
                  {transfer.blockReason ? ` · ${transfer.blockReason.replaceAll('_', ' ')}` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3">
        <Link href={PROVIDER_PATHS.earnings} className={LINK_ARROW}>
          See what these transfers add up to
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </p>
    </section>
  );
}
