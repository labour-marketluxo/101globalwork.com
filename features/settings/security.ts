import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The read layer for /settings/security.
 *
 * ⚠️ FACTORS COME FROM THE PROVIDER'S OWN TABLE, THROUGH AN ALLOWLIST. The page has to name each enrolled
 * authenticator and say when it was added, on the server, before any JavaScript runs. `mfa.listFactors()`
 * is a browser call; the security-definer command reads the rows GoTrue keeps instead, and never projects
 * `secret` or `phone` — a TOTP shared secret is the factor, and sending it to a page that only needs to
 * name the factor would be handing out the thing it describes.
 *
 * ⚠️ PASSWORD AGE IS NOT REPORTED, BECAUSE IT IS NOT RECORDED. The provider keeps a password hash and no
 * timestamp for when it was last set. The page says that rather than inventing a "last changed" date from
 * `auth.users.updated_at`, which moves for reasons that have nothing to do with the password.
 */

export type SecurityFactor = {
  id: string;
  type: string;
  friendlyName: string | null;
  status: string;
  createdAt: string | null;
};

export type SecurityRead = {
  available: boolean;
  factors: SecurityFactor[];
  assurance: { currentLevel: string; nextLevel: string; stepUpRequired: boolean };
  sessions: { total: number; others: number };
};

const UNAVAILABLE: SecurityRead = {
  available: false,
  factors: [],
  assurance: { currentLevel: 'aal1', nextLevel: 'aal1', stepUpRequired: false },
  sessions: { total: 0, others: 0 },
};

type Raw = Record<string, unknown>;

const objectFrom = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

const textFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const countFrom = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

export async function getMySecurityOverview(): Promise<SecurityRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_security_overview_command');

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[settings] could not read the security overview: ${error.message}`);
    }
    return UNAVAILABLE;
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return UNAVAILABLE;

  const assurance = objectFrom(raw.assurance);
  const sessions = objectFrom(raw.sessions);

  return {
    available: true,
    factors: (Array.isArray(raw.factors) ? raw.factors : [])
      .map(entry => {
        const row = objectFrom(entry);
        const id = textFrom(row.id);
        const type = textFrom(row.type);
        if (!id || !type) return null;
        return {
          id,
          type,
          friendlyName: textFrom(row.friendlyName),
          status: textFrom(row.status) ?? 'unverified',
          createdAt: textFrom(row.createdAt),
        } satisfies SecurityFactor;
      })
      .filter((entry): entry is SecurityFactor => entry !== null),
    assurance: {
      currentLevel: textFrom(assurance.currentLevel) ?? 'aal1',
      nextLevel: textFrom(assurance.nextLevel) ?? 'aal1',
      stepUpRequired: assurance.stepUpRequired === true,
    },
    sessions: {
      total: countFrom(sessions.total),
      others: countFrom(sessions.others),
    },
  };
}

/** Only a verified factor counts as protection; an enrolment somebody abandoned protects nothing. */
export function verifiedFactorTypes(factors: SecurityFactor[]): string[] {
  return [...new Set(factors.filter(factor => factor.status === 'verified').map(factor => factor.type))];
}
