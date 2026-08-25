create policy ledger_accounts_deny_external on public.ledger_accounts for all to anon,authenticated using (false) with check (false);
create policy ledger_entries_deny_external on public.ledger_entries for all to anon,authenticated using (false) with check (false);
create policy ledger_transactions_deny_external on public.ledger_transactions for all to anon,authenticated using (false) with check (false);
create policy payment_provider_events_deny_external on public.payment_provider_events for all to anon,authenticated using (false) with check (false);
create policy payment_reconciliations_deny_external on public.payment_reconciliations for all to anon,authenticated using (false) with check (false);
