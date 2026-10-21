import { createSupabaseServerClient } from '@/lib/supabase/server';
import { WEEKDAYS, WEEKDAY_LABELS, type OperatingHours, type Weekday } from '@/features/provider-workspace/hours';

/**
 * Availability: the weekly hours, the covered areas, the radius, the blackouts, and the vacation pause.
 *
 * ⚠️ THE WEEK IS SEVEN DAYS AND NOTHING ASSUMES A WORKING WEEK. `operating_hours` is keyed by weekday and every
 * key is optional; an empty day means closed, and there is no Mon–Fri default anywhere in this module or the page
 * that renders it. The brief's "no hardcoded Monday–Friday assumptions" is satisfied by the shape of the data:
 * a provider who works Thursday to Sunday simply fills those four days in.
 *
 * ⚠️ THE "MAP" IS THE AREA CATALOG, BECAUSE THERE ARE NO COORDINATES. `locations` has latitude and longitude
 * columns and no row in this database has them set, so a radius drawn on a map would be a picture of a
 * measurement the platform cannot make. What the page shows instead is the list of areas the provider covers —
 * the same records matching reads — and the radius they typed, described as a distance rather than a place.
 *
 * ⚠️ BLACKOUTS ARE THE PROVIDER'S OWN RULE, AND THE PAGE SAYS SO. Matching does not read them; the schedule
 * action refuses a date inside one unless the provider overrides it on that form.
 */

export type BlackoutWindow = {
  id: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
  createdAt: string | null;
};

export type AvailabilitySettings = {
  travelNotes: string | null;
  pausedUntil: string | null;
  pauseReason: string | null;
  updatedAt: string | null;
};

export type AvailabilityArea = { id: string; name: string; isPrimary: boolean };

export type AvailabilityRead = {
  provider: { id: string; displayName: string; acceptsNewWork: boolean; coverageRadiusKm: number | null };
  hours: OperatingHours;
  areas: AvailabilityArea[];
  areaOptions: { id: string; name: string }[];
  blackouts: BlackoutWindow[];
  settings: AvailabilitySettings;
  /** Languages are read so the profile-detail write can pass them back rather than blanking them. */
  languages: string[];
  unavailable: boolean;
};

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});

function parseHours(value: unknown): OperatingHours {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Raw;
  const hours: OperatingHours = {};
  for (const day of WEEKDAYS) {
    const window = obj(source[day]);
    const open = text(window.open);
    const close = text(window.close);
    if (open && close) hours[day] = { open, close };
  }
  return hours;
}

export async function getAvailability(providerId: string): Promise<AvailabilityRead> {
  const supabase = await createSupabaseServerClient();

  const [
    { data: profile, error },
    { data: areaRows },
    { data: providerRow },
    { data: blackouts },
    { data: settings },
    { data: catalog },
  ] = await Promise.all([
    supabase
      .from('provider_public_profiles')
      .select('operating_hours,coverage_radius_km,accepts_new_work,languages')
      .eq('provider_id', providerId)
      .maybeSingle(),
    supabase
      .from('provider_service_areas')
      .select('location_id,is_primary')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false }),
    // Named below from the public catalog: a provider's own service area rows carry location ids.
    supabase.from('providers').select('id,display_name').eq('id', providerId).maybeSingle(),
    supabase
      .from('provider_blackout_dates')
      .select('id,starts_on,ends_on,reason,created_at')
      .eq('provider_id', providerId)
      .order('starts_on', { ascending: true }),
    supabase
      .from('provider_availability_settings')
      .select('travel_notes,paused_until,pause_reason,updated_at')
      .eq('provider_id', providerId)
      .maybeSingle(),
    supabase.from('public_location_catalog').select('location_id,display_name').order('display_name'),
  ]);

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[provider-workspace] could not read availability: ${error.message}`);
    }
    return {
      provider: { id: providerId, displayName: 'Your business', acceptsNewWork: true, coverageRadiusKm: null },
      hours: {},
      areas: [],
      areaOptions: [],
      blackouts: [],
      settings: { travelNotes: null, pausedUntil: null, pauseReason: null, updatedAt: null },
      languages: [],
      unavailable: true,
    };
  }

  const nameOf = new Map((catalog ?? []).map(entry => [entry.location_id, entry.display_name]));

  return {
    provider: {
      id: providerId,
      displayName: text(providerRow?.display_name) ?? 'Your business',
      acceptsNewWork: profile?.accepts_new_work ?? true,
      coverageRadiusKm: typeof profile?.coverage_radius_km === 'number' ? profile.coverage_radius_km : null,
    },
    hours: parseHours(profile?.operating_hours),
    areas: (areaRows ?? []).map(row => ({
      id: row.location_id,
      name: nameOf.get(row.location_id) ?? 'Selected area',
      isPrimary: row.is_primary,
    })),
    areaOptions: (catalog ?? []).map(entry => ({ id: entry.location_id, name: entry.display_name })),
    blackouts: (blackouts ?? []).map(row => ({
      id: row.id,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      reason: text(row.reason),
      createdAt: text(row.created_at),
    })),
    settings: {
      // A settings row that has never been written is the normal state, not an error.
      travelNotes: text(settings?.travel_notes),
      pausedUntil: text(settings?.paused_until),
      pauseReason: text(settings?.pause_reason),
      updatedAt: text(settings?.updated_at),
    },
    languages: Array.isArray(profile?.languages)
      ? (profile.languages as unknown[]).filter((item): item is string => typeof item === 'string')
      : [],
    unavailable: false,
  };
}

/** Days with hours set, in week order — the summary line above the matrix. */
export function openDays(hours: OperatingHours): Weekday[] {
  return WEEKDAYS.filter(day => hours[day]);
}

export function describeHours(hours: OperatingHours): string[] {
  return WEEKDAYS.map(day => {
    const window = hours[day];
    return `${WEEKDAY_LABELS[day]}: ${window ? `${window.open}–${window.close}` : 'closed'}`;
  });
}

/** ISO `YYYY-MM-DD`, the shape both the form and the table use. */
export function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function blackoutCovers(blackouts: BlackoutWindow[], isoDay: string): BlackoutWindow | null {
  const day = isoDay.slice(0, 10);
  return blackouts.find(window => day >= window.startsOn && day <= window.endsOn) ?? null;
}

export function isPaused(settings: AvailabilitySettings, today: Date): boolean {
  if (!settings.pausedUntil) return false;
  return settings.pausedUntil >= dateKey(today);
}

export function pauseExpired(settings: AvailabilitySettings, today: Date): boolean {
  if (!settings.pausedUntil) return false;
  return settings.pausedUntil < dateKey(today);
}
