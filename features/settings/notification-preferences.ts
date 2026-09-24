import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { NotificationCategory } from '@/features/notifications/copy';

/**
 * The read layer for /settings/notifications.
 *
 * ⚠️ THE LOCK IS READ, NOT ASSUMED. Every channel cell carries `locked` straight from the event catalogue —
 * the same row `set_my_notification_preference_command` refuses to change. The disabled control therefore
 * matches a rule the server enforces anyway, rather than the page deciding for itself which notices matter.
 *
 * ⚠️ TRANSPORT AVAILABILITY IS PART OF THE ANSWER. Push and SMS columns exist and are stored, but this
 * deployment has no push or SMS transport, so the matrix says so beside the column instead of implying that
 * a tick will reach somebody's phone.
 */

export type NotificationChannel = 'email' | 'push' | 'sms' | 'in_app';

export type ChannelState = { enabled: boolean; locked: boolean };

export type PreferenceEvent = {
  code: string;
  category: NotificationCategory;
  label: string;
  description: string;
  locked: boolean;
  channels: Record<NotificationChannel, ChannelState>;
};

export type TransportState = 'available' | 'unavailable';

export type PreferencesRead = {
  available: boolean;
  events: PreferenceEvent[];
  transport: Record<NotificationChannel, TransportState>;
};

export const CHANNELS: readonly NotificationChannel[] = ['email', 'push', 'sms', 'in_app'];

export const CHANNEL_COPY: Record<NotificationChannel, { label: string; short: string }> = {
  email: { label: 'Email', short: 'Email' },
  push: { label: 'Push notifications', short: 'Push' },
  sms: { label: 'Text message', short: 'SMS' },
  in_app: { label: 'In-app', short: 'In-app' },
};

type Raw = Record<string, unknown>;

const objectFrom = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

const CATEGORIES: readonly NotificationCategory[] = [
  'work_updates',
  'financials',
  'marketing',
  'security',
  'legal',
  'payment_disputes',
];

const UNAVAILABLE: PreferencesRead = {
  available: false,
  events: [],
  transport: { email: 'unavailable', push: 'unavailable', sms: 'unavailable', in_app: 'unavailable' },
};

function channelState(value: unknown): ChannelState {
  const raw = objectFrom(value);
  return { enabled: raw.enabled === true, locked: raw.locked === true };
}

export async function getMyNotificationPreferences(): Promise<PreferencesRead> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_my_notification_preferences_command');

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[settings] could not read the notification preferences: ${error.message}`);
    }
    return UNAVAILABLE;
  }

  const raw = objectFrom(data);
  if (raw.allowed !== true) return UNAVAILABLE;

  const transport = objectFrom(raw.transport);
  const transportState = (channel: NotificationChannel): TransportState =>
    transport[channel] === 'available' ? 'available' : 'unavailable';

  return {
    available: true,
    events: (Array.isArray(raw.events) ? raw.events : [])
      .map(entry => {
        const row = objectFrom(entry);
        const code = typeof row.code === 'string' ? row.code : null;
        const category = typeof row.category === 'string' ? row.category : null;
        if (!code || !category || !CATEGORIES.includes(category as NotificationCategory)) return null;
        const channels = objectFrom(row.channels);
        return {
          code,
          category: category as NotificationCategory,
          label: typeof row.label === 'string' ? row.label : code,
          description: typeof row.description === 'string' ? row.description : '',
          locked: row.locked === true,
          channels: {
            email: channelState(channels.email),
            push: channelState(channels.push),
            sms: channelState(channels.sms),
            in_app: channelState(channels.in_app),
          },
        } satisfies PreferenceEvent;
      })
      .filter((entry): entry is PreferenceEvent => entry !== null),
    transport: {
      email: transportState('email'),
      push: transportState('push'),
      sms: transportState('sms'),
      in_app: transportState('in_app'),
    },
  };
}
