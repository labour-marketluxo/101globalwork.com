import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeDevice, type DeviceDescription } from '@/features/settings/device-label';

/**
 * The read layer for /settings/security/sessions.
 *
 * Everything here comes from one RPC, `get_my_sessions_command`, which reads GoTrue's own session
 * table through an allowlist and marks the row the caller is holding. The reasons it has to reach
 * into that table at all — and the two probes that established there is no API for it — are written
 * out in supabase/migrations/20260922100000_account_session_management.sql.
 *
 * THIS MODULE IS THE ONLY PLACE THAT KNOWS THE WIRE SHAPE. The RPC returns jsonb built field by
 * field, and `jsonb_strip_nulls` means a field the database did not have is ABSENT rather than null.
 * So every field is read defensively and nothing outside this file touches the raw object.
 */

export type SessionRecord = {
  id: string;
  /** True for the session making the request, decided by the database from the JWT. */
  isCurrent: boolean;
  createdAt: string | null;
  /**
   * When GoTrue last rotated this session's token — the closest thing to "last used". Null for a
   * session that has never refreshed, which is why the page labels `createdAt` separately rather
   * than passing one timestamp off as the other.
   */
  refreshedAt: string | null;
  updatedAt: string | null;
  ip: string | null;
  aal: string | null;
  userAgent: string | null;
  device: DeviceDescription;
};

export type SessionsRead = {
  sessions: SessionRecord[];
  /**
   * True when the list could not be read at all. The page renders an honest failure instead of the
   * empty state — "no other devices are signed in" and "we could not check" are very different
   * things to tell somebody who came here worried about an intruder.
   */
  unavailable: boolean;
};

type RawSession = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

function toRecord(raw: RawSession): SessionRecord | null {
  const id = text(raw.id);
  if (!id) return null;

  const userAgent = text(raw.user_agent);

  return {
    id,
    isCurrent: raw.is_current === true,
    createdAt: text(raw.created_at),
    refreshedAt: text(raw.refreshed_at),
    updatedAt: text(raw.updated_at),
    ip: text(raw.ip),
    aal: text(raw.aal),
    userAgent,
    device: describeDevice(userAgent),
  };
}

export async function getMySessions(): Promise<SessionsRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_sessions_command');

  if (error) {
    // A deliberately tolerant read would hide its own failure, which is the mistake this project has
    // already made once with a missing column that silently emptied a page. The difference here is
    // that the caller is TOLD: `unavailable` reaches the UI. The log is for development only.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[settings/sessions] could not read sessions: ${error.message}`);
    }
    return { sessions: [], unavailable: true };
  }

  const rows = Array.isArray(data) ? (data as RawSession[]) : [];
  const sessions = rows
    .map(toRecord)
    .filter((record): record is SessionRecord => record !== null)
    // The chain is newest first, so a page with several devices reads from the top. The RPC orders
    // by created_at, but the current session is pinned first here — the card for the device in your
    // hand is the one you want to see.
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });

  return { sessions, unavailable: false };
}

export type SessionsSummary = {
  current: SessionRecord | null;
  others: SessionRecord[];
  /** Distinct addresses the account is signed in from, ignoring sessions GoTrue recorded no IP for. */
  addresses: string[];
  multipleAddresses: boolean;
};

/**
 * What the page needs to know about the list as a whole.
 *
 * THE ONLY SUSPICION SIGNAL IS DERIVABLE FROM THE DATA. The brief asks the page to highlight
 * "unrecognized device locations or multiple concurrent IP logins", and this platform cannot resolve
 * an address to a location — there is no geolocation service, no database, and inventing "Lagos,
 * Nigeria" from an address would be a guess printed in the one place a guess is most dangerous. What
 * IS knowable is that one account is signed in from more than one address, so that is the signal,
 * and it is a fact rather than an inference.
 */
export function summariseSessions(sessions: SessionRecord[]): SessionsSummary {
  const current = sessions.find(session => session.isCurrent) ?? null;
  const others = sessions.filter(session => !session.isCurrent);
  const addresses = [...new Set(sessions.map(session => session.ip).filter((ip): ip is string => Boolean(ip)))];

  return { current, others, addresses, multipleAddresses: addresses.length >= 2 };
}
