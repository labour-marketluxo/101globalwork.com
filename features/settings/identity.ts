import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The read layer for /settings/profile.
 *
 * ⚠️ THE SIGN-IN ADDRESS IS SHOWN, NOT EDITED, HERE. It comes from the authentication provider
 * (`auth.users.email` / `.phone`, with the provider's own confirmation timestamps) through the command,
 * because changing it means running the provider's confirmation flow rather than writing a column. The
 * page links to that flow; this module does not pretend to own the value.
 */

export type LanguageOption = { code: string; label: string; direction: string };

export type WorkspaceOption = {
  kind: 'personal' | 'provider' | 'organisation';
  id: string;
  label: string;
  role: string;
  href: string;
};

export type ContactDelivery = {
  /** True once the outbox row has been picked up. False means queued and not yet attempted. */
  published: boolean;
  attempts: number;
  failed: boolean;
};

export type ContactMethod = {
  id: string;
  kind: 'email' | 'phone';
  value: string;
  maskedValue: string;
  isPrimary: boolean;
  verified: boolean;
  verifiedAt: string | null;
  sentAt: string | null;
  expiresAt: string | null;
  attempts: number;
  delivery: ContactDelivery;
};

export type IdentityRead = {
  available: boolean;
  profile: {
    displayName: string;
    languageCode: string;
    timezone: string;
    hasAvatar: boolean;
    avatarUpdatedAt: string | null;
  };
  signInContact: {
    email: string | null;
    emailVerified: boolean;
    phone: string | null;
    phoneVerified: boolean;
    memberSince: string | null;
  };
  contacts: ContactMethod[];
  workspaces: WorkspaceOption[];
  languages: LanguageOption[];
  timezones: string[];
};

type Raw = Record<string, unknown>;

const objectFrom = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

const rowsFrom = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

const textFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const numberFrom = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const boolFrom = (value: unknown): boolean => value === true;

const UNAVAILABLE: IdentityRead = {
  available: false,
  profile: { displayName: '', languageCode: 'en', timezone: 'UTC', hasAvatar: false, avatarUpdatedAt: null },
  signInContact: { email: null, emailVerified: false, phone: null, phoneVerified: false, memberSince: null },
  contacts: [],
  workspaces: [],
  languages: [],
  timezones: ['UTC'],
};

export async function getMyIdentity(): Promise<IdentityRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_identity_command');

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[settings] could not read the identity: ${error.message}`);
    }
    return UNAVAILABLE;
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return UNAVAILABLE;

  const profile = objectFrom(raw.profile);
  const signIn = objectFrom(raw.signInContact);

  return {
    available: true,
    profile: {
      displayName: textFrom(profile.displayName) ?? '',
      languageCode: textFrom(profile.languageCode) ?? 'en',
      timezone: textFrom(profile.timezone) ?? 'UTC',
      hasAvatar: boolFrom(profile.hasAvatar),
      avatarUpdatedAt: textFrom(profile.avatarUpdatedAt),
    },
    signInContact: {
      email: textFrom(signIn.email),
      emailVerified: boolFrom(signIn.emailVerified),
      phone: textFrom(signIn.phone),
      phoneVerified: boolFrom(signIn.phoneVerified),
      memberSince: textFrom(signIn.memberSince),
    },
    contacts: rowsFrom(raw.contacts)
      .map(entry => {
        const id = textFrom(entry.id);
        const kind = textFrom(entry.kind);
        const value = textFrom(entry.value);
        if (!id || !value || (kind !== 'email' && kind !== 'phone')) return null;
        const delivery = objectFrom(entry.delivery);
        return {
          id,
          kind,
          value,
          maskedValue: textFrom(entry.maskedValue) ?? value,
          isPrimary: boolFrom(entry.isPrimary),
          verified: boolFrom(entry.verified),
          verifiedAt: textFrom(entry.verifiedAt),
          sentAt: textFrom(entry.sentAt),
          expiresAt: textFrom(entry.expiresAt),
          attempts: numberFrom(entry.attempts),
          delivery: {
            published: boolFrom(delivery.published),
            attempts: numberFrom(delivery.attempts),
            failed: boolFrom(delivery.failed),
          },
        } satisfies ContactMethod;
      })
      .filter((entry): entry is ContactMethod => entry !== null),
    workspaces: rowsFrom(raw.workspaces)
      .map(entry => {
        const kind = textFrom(entry.kind);
        const id = textFrom(entry.id);
        const label = textFrom(entry.label);
        const href = textFrom(entry.href);
        if (!id || !label || !href) return null;
        if (kind !== 'personal' && kind !== 'provider' && kind !== 'organisation') return null;
        return {
          kind,
          id,
          label,
          role: textFrom(entry.role) ?? 'Member',
          href,
        } satisfies WorkspaceOption;
      })
      .filter((entry): entry is WorkspaceOption => entry !== null),
    languages: rowsFrom(raw.languages)
      .map(entry => {
        const code = textFrom(entry.code);
        const label = textFrom(entry.label);
        if (!code || !label) return null;
        return { code, label, direction: textFrom(entry.direction) ?? 'ltr' } satisfies LanguageOption;
      })
      .filter((entry): entry is LanguageOption => entry !== null),
    timezones: Array.isArray(raw.timezones)
      ? raw.timezones.filter((zone): zone is string => typeof zone === 'string' && zone.length > 0)
      : ['UTC'],
  };
}
