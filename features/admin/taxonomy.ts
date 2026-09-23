import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The taxonomy and market console's reads.
 *
 * ⚠️ RAW PAYLOADS, LIKE THE MONEY CONSOLE, BECAUSE EACH SHAPE HAS ONE PAGE. The RPC is the authority for the field
 * names; re-declaring them as types here would be a second definition that drifts.
 *
 * ⚠️ NOTHING IN THIS FILE WRITES, AND NOTHING LOOKS A SERVICE UP BY NAME. The id is the identity; a page that
 * searched by display name would be one rename away from editing the wrong thing.
 */

type Raw = Record<string, unknown>;
export type TaxonomyRead = { allowed: boolean; unavailable: boolean; data: Raw };

const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});

async function call(fn: string, args: Record<string, unknown>): Promise<TaxonomyRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { allowed: false, unavailable: true, data: {} };
  const raw = obj(data);
  if (raw.allowed !== true) return { allowed: false, unavailable: false, data: {} };
  return { allowed: true, unavailable: false, data: raw };
}

export const getServiceTaxonomy = (filters: { search?: string; status?: string }) =>
  call('admin_service_taxonomy_command', {
    p_search: filters.search ?? null,
    p_status: filters.status || null,
    p_limit: 200,
  });

export const getDiscoveryGraph = (serviceId?: string) =>
  call('admin_discovery_graph_command', { p_service_id: serviceId || null });

export const getMarkets = () => call('admin_markets_command', {});

export const resolveMarketSetting = (key: string, marketId?: string, regionId?: string, organisationId?: string) =>
  call('market_setting_resolution_command', {
    p_setting_key: key,
    p_market_id: marketId || null,
    p_region_id: regionId || null,
    p_organisation_id: organisationId || null,
  });

export const testIntentMapping = (phrase: string, marketId?: string) =>
  call('test_intent_mapping_command', { p_phrase: phrase, p_market_id: marketId || null });

export const readText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
export const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};
export const readBoolean = (value: unknown): boolean => value === true;
export const readRows = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];
export const readObject = obj;
