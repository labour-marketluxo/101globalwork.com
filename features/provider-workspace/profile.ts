import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PublicProviderProfile } from '@/lib/providers/public-profile';
import { WEEKDAYS, type OperatingHours } from '@/features/provider-workspace/hours';

/**
 * The profile editor and its preview.
 *
 * ⚠️ THE CLASSIFICATION IS DATA, NOT PROSE. A field being public is a property of the projection in
 * the database — `get_public_provider_profile_command` — and the editor renders this table so a
 * provider can see exactly which of their answers leave the platform. Keeping the table here, beside
 * the reader that fills the form, means the two cannot drift: a field added to the projection without
 * a row here is a field the editor would publish silently.
 *
 * ⚠️ THE PREVIEW READS THE SAME COMMAND THE PUBLIC PAGE READS. Not a lookalike component, not a
 * screenshot: `get_public_provider_profile_command` is the allowlist, and both surfaces call it. That
 * is the only arrangement in which "this is what customers see" is a statement the platform can back.
 */

export type ProfileFieldClassification = {
  key: string;
  label: string;
  classification: 'public' | 'private';
  note: string;
};

export const PROFILE_FIELD_CLASSIFICATION: readonly ProfileFieldClassification[] = [
  {
    key: 'headline',
    label: 'Headline',
    classification: 'public',
    note: 'Shown on your public profile page and in search results.',
  },
  {
    key: 'public_description',
    label: 'Description',
    classification: 'public',
    note: 'At least 80 characters. This is the part customers read before deciding to invite you.',
  },
  {
    key: 'service_categories',
    label: 'Service categories',
    classification: 'public',
    note: 'Also the rule that decides which requests can reach you — matching reads the same records.',
  },
  {
    key: 'service_areas',
    label: 'Service areas',
    classification: 'public',
    note: 'The areas you work in. Customers see the area name, never an address — the platform holds none.',
  },
  {
    key: 'coverage_radius',
    label: 'Coverage radius',
    classification: 'public',
    note: 'A distance from your base, not a location. It cannot be resolved back into an address.',
  },
  {
    key: 'operating_hours',
    label: 'Operating hours',
    classification: 'public',
    note: 'Typical hours. They are indicative — an appointment is the commitment, not this table.',
  },
  {
    key: 'languages',
    label: 'Languages',
    classification: 'public',
    note: 'Languages you can work in, shown as written.',
  },
  {
    key: 'portfolio',
    label: 'Portfolio items marked public',
    classification: 'public',
    note: 'Only the caption, the link and the service name are published. Items you untick stay private.',
  },
  {
    key: 'verified_credentials',
    label: 'Verified credential count',
    classification: 'public',
    note: 'Shown as a number — "2 verified credentials". The issuing body and reference never leave your account.',
  },
  {
    key: 'legal_name',
    label: 'Registered business name',
    classification: 'private',
    note: 'Your account name. Only your public display name is published.',
  },
  {
    key: 'credential_detail',
    label: 'Credential issuing body, jurisdiction, reference and expiry',
    classification: 'private',
    note: 'Read by you and by a platform verification reviewer. A document number on a public page is what impersonation is built from.',
  },
  {
    key: 'verification_documents',
    label: 'Verification submissions and their review notes',
    classification: 'private',
    note: 'Classified regulated_sensitive. Never projected, in any form.',
  },
  {
    key: 'payout_account',
    label: 'Payout account',
    classification: 'private',
    note: 'Only the platform and your bank see it. Even the last four digits are not published.',
  },
  {
    key: 'readiness_score',
    label: 'Search readiness score',
    classification: 'private',
    note: 'Your own view of your completeness. It is not displayed on your profile — customers see the verified badges instead.',
  },
] as const;

export type ProviderServiceRecord = { id: string; name: string; isPrimary: boolean };
export type ProviderAreaRecord = { id: string; name: string; isPrimary: boolean };

export type ProviderPortfolioItem = {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string | null;
  serviceName: string | null;
  isPublic: boolean;
  createdAt: string | null;
};

export type ProviderProfileEditor = {
  providerId: string;
  displayName: string;
  marketName: string | null;
  slug: string;
  headline: string | null;
  publicDescription: string;
  yearsExperience: number | null;
  acceptsNewWork: boolean;
  operatingHours: OperatingHours;
  languages: string[];
  coverageRadiusKm: number | null;
  services: ProviderServiceRecord[];
  areas: ProviderAreaRecord[];
  portfolio: ProviderPortfolioItem[];
  serviceOptions: { id: string; name: string }[];
  areaOptions: { id: string; name: string }[];
  isPublic: boolean;
  publishedAt: string | null;
  readinessScore: number;
  /** The publish gate's other half. Read here so the editor can say what is still missing. */
  identityVerified: boolean;
};

export type ProviderProfileEditorRead = {
  editor: ProviderProfileEditor | null;
  unavailable: boolean;
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

/**
 * Hours arrive as jsonb keyed by weekday. Anything that is not a {open, close} string pair is
 * dropped rather than rendered as an empty row: the write command validates the shape, so a value
 * that fails here is a row written before that validation existed, and "Monday: –" would be worse
 * than "Monday: not set".
 */
function parseOperatingHours(value: unknown): OperatingHours {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Raw;
  const hours: OperatingHours = {};
  for (const day of WEEKDAYS) {
    const window = source[day];
    if (!window || typeof window !== 'object' || Array.isArray(window)) continue;
    const open = text((window as Raw).open);
    const close = text((window as Raw).close);
    if (open && close) hours[day] = { open, close };
  }
  return hours;
}

function parseLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export async function getProviderProfileEditor(providerId: string): Promise<ProviderProfileEditorRead> {
  const supabase = await createSupabaseServerClient();

  const [
    { data: provider, error: providerError },
    { data: profile },
    { data: services },
    { data: areas },
    { data: portfolio },
    { data: serviceCatalog },
    { data: locationCatalog },
    { data: marketCatalog },
    { data: readiness },
    { data: identityRows },
  ] = await Promise.all([
    supabase.from('providers').select('id,display_name,public_description,primary_market_id,status').eq('id', providerId).maybeSingle(),
    supabase
      .from('provider_public_profiles')
      .select('slug,headline,public_description,years_experience,accepts_new_work,operating_hours,languages,coverage_radius_km,is_public,published_at')
      .eq('provider_id', providerId)
      .maybeSingle(),
    supabase
      .from('provider_services')
      .select('id,service_entity_id,is_primary')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false }),
    supabase
      .from('provider_service_areas')
      .select('id,location_id,is_primary')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false }),
    supabase
      .from('provider_portfolio_items')
      .select('id,title,description,link_url,service_entity_id,is_public,created_at')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false }),
    supabase.from('public_service_catalog').select('service_entity_id,display_name').order('display_name'),
    supabase.from('public_location_catalog').select('location_id,display_name').order('display_name'),
    supabase.from('public_market_catalog').select('market_id,display_name'),
    supabase.from('provider_search_readiness').select('total_score').eq('provider_id', providerId).maybeSingle(),
    supabase
      .from('provider_verifications')
      .select('id,status,expires_at')
      .eq('provider_id', providerId)
      .eq('kind', 'identity'),
  ]);

  if (providerError || !provider) {
    if (process.env.NODE_ENV !== 'production' && providerError) {
      console.warn(`[provider-workspace] could not read the profile editor: ${providerError.message}`);
    }
    return { editor: null, unavailable: Boolean(providerError) };
  }

  const serviceName = new Map((serviceCatalog ?? []).map(item => [item.service_entity_id, item.display_name]));
  const locationName = new Map((locationCatalog ?? []).map(item => [item.location_id, item.display_name]));
  const marketName = new Map((marketCatalog ?? []).map(item => [item.market_id, item.display_name]));

  return {
    editor: {
      providerId,
      displayName: provider.display_name,
      marketName: provider.primary_market_id ? marketName.get(provider.primary_market_id) ?? null : null,
      slug: profile?.slug ?? '',
      headline: text(profile?.headline),
      publicDescription: String(profile?.public_description ?? provider.public_description ?? ''),
      yearsExperience: typeof profile?.years_experience === 'number' ? profile.years_experience : null,
      acceptsNewWork: profile?.accepts_new_work ?? true,
      operatingHours: parseOperatingHours(profile?.operating_hours),
      languages: parseLanguages(profile?.languages),
      coverageRadiusKm: typeof profile?.coverage_radius_km === 'number' ? profile.coverage_radius_km : null,
      services: (services ?? []).map(row => ({
        id: row.service_entity_id,
        name: serviceName.get(row.service_entity_id) ?? 'Selected service',
        isPrimary: row.is_primary,
      })),
      areas: (areas ?? []).map(row => ({
        id: row.location_id,
        name: locationName.get(row.location_id) ?? 'Selected area',
        isPrimary: row.is_primary,
      })),
      portfolio: (portfolio ?? []).map(row => ({
        id: row.id,
        title: row.title,
        description: text(row.description),
        linkUrl: text(row.link_url),
        serviceName: row.service_entity_id ? serviceName.get(row.service_entity_id) ?? null : null,
        isPublic: row.is_public,
        createdAt: text(row.created_at),
      })),
      serviceOptions: (serviceCatalog ?? []).map(item => ({ id: item.service_entity_id, name: item.display_name })),
      areaOptions: (locationCatalog ?? []).map(item => ({ id: item.location_id, name: item.display_name })),
      isPublic: Boolean(profile?.is_public),
      publishedAt: text(profile?.published_at),
      readinessScore: Number(readiness?.total_score ?? 0),
      identityVerified: (identityRows ?? []).some(
        row =>
          row.status === 'verified' &&
          (!row.expires_at || new Date(row.expires_at as string) > new Date()),
      ),
    },
    unavailable: false,
  };
}

/**
 * The preview.
 *
 * ⚠️ A DRAFT HAS NO PUBLIC VIEW, AND SAYING SO IS THE FEATURE. `get_public_provider_profile_command`
 * returns a row only for a published, active provider, so an unpublished profile previews as null —
 * and the page renders "nothing is published yet, here is what would be" against the editor's own
 * values rather than inventing a public page that does not exist. A preview that showed a draft as
 * though it were live is the one way this page could mislead somebody into thinking they were
 * discoverable.
 */
export async function getProviderProfilePreview(
  providerId: string,
  slug: string | null,
): Promise<{ projection: PublicProviderProfile | null; unavailable: boolean }> {
  if (!slug) return { projection: null, unavailable: false };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_public_provider_profile_command', { p_slug: slug });
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] could not read the public projection: ${error.message}`);
    }
    return { projection: null, unavailable: true };
  }
  const row = (data?.[0] ?? null) as PublicProviderProfile | null;
  // The projection only returns published providers. A row for a different provider would mean the
  // slug is not this provider's, which the editor never produces — guard anyway rather than render
  // another business's profile as this one's preview.
  if (row && row.provider_id !== providerId) return { projection: null, unavailable: false };
  return { projection: row, unavailable: false };
}
