import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ReasonCodeCatalogue, ReasonCode, ReasonCodeScope } from '@/features/admin/copy';

/**
 * The reason-code vocabulary, read from the database that validates it.
 *
 * ⚠️ THE DATABASE REFUSES A CODE THAT IS NOT ON THIS LIST, so the list has to come from the database. A
 * hard-coded copy here would drift the first time a code is added to the migration, and the symptom
 * would be an operator choosing the only sensible option on screen and being told it is invalid.
 *
 * Falls back to empty lists rather than throwing: a page that cannot read the vocabulary still renders
 * its records, and the forms that need a reason code fail closed with the database's own refusal.
 */

const EMPTY: ReasonCodeCatalogue = {
  account_standing: [],
  session_revocation: [],
  contact_reveal: [],
  provider_restriction: [],
  restriction_lift: [],
  incident_ack: [],
  verification_decision: [],
  credential_decision: [],
  trust_case_action: [],
  trust_case_hold: [],
  trust_case_hold_lift: [],
  trust_case_closure: [],
  project_override: [],
  job_retry: [],
  reconciliation_retry: [],
  ledger_adjustment: [],
  payout_hold: [],
  payout_hold_release: [],
  money_case_decision: [],
  taxonomy_change: [],
  market_change: [],
};

export async function getReasonCodes(): Promise<ReasonCodeCatalogue> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_reason_codes_command');
  if (error || !data || typeof data !== 'object') return EMPTY;

  const raw = data as Record<string, unknown>;
  const read = (scope: ReasonCodeScope): ReasonCode[] => {
    const value = raw[scope];
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .map(entry => ({
        code: typeof entry.code === 'string' ? entry.code : '',
        label: typeof entry.label === 'string' ? entry.label : '',
      }))
      .filter(entry => entry.code !== '');
  };

  return {
    account_standing: read('account_standing'),
    session_revocation: read('session_revocation'),
    contact_reveal: read('contact_reveal'),
    provider_restriction: read('provider_restriction'),
    restriction_lift: read('restriction_lift'),
    incident_ack: read('incident_ack'),
    verification_decision: read('verification_decision'),
    credential_decision: read('credential_decision'),
    trust_case_action: read('trust_case_action'),
    trust_case_hold: read('trust_case_hold'),
    trust_case_hold_lift: read('trust_case_hold_lift'),
    trust_case_closure: read('trust_case_closure'),
    project_override: read('project_override'),
    job_retry: read('job_retry'),
    reconciliation_retry: read('reconciliation_retry'),
    ledger_adjustment: read('ledger_adjustment'),
    payout_hold: read('payout_hold'),
    payout_hold_release: read('payout_hold_release'),
    money_case_decision: read('money_case_decision'),
    taxonomy_change: read('taxonomy_change'),
    market_change: read('market_change'),
  };
}
