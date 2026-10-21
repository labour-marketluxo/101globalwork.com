-- Prove the commerce ledger is independent of the escrow ledger.
--
-- Rollback-safe: everything happens inside `begin; … rollback;`, and the accounts this test creates are
-- discarded with it. The point of the suite is that the two ledgers cannot be crossed — not that they happen
-- not to have been, which is a statement about today's data rather than about the schema.
--
-- WHAT IT ASSERTS, and why each one is a different kind of proof:
--
--   1. THE COLUMNS ARE ABSENT. A commerce entry has no `obligation_id` and a service entry has no
--      `commerce_order_id`. This is the structural half of the invariant: there is no field through which a
--      goods row could name a payment obligation.
--
--   2. THERE IS NO FOREIGN KEY BETWEEN THEM. Scanned from `pg_constraint`, so a future migration that quietly
--      joined the two tables would fail this test rather than shipping.
--
--   3. THE PREFIXES ARE ENFORCED. A commerce account code must begin `commerce.`, a commerce transaction type
--      must begin `commerce_`, and its idempotency key must begin `commerce:`. Each is attempted here and each
--      must be refused.
--
--   4. THE SERVICE JOURNAL CANNOT ACCEPT A COMMERCE ACCOUNT, even by id. Posting through the escrow helper with
--      a commerce account id is a foreign-key violation, which is the crossing the invariant is really about.
--
--   5. THE COMMERCE HELPER BALANCES. An unbalanced set is refused; a balanced one is accepted, is idempotent by
--      key, and writes nothing anywhere except the commerce tables.

begin;

do $$
declare
  v_code_account uuid := gen_random_uuid();
  v_second_account uuid;
  v_tx uuid;
  v_tx_again uuid;
  v_entries integer;
  v_service_rows integer;
  v_cross_links integer;
  v_leaked_columns integer;
begin
  -- ── 1. The columns that would carry the link do not exist ──────────────────────────────────
  select count(*) into v_leaked_columns
    from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'commerce_ledger_entries' and column_name = 'obligation_id')
       or (table_name = 'ledger_entries' and column_name = 'commerce_order_id'));
  if v_leaked_columns <> 0 then
    raise exception 'a ledger entry table carries a column naming the other ledger (% columns)', v_leaked_columns;
  end if;

  -- ── 2. No foreign key connects the two ledgers ─────────────────────────────────────────────
  select count(*) into v_cross_links
    from pg_constraint c
    join pg_class src on src.oid = c.conrelid
    join pg_class tgt on tgt.oid = c.confrelid
   where c.contype = 'f'
     and (
       (src.relname like 'commerce_ledger_%' and tgt.relname in (
          'ledger_accounts','ledger_transactions','ledger_entries','payment_obligations',
          'payment_attempts','payment_reconciliations','payouts'))
       or (src.relname in ('ledger_accounts','ledger_transactions','ledger_entries') and tgt.relname like 'commerce_%')
       or (src.relname in ('payment_obligations','payouts') and tgt.relname like 'commerce_%')
     );
  if v_cross_links <> 0 then
    raise exception 'the escrow and commerce ledgers are joined by % foreign keys', v_cross_links;
  end if;

  -- ── 3. The prefixes are enforced ───────────────────────────────────────────────────────────
  begin
    insert into public.commerce_ledger_accounts(account_code, account_kind, owner_kind, currency_code)
    values ('platform.cash.held', 'asset', 'platform', 'NGN');
    raise exception 'a commerce account accepted a non-commerce account code';
  exception when check_violation then null;
  end;

  begin
    insert into public.commerce_ledger_transactions(transaction_type, idempotency_key)
    values ('payment_funded', 'commerce:prefix-test');
    raise exception 'a commerce transaction accepted a service transaction type';
  exception when check_violation then null;
  end;

  begin
    insert into public.commerce_ledger_transactions(transaction_type, idempotency_key)
    values ('commerce_prefix_test', 'provider-event:prefix-test');
    raise exception 'a commerce transaction accepted a service idempotency key';
  exception when check_violation then null;
  end;

  -- ── 4. A commerce account cannot be posted through the escrow journal ──────────────────────
  v_code_account := app_private.ensure_commerce_account('commerce.funds.held.NGN', 'asset', 'platform', null, 'NGN');
  v_second_account := app_private.ensure_commerce_account('commerce.supplier.payable.test.NGN', 'liability', 'platform', null, 'NGN');

  begin
    perform app_private.post_balanced_ledger_transaction(
      'cross_ledger_probe', 'probe:cross-ledger', null, '{}'::jsonb,
      jsonb_build_array(
        jsonb_build_object('ledger_account_id', v_code_account, 'currency_code', 'NGN', 'amount_minor', 1000),
        jsonb_build_object('ledger_account_id', v_code_account, 'currency_code', 'NGN', 'amount_minor', -1000)
      )
    );
    raise exception 'the escrow journal accepted a commerce account';
  exception when foreign_key_violation then null;
  end;

  -- ── 5. The commerce helper balances, is idempotent, and stays on its own tables ─────────────
  begin
    perform app_private.post_balanced_commerce_transaction(
      'commerce_balance_probe', 'commerce:unbalanced-probe', null, null, '{}'::jsonb,
      jsonb_build_array(
        jsonb_build_object('commerce_account_id', v_code_account, 'currency_code', 'NGN', 'amount_minor', 1000),
        jsonb_build_object('commerce_account_id', v_second_account, 'currency_code', 'NGN', 'amount_minor', -999)
      )
    );
    raise exception 'the commerce helper accepted an unbalanced transaction';
  exception when check_violation then null;
  end;

  v_tx := app_private.post_balanced_commerce_transaction(
    'commerce_balance_probe', 'commerce:balanced-probe', null, 'TEST-REF', '{}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('commerce_account_id', v_code_account, 'currency_code', 'NGN', 'amount_minor', 1000),
      jsonb_build_object('commerce_account_id', v_second_account, 'currency_code', 'NGN', 'amount_minor', -1000)
    )
  );
  v_tx_again := app_private.post_balanced_commerce_transaction(
    'commerce_balance_probe', 'commerce:balanced-probe', null, 'TEST-REF', '{}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('commerce_account_id', v_code_account, 'currency_code', 'NGN', 'amount_minor', 1000),
      jsonb_build_object('commerce_account_id', v_second_account, 'currency_code', 'NGN', 'amount_minor', -1000)
    )
  );

  if v_tx is null or v_tx <> v_tx_again then
    raise exception 'the commerce helper is not idempotent by idempotency key';
  end if;

  select count(*) into v_entries from public.commerce_ledger_entries where transaction_id = v_tx;
  if v_entries <> 2 then
    raise exception 'expected 2 commerce entries, found %', v_entries;
  end if;

  -- The escrow journal must be untouched by a commerce posting.
  select count(*) into v_service_rows
    from public.ledger_transactions
   where idempotency_key like 'commerce:%' or transaction_type like 'commerce\_%';
  if v_service_rows <> 0 then
    raise exception '% commerce rows landed in the escrow journal', v_service_rows;
  end if;

  if exists (select 1 from app_private.commerce_ledger_imbalances()) then
    raise exception 'the commerce ledger reports an imbalance after a balanced posting';
  end if;
end $$;

select 'commerce_ledger_separation' as suite, 'passed' as result;

rollback;
