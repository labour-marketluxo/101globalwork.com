import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ArrowLeft } from '@/components/ui/icons';
import { LINK_ARROW } from '@/components/discovery/tokens';
import { AddDestinationForm, DestinationPanel, TransferHistory } from '@/components/provider/PayoutSections';
import { WorkspaceNotice, WorkspaceSkeleton, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { getPayouts } from '@/features/provider-workspace/payouts';
import { listPaystackBanks, paystackExecutionMode } from '@/lib/payments/paystack-operations';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PROVIDER_FAILURE_COPY, PROVIDER_PATHS, providerFailureCode } from '@/features/provider-workspace/paths';

/**
 * /provider/earnings/payouts — where the money goes.
 *
 * ⚠️ THIS SUPERSEDES /provider/payouts, WHICH NOW REDIRECTS HERE. The old page collected a bank account and stored
 * it through the service client with no step-up, no mobile money and no transfer history — and it linked to itself
 * from the workspace as "Payout account" while the brief's own navigation calls this Earnings › Payouts. The route
 * moved; the account number still never touches the database.
 *
 * ⚠️ THE BANK LIST IS FETCHED FOR THE MARKET, AND ITS ABSENCE IS EXPLAINED RATHER THAN HIDDEN. `listPaystackBanks`
 * throws when the platform has no usable secret, and the form falls back to a code field with the reason stated —
 * a provider can still enter what their bank uses, and nobody is left looking at an empty dropdown.
 */
export const metadata: Metadata = {
  title: 'Payout methods',
  description: 'The account your earnings are sent to, and the transfers so far.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; payout?: string }>;

export default async function ProviderPayoutsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const failure = providerFailureCode(params.failed);

  return (
    <div className="grid gap-6">
      <nav aria-label="Payouts" className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={PROVIDER_PATHS.earnings} className={LINK_ARROW}>
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Back to earnings
        </Link>
      </nav>

      <header>
        <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">Earnings · Payouts</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Where your money goes
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          One account receives your payouts. It is verified with the payment provider before anything is sent to it,
          and changing it asks you to prove it is you first.
        </p>
      </header>

      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That payout change did not go through.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {params.payout === 'destination_saved' ? (
        <WorkspaceNotice tone="teal" role="status" title="Payout account saved and verified.">
          <p>
            It is the default destination now, and previous ones stopped being the default. The platform stored the
            provider&apos;s recipient reference, the confirmed account name and the last four digits — not the number.
          </p>
        </WorkspaceNotice>
      ) : null}
      {params.payout === 'reverified' ? (
        <WorkspaceNotice tone="teal" role="status" title="Verification checked.">
          <p>The payment provider still recognises this recipient, so it can receive transfers.</p>
        </WorkspaceNotice>
      ) : null}
      {params.payout === 'reverify_failed' ? (
        <WorkspaceNotice tone="amber" role="status" title="That destination is no longer valid.">
          <p>
            The payment provider reports it as inactive, so it is marked failed and will not be chosen for a payout.
            Add the account again to replace it.
          </p>
        </WorkspaceNotice>
      ) : null}

      <Suspense fallback={<WorkspaceSkeleton />}>
        <PayoutsBody providerId={provider.id} providerName={provider.displayName} />
      </Suspense>
    </div>
  );
}

async function PayoutsBody({ providerId, providerName }: { providerId: string; providerName: string }) {
  const supabase = await createSupabaseServerClient();

  const [payouts, assurance, providers] = await Promise.all([
    getPayouts(providerId),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.from('providers').select('id,display_name').order('created_at'),
  ]);

  if (payouts.unavailable) return <WorkspaceUnavailable what="Your payout details" />;

  let banks: { code: string; name: string }[] = [];
  let mode = 'unavailable';
  try {
    mode = paystackExecutionMode();
    banks = (await listPaystackBanks('nigeria'))
      .filter(bank => bank.active !== false)
      .map(bank => ({ code: String(bank.code), name: bank.name }));
  } catch {
    banks = [];
  }

  // A verified factor is what makes a step-up possible; the assurance level is what says whether this session has
  // already passed it. The page states which situation the provider is in either way.
  const hasFactor = assurance.data?.nextLevel === 'aal2';
  const currencyCode = payouts.destinations[0]?.currencyCode ?? 'NGN';

  return (
    <>
      <DestinationPanel destinations={payouts.destinations} mode={mode} hasFactor={Boolean(hasFactor)} />
      <AddDestinationForm
        providerId={providerId}
        providers={(providers.data ?? [{ id: providerId, display_name: providerName }]).map(row => ({
          id: row.id,
          name: row.display_name,
        }))}
        banks={banks}
        currencyCode={currencyCode}
        hasFactor={Boolean(hasFactor)}
      />
      <TransferHistory transfers={payouts.transfers} />
    </>
  );
}
