import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listPaystackBanks, paystackExecutionMode } from '@/lib/payments/paystack-operations';
import { savePayoutDestinationAction } from './actions';

export const metadata = { title: 'Payout account', robots: { index: false, follow: false } };

export default async function ProviderPayoutsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/provider/payouts');

  const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!account) redirect('/provider/onboarding');
  const { data: providers } = await supabase.from('providers').select('id,display_name,status').eq('owner_account_id', account.id).order('created_at');
  if (!providers?.length) redirect('/provider/onboarding');
  const providerIds = providers.map(p => p.id);
  const { data: destinations } = await supabase.from('provider_payout_destinations').select('id,provider_id,currency_code,bank_code,account_last4,account_name,verification_status,is_default,created_at').in('provider_id', providerIds).order('created_at', { ascending: false });

  let banks: Array<{ id: number; name: string; code: string; currency: string; active: boolean }> = [];
  let mode = 'unavailable';
  try {
    mode = paystackExecutionMode();
    banks = (await listPaystackBanks('nigeria')).filter(bank => bank.active !== false);
  } catch {
    banks = [];
  }

  return <section className="content-shell">
    <div className="section-heading-row">
      <div><p className="eyebrow">Provider payouts</p><h1>Where your earnings go.</h1><p className="lede left">Bank details are verified with Paystack. 101GlobalWork stores only the Paystack recipient reference and masked account information.</p></div>
      <Link className="button-link secondary" href="/provider">Provider workspace</Link>
    </div>

    {query.error ? <p className="notice" role="alert">{query.error}</p> : null}
    {query.success ? <p className="notice">{query.success}</p> : null}
    <p className="hint">Payment adapter mode: <strong>{mode}</strong>. Live execution remains blocked unless explicitly enabled by platform configuration.</p>

    <section className="action-panel">
      <h2>Verify payout account</h2>
      {banks.length ? <form action={savePayoutDestinationAction} className="stack-form">
        <label htmlFor="provider_id">Provider</label>
        <select id="provider_id" name="provider_id" required>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.display_name}</option>)}</select>
        <input type="hidden" name="currency_code" value="NGN" />
        <label htmlFor="bank_code">Bank</label>
        <select id="bank_code" name="bank_code" required defaultValue=""><option value="" disabled>Select bank</option>{banks.map(bank => <option key={`${bank.code}:${bank.id}`} value={bank.code}>{bank.name}</option>)}</select>
        <label htmlFor="account_number">Account number</label>
        <input id="account_number" name="account_number" inputMode="numeric" autoComplete="off" pattern="[0-9 ]{8,20}" required placeholder="Enter account number" />
        <button type="submit">Verify and save payout account</button>
      </form> : <p className="notice">Paystack bank verification is unavailable. Check that a Paystack test secret key is configured before testing payouts.</p>}
    </section>

    <section className="action-panel">
      <h2>Saved payout destinations</h2>
      {destinations?.length ? <div className="quote-list">{destinations.map(item => <article className="quote-card" key={item.id}>
        <div><strong>{item.account_name || 'Bank account'}</strong><br /><span>•••• {item.account_last4 || '----'} · {item.currency_code}</span></div>
        <p className="hint">{item.verification_status}{item.is_default ? ' · default' : ''}</p>
      </article>)}</div> : <p className="hint">No payout account saved yet.</p>}
    </section>
  </section>;
}
