/**
 * The words a page shows for a refused organisation write.
 *
 * ⚠️ THIS LIVES OUTSIDE THE `'use server'` MODULE DELIBERATELY. Next 16 requires every export of a `'use server'`
 * file to be an async function, and this is neither — it is a pure lookup from a code the action put in the URL to
 * the sentence a reader needs. Keeping it beside the writes made the whole build fail rather than this module look
 * tidy, which is the correct trade: the module that talks to the database is the one that must stay a server action
 * module, and a reader can import this from anywhere.
 */

export type OrganisationFailureCode = 'not_authorized' | 'duplicate' | 'bad_request' | 'unavailable';

const COPY: Record<OrganisationFailureCode, string> = {
  not_authorized: 'That organisation is not yours to change, so nothing was saved.',
  duplicate: 'An organisation with that name already exists. Choose a different display name.',
  bad_request: 'Some of that was not valid — check the market, the locations and the currency, then try again.',
  unavailable: 'That did not work and nothing was saved. Try again.',
};

export function organisationFailureCopy(code: string | undefined | null): string | null {
  if (!code) return null;
  return COPY[code as OrganisationFailureCode] ?? COPY.unavailable;
}
