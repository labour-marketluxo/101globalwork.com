import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Invitations, as the accepting side sees them.
 *
 * WHAT AN INVITATION MEANS ON THIS PLATFORM, because the brief describes something broader and it is
 * worth being exact about what is behind these routes.
 *
 *   The brief asks for invitations to join an ORGANISATION or a PROJECT, with roles like "Manager"
 *   and "Team Member", a permissions summary and a multi-user business account behind them.
 *
 *   This platform has none of that. There is no organisations table, no team membership and no
 *   per-organisation role. What exists — and it is real, audited and already in production use — is
 *   `platform_admin_invitations`: an invitation for one person to hold an administrative role on the
 *   platform itself (support, trust, finance, operations, discovery, or the owner role), granted
 *   through `platform_admin_memberships` and checked on every administrative action.
 *
 * So these routes implement the REAL invitation: accept or decline administrative access. The page is
 * explicit about that rather than borrowing the organisation wording, because a recipient needs to
 * understand what they are agreeing to — and "Manager" does not appear anywhere in this schema.
 *
 * TOKEN HANDLING. The database stores only `sha256(token)`; the plaintext exists in the invitation
 * email and in the URL the recipient clicks. Nothing here ever writes that token to a cookie, a log
 * line or a rendered attribute beyond the form that submits it, and the lookup happens server-side
 * through `get_platform_invitation_command` — which returns a masked address, never the raw one.
 *
 * THE VIEW MODEL HAS NO IDENTIFIERS. No invitation id, no account id, no role id: the page has no use
 * for them, and a component that cannot see an id cannot leak one into markup.
 */

export type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'expired'
  | 'revoked'
  | 'declined'
  /** Not a database status — the token matched nothing at all. */
  | 'invalid'
  /** The read itself failed; distinct from "this token is wrong". */
  | 'unavailable';

export type InvitationView = {
  status: InvitationStatus;
  /** Display name of the administrative role, e.g. "Trust and safety administrator". */
  roleName: string | null;
  inviterName: string | null;
  inviterIsOwner: boolean;
  /** ISO timestamp, for the expiry indicator. */
  expiresAt: string | null;
  /** Already masked in the database — the raw address never leaves it. */
  emailMasked: string | null;
  /**
   * Whether the signed-in account's address is the invited one, decided in SQL.
   *
   * The page needs this before anything is clicked — the brief asks for a warning when the wrong
   * account is signed in, and a warning that only appears after a failed attempt is not a warning. The
   * database compares the two real addresses and returns a boolean, so the application never holds the
   * invited address and never needs a second implementation of the masking rule.
   */
  emailMatchesSignedIn: boolean;
  capabilities: string[];
};

/** True when the invitation can still be acted on. */
export function isActionable(status: InvitationStatus): boolean {
  return status === 'pending';
}

/** Whole days (rounded up) until expiry, or null when there is nothing to count. */
export function daysUntil(expiresAt: string | null, now = Date.now()): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

const STATUS_VALUES: readonly InvitationStatus[] = [
  'pending',
  'accepted',
  'expired',
  'revoked',
  'declined',
  'invalid',
];

/**
 * Read an invitation by its token.
 *
 * Fails SOFT rather than throwing. The page has a real state for "we could not read this" — an
 * unavailable card with a retry — and a 500 would tell the visitor their invitation is broken when
 * the truth may be that the platform is briefly unwell. Same reasoning as the tolerant projection
 * readers in the discovery layer, and the same discipline: log the unexpected branch, because a
 * silent fallback hides its own bugs.
 */
export async function getInvitationByToken(token: string): Promise<InvitationView> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_platform_invitation_command', { p_token: token });

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[invitations] read failed:', error.message);
    }
    return emptyInvitation('unavailable');
  }

  const row = (data ?? null) as Record<string, unknown> | null;
  const status = String(row?.status ?? 'invalid') as InvitationStatus;

  return {
    status: STATUS_VALUES.includes(status) ? status : 'invalid',
    roleName: typeof row?.role_name === 'string' ? row.role_name : null,
    inviterName: typeof row?.inviter_name === 'string' ? row.inviter_name : null,
    inviterIsOwner: row?.inviter_is_owner === true,
    expiresAt: typeof row?.expires_at === 'string' ? row.expires_at : null,
    emailMasked: typeof row?.email_masked === 'string' ? row.email_masked : null,
    emailMatchesSignedIn: row?.email_matches_signed_in === true,
    capabilities: Array.isArray(row?.capabilities) ? (row.capabilities as string[]) : [],
  };
}

function emptyInvitation(status: InvitationStatus): InvitationView {
  return {
    status,
    roleName: null,
    inviterName: null,
    inviterIsOwner: false,
    expiresAt: null,
    emailMasked: null,
    emailMatchesSignedIn: false,
    capabilities: [],
  };
}

/**
 * The failure vocabulary for accept and decline.
 *
 * ⚠️ WHY THESE ARE CODES AND NOT MESSAGES. The route this replaces put the provider's own error text
 * straight into the query string — `?error=${error.message}` — which is both a user-editable parameter
 * rendered inside the page and a place where a database message reaches a visitor. A message like
 * "invitation email does not match signed-in account" is genuinely useful, but useful as a STATE the
 * page has copy for, not as a string that arrives from a URL.
 *
 * It lives in this module rather than in actions.ts because a `'use server'` file may export only
 * async functions, and a vocabulary plus its copy is neither.
 */
export type InvitationErrorCode =
  | 'invalid_token'
  | 'expired'
  | 'already_used'
  | 'wrong_account'
  | 'no_account'
  | 'unavailable';

const ERROR_COPY: Record<InvitationErrorCode, string> = {
  invalid_token:
    'That invitation link could not be matched to an invitation. Links are single-use and long, so a clipped or retyped address is the usual cause — open the original message and use its link.',
  expired:
    'This invitation has expired. Invitations are time-limited on purpose; ask the person who invited you to send a new one.',
  already_used:
    'This invitation has already been used, revoked or declined. If you believe that is wrong, the person who invited you can send another.',
  wrong_account:
    'This invitation was sent to a different email address than the account you are signed in with. Administrative access has to be accepted by the address it was sent to.',
  no_account:
    'Accepting an invitation needs an active account. Create one or sign in first — the invitation link stays valid while you do.',
  unavailable:
    'The platform could not complete that request just now. Nothing has changed about the invitation; try again in a moment.',
};

export function invitationErrorMessage(code: InvitationErrorCode): string {
  return ERROR_COPY[code];
}

/** Accepted from the URL only if it is one of ours; anything else becomes `unavailable`. */
export function invitationErrorCode(value: string | string[] | undefined): InvitationErrorCode | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return raw in ERROR_COPY ? (raw as InvitationErrorCode) : 'unavailable';
}

/** Map a command's failure onto the vocabulary above. Provider text never reaches a URL. */
export function classifyInvitationError(message: string | null | undefined): InvitationErrorCode {
  const text = String(message ?? '').toLowerCase();
  if (text.includes('expired')) return 'expired';
  if (text.includes('does not match signed-in account')) return 'wrong_account';
  if (text.includes('active account required')) return 'no_account';
  if (text.includes('already')) return 'already_used';
  if (text.includes('not found')) return 'invalid_token';
  return 'unavailable';
}

export type PendingInvitation = {
  roleName: string;
  inviterName: string;
  expiresAt: string | null;
};
/** The invitation waiting for the signed-in account, without needing the token. Used by onboarding. */
export async function getMyPendingInvitation(): Promise<PendingInvitation | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_pending_platform_invitation_command');
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[invitations] pending read failed:', error.message);
    }
    return null;
  }

  const row = (data ?? null) as Record<string, unknown> | null;
  if (!row || typeof row.role_name !== 'string') return null;

  return {
    roleName: row.role_name,
    inviterName: typeof row.inviter_name === 'string' ? row.inviter_name : 'A platform administrator',
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
  };
}

/**
 * Turn capability keys into a plain-language summary of what the role can do.
 *
 * THE MAPPING IS DERIVED FROM THE ADMIN NAVIGATION, not invented. AdminNav already groups its links by
 * these exact prefixes — `platform.admin` is "Users & access", `platform.trust` is "Trust & safety",
 * `platform.money` is "Money" — so this reads the same vocabulary the platform's own interface uses
 * for the same powers. Where a prefix is not one the navigation names, the summary says so instead of
 * guessing at a label: an unknown capability is exactly the case where a reassuring description would
 * be a lie.
 *
 * Raw keys are deliberately NOT rendered. A recipient needs to know what they are being given, not
 * the string the database matches on; and the brief is explicit that administrative scopes should not
 * be exposed to the client. The keys stay on the server.
 */
export function describeCapabilities(capabilities: string[]): { label: string; detail: string }[] {
  const areas: Record<string, { label: string; detail: string }> = {
    'platform.owner': {
      label: 'Full control of the platform',
      detail:
        'Everything below, plus the powers that are reserved for the platform owner — including transferring ownership.',
    },
    'platform.admin': {
      label: 'Users and access',
      detail:
        'Changing who has administrative access, and reading the audit trail of those changes. This is the area that can grant the others.',
    },
    'platform.trust': {
      label: 'Trust and safety',
      detail: 'Verification decisions and dispute handling.',
    },
    'platform.projects': {
      label: 'Work oversight',
      detail: 'Reviewing requests and the work being coordinated on the platform.',
    },
    'platform.money': {
      label: 'Money',
      detail: 'Payment obligations, payouts and financial corrections.',
    },
    'platform.seo': {
      label: 'Discovery and search',
      detail: 'How the public catalogue appears to search engines, including indexing policy.',
    },
    'platform.taxonomy': {
      label: 'Service catalogue',
      detail: 'The canonical trades, categories and their public copy.',
    },
    'platform.operations': {
      label: 'Operations',
      detail: 'Day-to-day platform operations and the configuration behind them.',
    },
  };

  const found: { label: string; detail: string }[] = [];
  const seen = new Set<string>();
  let unrecognised = 0;

  for (const capability of capabilities) {
    // `platform.owner` is matched exactly (it is a single capability, not a prefix with children).
    const exact = areas[capability];
    if (exact) {
      if (!seen.has(exact.label)) {
        seen.add(exact.label);
        found.push(exact);
      }
      continue;
    }

    const prefix = capability.split('.').slice(0, 2).join('.');
    const area = areas[prefix];
    if (area) {
      if (!seen.has(area.label)) {
        seen.add(area.label);
        found.push(area);
      }
      continue;
    }

    unrecognised += 1;
  }

  if (unrecognised > 0) {
    found.push({
      label: `${unrecognised} further permission${unrecognised === 1 ? '' : 's'}`,
      detail:
        'This role also holds permissions this page does not describe. They are not shown with a guessed label — ask the person who invited you before accepting if that matters.',
    });
  }

  return found;
}
