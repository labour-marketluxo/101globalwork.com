import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The supply directory.
 *
 * ⚠️ EVERY QUEUE IS A PREDICATE OVER REAL ROWS, NOT A LABEL SOMEBODY MAINTAINS. "Awaiting verification"
 * counts pending verification rows, "restricted" looks for a live row in `admin_provider_restrictions`,
 * "credentials expiring" reads the expiry dates, "not published" reads the public profile. That is why
 * an operator can trust the count on the filter to equal the rows underneath it.
 *
 * ⚠️ READINESS IS THE PROVIDER'S OWN NUMBER. It is the same score the provider sees on their search
 * readiness page, read from the same row, so the two surfaces cannot disagree.
 */

export type ProviderCatalogueItem = { name: string; isPrimary: boolean };

export type ProviderRestriction = {
  id: string;
  kind: string;
  reasonCode: string;
  appliedAt: string | null;
  reviewBy: string | null;
  note: string | null;
};

export type ProviderDirectoryItem = {
  providerId: string;
  displayName: string;
  providerStatus: string;
  publicSlug: string | null;
  isPublic: boolean;
  marketName: string | null;
  createdAt: string | null;
  setupPercent: number | null;
  readinessScore: number | null;
  readinessState: string | null;
  credentialCount: number;
  credentialExpiring: number;
  credentialExpired: number;
  credentialPending: number;
  pendingVerifications: number;
  lastVerificationAt: string | null;
  restriction: ProviderRestriction | null;
  categories: ProviderCatalogueItem[];
};

export type ProviderDirectory = {
  allowed: boolean;
  providers: ProviderDirectoryItem[];
  unavailable: boolean;
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
const num = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};
const bool = (value: unknown): boolean => value === true;
const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const rows = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

export async function getProviderDirectory(filters: {
  search?: string;
  queue?: string;
  marketId?: string;
}): Promise<ProviderDirectory> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_provider_directory_command', {
    p_search: filters.search ?? null,
    p_queue: filters.queue || null,
    p_market_id: filters.marketId || null,
    p_limit: 100,
  });
  if (error) return { allowed: false, providers: [], unavailable: true };

  const raw = obj(data);
  if (raw.allowed !== true) return { allowed: false, providers: [], unavailable: false };

  return {
    allowed: true,
    unavailable: false,
    providers: rows(raw.providers).map(entry => {
      // The restriction columns are flat on the row (the lateral join in SQL flattens them), so there
      // is no nested object to unwrap here beyond reading them off the entry itself.
      const restrictionId = text(entry.restriction_id);
      return {
        providerId: text(entry.provider_id) ?? '',
        displayName: text(entry.display_name) ?? 'Provider',
        providerStatus: text(entry.provider_status) ?? 'draft',
        publicSlug: text(entry.public_slug),
        isPublic: bool(entry.is_public),
        marketName: text(entry.market_name),
        createdAt: text(entry.created_at),
        setupPercent: num(entry.setup_percent),
        readinessScore: num(entry.readiness_score),
        readinessState: text(entry.readiness_state),
        credentialCount: num(entry.credential_count) ?? 0,
        credentialExpiring: num(entry.credential_expiring) ?? 0,
        credentialExpired: num(entry.credential_expired) ?? 0,
        credentialPending: num(entry.credential_pending) ?? 0,
        pendingVerifications: num(entry.pending_verifications) ?? 0,
        lastVerificationAt: text(entry.last_verification_at),
        restriction: restrictionId
          ? {
              id: restrictionId,
              kind: text(entry.restriction_kind) ?? 'suspended',
              reasonCode: text(entry.restriction_reason_code) ?? 'unknown',
              appliedAt: text(entry.restriction_applied_at),
              reviewBy: text(entry.restriction_expires_at),
              note: text(entry.restriction_note),
            }
          : null,
        categories: rows(entry.categories).map(category => ({
          name: text(category.name) ?? 'Uncategorised',
          isPrimary: bool(category.is_primary),
        })),
      };
    }).filter(entry => entry.providerId !== ''),
  };
}
