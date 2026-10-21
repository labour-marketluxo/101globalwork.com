import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The money console's reads.
 *
 * ⚠️ IT SHIPS THE RPC'S JSON THROUGH WITH LIGHT NORMALISATION, UNLIKE THE OTHER ADMIN READS. These payloads are
 * large and shaped for exactly one page each; re-declaring every nested field as a TypeScript type would be a
 * second definition of the same thing, and one that drifts silently. The fields a page depends on are the ones
 * its own JSX reads, and the RPC is the authority for their names.
 *
 * ⚠️ NOTHING HERE WRITES, AND NOTHING HERE IS A LEDGER BALANCE COMPUTED IN JAVASCRIPT. Every figure comes from
 * the database, including the per-transaction balance check.
 */

type Raw = Record<string, unknown>;

const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const rows = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};
const bool = (value: unknown): boolean => value === true;

export type MoneyRead<T> = { allowed: boolean; unavailable: boolean; data: T };

export async function getPaymentOperations(filters: {
  status?: string;
  anomaly?: string;
  search?: string;
}): Promise<MoneyRead<{ payments: Raw[]; counts: Raw }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_payment_operations_command', {
    p_status: filters.status || null,
    p_anomaly: filters.anomaly || null,
    p_search: filters.search ?? null,
    p_limit: 100,
  });
  if (error) return { allowed: false, unavailable: true, data: { payments: [], counts: {} } };
  const raw = obj(data);
  if (raw.allowed !== true) return { allowed: false, unavailable: false, data: { payments: [], counts: {} } };
  return { allowed: true, unavailable: false, data: { payments: rows(raw.payments), counts: obj(raw.counts) } };
}

export async function getPaymentLedger(attemptId: string): Promise<MoneyRead<Raw | null> & { found: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_payment_ledger_command', { p_attempt_id: attemptId });
  if (error) return { allowed: false, unavailable: true, found: false, data: null };
  const raw = obj(data);
  if (raw.allowed !== true) return { allowed: false, unavailable: false, found: false, data: null };
  if (raw.found !== true) return { allowed: true, unavailable: false, found: false, data: null };
  return { allowed: true, unavailable: false, found: true, data: raw };
}

export async function getPayoutOperations(filters: {
  status?: string;
  search?: string;
}): Promise<MoneyRead<{ payouts: Raw[]; counts: Raw }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_payout_operations_command', {
    p_status: filters.status || null,
    p_search: filters.search ?? null,
    p_limit: 100,
  });
  if (error) return { allowed: false, unavailable: true, data: { payouts: [], counts: {} } };
  const raw = obj(data);
  if (raw.allowed !== true) return { allowed: false, unavailable: false, data: { payouts: [], counts: {} } };
  return { allowed: true, unavailable: false, data: { payouts: rows(raw.payouts), counts: obj(raw.counts) } };
}

export async function getMoneyCases(filters: {
  kind?: string;
  status?: string;
  search?: string;
}): Promise<MoneyRead<{ cases: Raw[]; counts: Raw }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_money_cases_command', {
    p_kind: filters.kind || null,
    p_status: filters.status || null,
    p_search: filters.search ?? null,
    p_limit: 100,
  });
  if (error) return { allowed: false, unavailable: true, data: { cases: [], counts: {} } };
  const raw = obj(data);
  if (raw.allowed !== true) return { allowed: false, unavailable: false, data: { cases: [], counts: {} } };
  return { allowed: true, unavailable: false, data: { cases: rows(raw.cases), counts: obj(raw.counts) } };
}

/** Small shared helpers so the pages do not each re-implement the same defensive reads. */
export const readText = text;
export const readNumber = num;
export const readBoolean = bool;
export const readRows = rows;
export const readObject = obj;
