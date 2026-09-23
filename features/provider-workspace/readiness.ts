import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';
import { verificationStatus } from '@/features/provider-workspace/verification';

/**
 * Search readiness — what the platform measures, and what to do about it.
 *
 * ⚠️ THE SCORE IS NOT A RANKING, AND THE PAGE MUST NOT LET ANYBODY BELIEVE IT IS. Two separate
 * numbers exist in this platform and they answer different questions:
 *
 *   `provider_search_readiness` (this page)   six deterministic bands, computed from facts about the
 *                                             provider's own data. It decides whether the provider is
 *                                             matchable at all (matching needs readiness ≥ 60) and
 *                                             whether profile pages are eligible to be indexed.
 *
 *   search-engine ranking                      decided by search engines, from signals this platform
 *                                             does not control and cannot predict.
 *
 * The copy below promises completeness and eligibility, because those are the two things the platform
 * actually enforces. A provider who improves readiness improves their chance of appearing, and that
 * sentence is as strong as this page is allowed to make it.
 *
 * ⚠️ EVERY CHECK ITEM HAS A DESTINATION. "Fix missing item" that lands on a dashboard makes a
 * provider hunt; each row below carries the page that can actually change the fact it is about, and
 * the ones that cannot be changed from a page (a review that has not finished) say so instead of
 * offering a button.
 */

export type ReadinessDimension = {
  key: string;
  label: string;
  score: number;
  /** What feeds this band, from app_private.compute_provider_search_readiness. */
  note: string;
};

export type ReadinessChecklistItem = {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  /** Null when the item is waiting on the platform rather than on the provider. */
  href: string | null;
  cta: string;
};

export type ProviderReadiness = {
  providerId: string;
  displayName: string;
  status: string;
  isPublic: boolean;
  publishedAt: string | null;
  totalScore: number;
  readiness: string;
  evaluatedAt: string | null;
  dimensions: ReadinessDimension[];
  /** The platform's own list of what is missing, resolved to links. */
  reasons: { code: string; label: string; href: string | null }[];
  checklist: ReadinessChecklistItem[];
  facts: { label: string; value: string }[];
  remaining: number;
};

export type ProviderReadinessRead = {
  data: ProviderReadiness | null;
  unavailable: boolean;
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const REASON_COPY: Record<string, { label: string; href: string | null }> = {
  add_service: { label: 'No active service is selected, so no request can be matched to you.', href: PROVIDER_PATHS.profile },
  add_service_area: { label: 'No active service area is selected, so location matching finds nothing.', href: PROVIDER_PATHS.profile },
  improve_public_description: { label: 'The public description is too thin to be useful to a customer.', href: PROVIDER_PATHS.profile },
  provider_not_active: { label: 'The profile is not published, so it is not in the marketplace at all.', href: PROVIDER_PATHS.profile },
  service_not_offered: { label: 'A request matched on location but your service list did not cover its trade.', href: PROVIDER_PATHS.profile },
  outside_service_area: { label: 'A request matched on trade but was outside every area you work in.', href: PROVIDER_PATHS.profile },
  verification_incomplete: { label: 'Matching eligibility needs a verified identity on the account.', href: PROVIDER_PATHS.verification },
  search_readiness_low: { label: 'The readiness score is below the 60 that matching requires.', href: null },
};

/** The content band the SQL scorer uses: 120 characters is full marks, 40 is partial. */
const DESCRIPTION_FULL = 120;

export async function getProviderReadiness(providerId: string, now: Date): Promise<ProviderReadinessRead> {
  const supabase = await createSupabaseServerClient();

  const [
    { data: provider, error },
    { data: profile },
    { data: readiness },
    { count: serviceCount },
    { count: areaCount },
    { data: credentials },
    { data: portfolio },
    { data: verifications },
    { data: payout },
    { count: completedJobs },
    { count: quotesSubmitted },
    { data: opportunities },
  ] = await Promise.all([
    supabase.from('providers').select('id,display_name,status,public_description').eq('id', providerId).maybeSingle(),
    supabase
      .from('provider_public_profiles')
      .select('headline,public_description,is_public,published_at,languages,operating_hours,coverage_radius_km')
      .eq('provider_id', providerId)
      .maybeSingle(),
    supabase
      .from('provider_search_readiness')
      .select('identity_score,service_score,location_score,trust_score,content_score,operations_score,total_score,readiness,reasons,evaluated_at')
      .eq('provider_id', providerId)
      .maybeSingle(),
    supabase.from('provider_services').select('*', { count: 'exact', head: true }).eq('provider_id', providerId).eq('is_active', true),
    supabase.from('provider_service_areas').select('*', { count: 'exact', head: true }).eq('provider_id', providerId).eq('is_active', true),
    supabase.from('provider_credentials').select('id,status,expires_at').eq('provider_id', providerId),
    supabase.from('provider_portfolio_items').select('id,is_public').eq('provider_id', providerId),
    supabase
      .from('provider_verifications')
      .select('kind,status,expires_at')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false }),
    supabase.from('provider_payout_destinations').select('id').eq('provider_id', providerId).eq('verification_status', 'verified').limit(1),
    supabase.from('assignments').select('*', { count: 'exact', head: true }).eq('provider_id', providerId).eq('status', 'completed'),
    supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('provider_id', providerId),
    supabase.rpc('list_my_provider_opportunities_command', { p_limit: 50 }),
  ]);

  if (error || !provider) {
    if (process.env.NODE_ENV !== 'production' && error) {
      console.warn(`[provider-workspace] could not read readiness: ${error.message}`);
    }
    return { data: null, unavailable: Boolean(error) };
  }

  type OpportunityRow = { provider_id: string; quote_id: string | null; quote_status: string | null };
  const opportunityRows = ((opportunities ?? []) as OpportunityRow[]).filter(row => row.provider_id === providerId);
  const unanswered = opportunityRows.filter(row => !row.quote_id || row.quote_status === 'withdrawn').length;

  const description = String(profile?.public_description ?? provider.public_description ?? '').trim();
  const languages = Array.isArray(profile?.languages) ? profile.languages.length : 0;
  const hoursSet = Boolean(profile?.operating_hours && Object.keys(profile.operating_hours).length > 0);
  type VerificationRow = { kind: string; status: unknown; expires_at: string | null };
  const identityVerified = ((verifications ?? []) as VerificationRow[]).some(
    row => row.kind === 'identity' && verificationStatus(row.status) === 'verified' && (!row.expires_at || new Date(row.expires_at) > now),
  );
  type CredentialRow = { status: unknown; expires_at: string | null };
  const credentialsVerified = ((credentials ?? []) as CredentialRow[]).filter(
    row => verificationStatus(row.status) === 'verified' && (!row.expires_at || new Date(`${row.expires_at}T00:00:00Z`) >= now),
  ).length;
  const publicPortfolio = ((portfolio ?? []) as { is_public: boolean }[]).filter(row => row.is_public).length;
  const payoutVerified = ((payout ?? []) as unknown[]).length > 0;
  const isPublic = Boolean(profile?.is_public && profile?.published_at);

  const checklist: ReadinessChecklistItem[] = [
    {
      key: 'published',
      label: 'Profile published',
      detail: isPublic
        ? 'Your profile is in the marketplace. Matching and discovery both read it.'
        : 'An unpublished profile is not in the marketplace at all — nothing else on this page can compensate for it.',
      done: isPublic,
      href: PROVIDER_PATHS.profile,
      cta: isPublic ? 'Review your profile' : 'Finish and publish',
    },
    {
      key: 'description',
      label: 'Public description written out',
      detail: description.length >= DESCRIPTION_FULL
        ? `${description.length} characters — a customer can tell what you actually do.`
        : `${description.length} of ${DESCRIPTION_FULL} characters. The platform scores a full description at ${DESCRIPTION_FULL} and a partial one at 40.`,
      done: description.length >= DESCRIPTION_FULL,
      href: PROVIDER_PATHS.profile,
      cta: description.length >= DESCRIPTION_FULL ? 'Edit description' : 'Fix missing item',
    },
    {
      key: 'headline',
      label: 'Headline set',
      detail: profile?.headline
        ? `Shown as “${profile.headline}”.`
        : 'The one line a customer reads in a list of providers.',
      done: Boolean(profile?.headline),
      href: PROVIDER_PATHS.profile,
      cta: profile?.headline ? 'Edit headline' : 'Fix missing item',
    },
    {
      key: 'services',
      label: 'Service categories selected',
      detail: (serviceCount ?? 0) > 0
        ? `${serviceCount} active service${serviceCount === 1 ? '' : 's'}. This is the rule matching uses — a request can only reach you for a trade on this list.`
        : 'No active service. Requests cannot be matched to you without one.',
      done: (serviceCount ?? 0) > 0,
      href: PROVIDER_PATHS.profile,
      cta: (serviceCount ?? 0) > 0 ? 'Review services' : 'Fix missing item',
    },
    {
      key: 'areas',
      label: 'Coverage areas selected',
      detail: (areaCount ?? 0) > 0
        ? `${areaCount} active area${areaCount === 1 ? '' : 's'}. Work outside these is not matched to you.`
        : 'No active service area. Location matching finds nothing without one.',
      done: (areaCount ?? 0) > 0,
      href: PROVIDER_PATHS.profile,
      cta: (areaCount ?? 0) > 0 ? 'Review coverage' : 'Fix missing item',
    },
    {
      key: 'presentation',
      label: 'Hours, languages and coverage radius',
      detail:
        languages > 0 && hoursSet
          ? `${languages} language${languages === 1 ? '' : 's'}, operating hours and ${
              typeof profile?.coverage_radius_km === 'number' ? `${profile.coverage_radius_km}km coverage` : 'no coverage radius'
            } set.`
          : 'These are the details a customer filters on. None of them changes matching — they change whether somebody stops on your profile.',
      done: languages > 0 && hoursSet,
      href: PROVIDER_PATHS.profile,
      cta: 'Fix missing item',
    },
    {
      key: 'identity',
      label: 'Identity verified',
      detail: identityVerified
        ? 'Verified. This is also what makes your profile eligible to be indexed by search engines.'
        : 'Platform review, not something you can complete by editing. Submit it and it is checked by hand.',
      done: identityVerified,
      href: PROVIDER_PATHS.verification,
      cta: identityVerified ? 'View verification' : 'Submit verification',
    },
    {
      key: 'credentials',
      label: 'At least one verified credential',
      detail: credentialsVerified > 0
        ? `${credentialsVerified} verified. Licences, certifications and insurance are counted here and shown publicly as a number only.`
        : 'No verified credential on file. A credential is what a customer checks before hiring for regulated work.',
      done: credentialsVerified > 0,
      href: PROVIDER_PATHS.credentials,
      cta: credentialsVerified > 0 ? 'Manage credentials' : 'Add one',
    },
    {
      key: 'portfolio',
      label: 'Proof of work on the profile',
      detail: publicPortfolio > 0
        ? `${publicPortfolio} public item${publicPortfolio === 1 ? '' : 's'} shown.`
        : 'No public portfolio item. Completed jobs are the strongest thing a new profile can show.',
      done: publicPortfolio > 0,
      href: PROVIDER_PATHS.profile,
      cta: publicPortfolio > 0 ? 'Manage portfolio' : 'Fix missing item',
    },
    {
      key: 'payout',
      label: 'Payout account verified',
      detail: payoutVerified
        ? 'Verified. Cleared money has somewhere to go.'
        : 'Without a verified payout account, cleared money cannot be sent to you.',
      done: payoutVerified,
      href: PROVIDER_PATHS.payouts,
      cta: payoutVerified ? 'View payout account' : 'Verify payout account',
    },
    {
      key: 'responsiveness',
      label: 'Invitations answered',
      detail:
        unanswered > 0
          ? `${unanswered} request${unanswered === 1 ? '' : 's'} you are eligible to quote ${unanswered === 1 ? 'has' : 'have'} no quote from you. Responsiveness is the part of discoverability that is entirely in your hands.`
          : 'Nothing is waiting on an answer from you.',
      done: unanswered === 0,
      href: PROVIDER_PATHS.today,
      cta: unanswered > 0 ? 'Fix missing item' : 'View opportunities',
    },
  ];

  const reasons = Array.isArray(readiness?.reasons)
    ? (readiness.reasons as unknown[])
        .filter((value): value is string => typeof value === 'string')
        .map(code => ({ code, label: REASON_COPY[code]?.label ?? code, href: REASON_COPY[code]?.href ?? null }))
    : [];

  return {
    data: {
      providerId,
      displayName: provider.display_name,
      status: provider.status,
      isPublic,
      publishedAt: text(profile?.published_at),
      totalScore: Number(readiness?.total_score ?? 0),
      readiness: text(readiness?.readiness) ?? 'not_ready',
      evaluatedAt: text(readiness?.evaluated_at),
      dimensions: [
        { key: 'identity', label: 'Identity', score: Number(readiness?.identity_score ?? 0), note: 'Whether the business has a public name at all.' },
        { key: 'service', label: 'Services', score: Number(readiness?.service_score ?? 0), note: 'At least one active service category.' },
        { key: 'location', label: 'Coverage', score: Number(readiness?.location_score ?? 0), note: 'At least one active service area.' },
        { key: 'trust', label: 'Trust', score: Number(readiness?.trust_score ?? 0), note: '60 once the provider is active, 20 before that.' },
        { key: 'content', label: 'Content', score: Number(readiness?.content_score ?? 0), note: `100 at ${DESCRIPTION_FULL} characters of public description, 60 at 40.` },
        { key: 'operations', label: 'Operations', score: Number(readiness?.operations_score ?? 0), note: '70 once the provider is active and taking work, 20 before that.' },
      ],
      reasons,
      checklist,
      facts: [
        { label: 'Completed jobs', value: String(completedJobs ?? 0) },
        { label: 'Quotes submitted', value: String(quotesSubmitted ?? 0) },
        { label: 'Requests awaiting your quote', value: String(unanswered) },
        { label: 'Verified credentials', value: String(credentialsVerified) },
        { label: 'Public portfolio items', value: String(publicPortfolio) },
      ],
      remaining: checklist.filter(item => !item.done).length,
    },
    unavailable: false,
  };
}

/** The band the platform's own scorer uses, said in words. */
export function readinessLabel(value: string): string {
  if (value === 'ready') return 'Ready for discovery';
  if (value === 'needs_attention') return 'Partly ready';
  return 'Not ready yet';
}

export function dimensionTone(score: number): 'teal' | 'amber' | 'slate' {
  if (score >= 70) return 'teal';
  if (score >= 40) return 'amber';
  return 'slate';
}
