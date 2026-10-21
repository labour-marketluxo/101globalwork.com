import { createSupabaseServerClient } from '@/lib/supabase/server';
import { verificationStatus, type VerificationStatus } from '@/features/provider-workspace/verification';

/**
 * Credentials: licences, certifications and insurance.
 *
 * ⚠️ THIS IS NOT THE SAME LIST AS VERIFICATION, WHICH IS WHY THE WORKSPACE HAS TWO PAGES. The
 * verification centre holds the three per-business claims (identity, business, address) — one row per
 * kind. Credentials are a set: a provider may hold four licences across three jurisdictions, each
 * covering different services, and each expiring on its own date. Collapsing them into one table
 * would mean a provider with a lapsed insurance policy and a valid licence could only be described
 * as "partly verified", which is not a state anybody can act on.
 *
 * ⚠️ NOTHING HERE IS PUBLIC. The public profile shows a COUNT of verified credentials and no detail;
 * the issuing body, jurisdiction, reference and expiry are read by the owner and by a platform
 * reviewer. The page says so, because "I uploaded my licence number here" deserves an answer about
 * where it goes.
 */

export const CREDENTIAL_TYPES = [
  { value: 'licence', label: 'Trade licence' },
  { value: 'certification', label: 'Certification' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'trade_registration', label: 'Trade registration' },
  { value: 'other', label: 'Other' },
] as const;

export const CREDENTIAL_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  CREDENTIAL_TYPES.map(type => [type.value, type.label]),
);

export type CredentialRecord = {
  id: string;
  /** Carried on the record so a renewal form can post the provider it belongs to without the page
   *  threading a second value through every component. */
  providerId: string;
  credentialType: string;
  typeLabel: string;
  issuingBody: string;
  jurisdictionCode: string | null;
  referenceLabel: string | null;
  /** ISO date (no time): a credential expires on a day, not at an instant. */
  expiresAt: string | null;
  /** Raw ids, for the renewal form's hidden fields. */
  serviceIds: string[];
  /** Resolved to names: the page shows "Electrical installation", not a uuid. */
  serviceNames: string[];
  documentReference: string | null;
  status: VerificationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** Already past its expiry date, whatever the review status says. */
  isExpired: boolean;
  /** Within 60 days of expiry, counting only credentials that are still in force. */
  expiresSoon: boolean;
};

export type ProviderCredentials = {
  providerId: string;
  displayName: string;
  credentials: CredentialRecord[];
  serviceOptions: { id: string; name: string }[];
  verifiedCount: number;
  attentionCount: number;
};

export type ProviderCredentialsRead = {
  data: ProviderCredentials | null;
  unavailable: boolean;
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const DAY = 24 * 60 * 60 * 1000;

/** Dates arrive as `YYYY-MM-DD`; parsed at UTC midnight so a date is never shifted by the server's zone. */
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function daysUntil(date: Date | null, now: Date): number | null {
  if (!date) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((date.getTime() - today) / DAY);
}

export async function getProviderCredentials(providerId: string, now: Date): Promise<ProviderCredentialsRead> {
  const supabase = await createSupabaseServerClient();

  const [{ data: provider, error }, { data: credentialRows }, { data: catalog }] = await Promise.all([
    supabase.from('providers').select('id,display_name').eq('id', providerId).maybeSingle(),
    supabase
      .from('provider_credentials')
      .select('id,credential_type,issuing_body,jurisdiction_code,reference_label,expires_at,service_entity_ids,document_reference,status,submitted_at,reviewed_at,review_note')
      .eq('provider_id', providerId)
      .order('expires_at', { ascending: true, nullsFirst: false }),
    supabase.from('public_service_catalog').select('service_entity_id,display_name').order('display_name'),
  ]);

  if (error || !provider) {
    if (process.env.NODE_ENV !== 'production' && error) {
      console.warn(`[provider-workspace] could not read credentials: ${error.message}`);
    }
    return { data: null, unavailable: Boolean(error) };
  }

  const serviceName = new Map((catalog ?? []).map(item => [item.service_entity_id, item.display_name]));

  const credentials: CredentialRecord[] = (credentialRows ?? []).map(row => {
    const expiresAt = text(row.expires_at);
    const expiry = parseDate(expiresAt);
    const remaining = daysUntil(expiry, now);
    const status = verificationStatus(row.status);
    const serviceIds = Array.isArray(row.service_entity_ids) ? (row.service_entity_ids as unknown[]) : [];
    return {
      id: row.id,
      providerId,
      credentialType: row.credential_type,
      typeLabel: CREDENTIAL_TYPE_LABELS[row.credential_type] ?? 'Credential',
      issuingBody: row.issuing_body,
      jurisdictionCode: text(row.jurisdiction_code),
      referenceLabel: text(row.reference_label),
      expiresAt,
      serviceIds: serviceIds.filter((id): id is string => typeof id === 'string'),
      serviceNames: serviceIds
        .map(id => (typeof id === 'string' ? serviceName.get(id) ?? null : null))
        .filter((name): name is string => name !== null),
      documentReference: text(row.document_reference),
      status,
      submittedAt: text(row.submitted_at),
      reviewedAt: text(row.reviewed_at),
      reviewNote: text(row.review_note),
      isExpired: remaining !== null && remaining < 0,
      expiresSoon: remaining !== null && remaining >= 0 && remaining <= 60,
    };
  });

  return {
    data: {
      providerId,
      displayName: provider.display_name,
      credentials,
      serviceOptions: (catalog ?? []).map(item => ({ id: item.service_entity_id, name: item.display_name })),
      verifiedCount: credentials.filter(credential => credential.status === 'verified' && !credential.isExpired).length,
      attentionCount: credentials.filter(
        credential => credential.isExpired || credential.expiresSoon || credential.status === 'rejected',
      ).length,
    },
    unavailable: false,
  };
}
