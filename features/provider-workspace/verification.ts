import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The verification centre's read layer.
 *
 * ⚠️ THE REQUIREMENTS ARE DECLARED HERE, AND ONLY ONE OF THEM IS A GATE. Publishing requires a
 * verified `identity` — `publish_provider_profile_authoritatively` refuses without it — while
 * `business` and `address` are asked for and not enforced. Saying which is which on the page is the
 * point: a provider who submits a business registration and waits for it before starting work they
 * are already allowed to do has been misled by an undifferentiated checklist.
 *
 * ⚠️ THE STATUS WORDS ARE DERIVED, NOT STORED. `verification_status` has five values and the page
 * needs a sentence for each, including the one the enum cannot express: "action needed", which is
 * rejected-with-a-reason. The mapping lives here so the badge, the filter and the copy cannot
 * disagree about what a row means.
 */

export type VerificationStatus = 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired';

export type VerificationRecord = {
  id: string;
  kind: string;
  status: VerificationStatus;
  jurisdictionCode: string | null;
  referenceLabel: string | null;
  /** The provider's own pointer to their evidence. Not a file — see the migration note. */
  documentReference: string | null;
  /** A reviewer's sentence explaining a rejection. The reason a re-submission needs to answer. */
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
};

export type VerificationRequirement = {
  kind: string;
  label: string;
  /** True when publication is blocked without it. */
  required: boolean;
  note: string;
  record: VerificationRecord | null;
};

export const VERIFICATION_REQUIREMENTS = [
  {
    kind: 'identity',
    label: 'Identity',
    required: true,
    note: 'Required before your profile can be published. Reviewed by hand, usually within a working day.',
  },
  {
    kind: 'business',
    label: 'Business registration',
    required: false,
    note: 'Asked for, not required. It strengthens a commercial bid; it does not block publication.',
  },
  {
    kind: 'address',
    label: 'Service address',
    required: false,
    note: 'Asked for, not required. The platform holds no street address on your public profile either way.',
  },
] as const;

export const VERIFICATION_KIND_LABELS: Record<string, string> = {
  identity: 'Identity',
  business: 'Business registration',
  address: 'Service address',
  credential: 'Credential',
  insurance: 'Insurance',
  licence: 'Licence',
};

/**
 * The badge a status earns.
 *
 * `rejected` maps to "Action needed" rather than "Rejected", because the action is the point: the
 * row is not a verdict on the provider, it is a request to send a better document, and the review
 * note on the same card says what was wrong with the last one.
 */
export const VERIFICATION_STATUS_COPY: Record<
  VerificationStatus,
  { label: string; tone: 'amber' | 'teal' | 'slate' }
> = {
  not_started: { label: 'Not started', tone: 'slate' },
  pending: { label: 'Pending review', tone: 'amber' },
  verified: { label: 'Verified', tone: 'teal' },
  rejected: { label: 'Action needed', tone: 'amber' },
  expired: { label: 'Expired', tone: 'amber' },
};

export function verificationStatus(value: unknown): VerificationStatus {
  return value === 'pending' || value === 'verified' || value === 'rejected' || value === 'expired'
    ? value
    : 'not_started';
}

export type VerificationCentre = {
  providerId: string;
  displayName: string;
  isPublic: boolean;
  requirements: VerificationRequirement[];
  /** Everything ever submitted, newest first — the record the requirements above summarise. */
  history: VerificationRecord[];
  /** True when a rejected or expired row is waiting on the provider rather than on the platform. */
  needsAction: boolean;
};

export type VerificationCentreRead = {
  centre: VerificationCentre | null;
  unavailable: boolean;
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

function metadataOf(value: unknown): Raw {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
}

function toRecord(row: Raw): VerificationRecord | null {
  const id = text(row.id);
  if (!id) return null;
  const metadata = metadataOf(row.metadata);
  return {
    id,
    kind: text(row.kind) ?? 'identity',
    status: verificationStatus(row.status),
    jurisdictionCode: text(row.jurisdiction_code),
    referenceLabel: text(row.reference_label),
    documentReference: text(metadata.document_reference),
    reviewNote: text(metadata.review_note),
    submittedAt: text(row.created_at),
    reviewedAt: text(row.reviewed_at),
    verifiedAt: text(row.verified_at),
    expiresAt: text(row.expires_at),
  };
}

export async function getVerificationCentre(providerId: string): Promise<VerificationCentreRead> {
  const supabase = await createSupabaseServerClient();

  const [{ data: provider, error }, { data: verificationRows }, { data: profile }] = await Promise.all([
    supabase.from('providers').select('id,display_name').eq('id', providerId).maybeSingle(),
    supabase
      .from('provider_verifications')
      .select('id,kind,status,jurisdiction_code,reference_label,metadata,created_at,reviewed_at,verified_at,expires_at')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false }),
    supabase.from('provider_public_profiles').select('is_public').eq('provider_id', providerId).maybeSingle(),
  ]);

  if (error || !provider) {
    if (process.env.NODE_ENV !== 'production' && error) {
      console.warn(`[provider-workspace] could not read verification: ${error.message}`);
    }
    return { centre: null, unavailable: Boolean(error) };
  }

  const history = (verificationRows ?? [])
    .map(row => toRecord(row as Raw))
    .filter((record): record is VerificationRecord => record !== null);

  // The newest row of each kind is the live claim; older rows stay in history so a provider can see
  // what they sent before a rejection.
  const latestByKind = new Map<string, VerificationRecord>();
  for (const record of history) {
    if (!latestByKind.has(record.kind)) latestByKind.set(record.kind, record);
  }

  const requirements: VerificationRequirement[] = VERIFICATION_REQUIREMENTS.map(requirement => ({
    ...requirement,
    record: latestByKind.get(requirement.kind) ?? null,
  }));

  const needsAction = requirements.some(
    requirement => requirement.record?.status === 'rejected' || requirement.record?.status === 'expired',
  );

  return {
    centre: {
      providerId,
      displayName: provider.display_name,
      isPublic: Boolean(profile?.is_public),
      requirements,
      history,
      needsAction,
    },
    unavailable: false,
  };
}
