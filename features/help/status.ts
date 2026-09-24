import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The public system status, as the help centre reads it.
 *
 * ⚠️ THE FAILURE MODE IS THE WHOLE DESIGN. This module never returns "operational" because it could not read
 * anything. An unreadable status and an operational platform are different claims, and a status strip is the
 * one place where somebody decides whether to wait or to start again — so `available: false` renders as "this
 * could not be checked", exactly like the admin incident banner, which had to learn the same lesson.
 *
 * ⚠️ THE PROJECTION IS THE DATABASE'S JOB, NOT THIS FILE'S. `get_public_system_status_command` builds the
 * public shape field by field from `platform_incidents` — no runbook reference, no handling staff, no case
 * links, no resolution text, and internal severity coarsened. This module only validates what arrived, so a
 * field the database stopped publishing in a later migration cannot resurface here.
 */

export type ComponentState = 'operational' | 'degraded' | 'outage';

export type SystemComponent = {
  key: string;
  label: string;
  state: ComponentState;
  openIncidents: number;
};

export type PublicIncident = {
  title: string;
  area: string;
  severity: 'major' | 'minor';
  state: string;
  summary: string;
  startedAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
};

export type SystemStatus = {
  available: boolean;
  checkedAt: string | null;
  overall: ComponentState;
  components: SystemComponent[];
  incidents: PublicIncident[];
};

const UNAVAILABLE: SystemStatus = {
  available: false,
  checkedAt: null,
  overall: 'operational',
  components: [],
  incidents: [],
};

type Raw = Record<string, unknown>;

const objectFrom = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};

const rowsFrom = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((row): row is Raw => Boolean(row) && typeof row === 'object') : [];

const textFrom = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const countFrom = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

function componentState(value: unknown): ComponentState {
  return value === 'degraded' || value === 'outage' ? value : 'operational';
}

/** The worst state wins: one outage makes the platform's own answer "an outage is in progress". */
function worstOf(components: SystemComponent[]): ComponentState {
  if (components.some((component) => component.state === 'outage')) return 'outage';
  if (components.some((component) => component.state === 'degraded')) return 'degraded';
  return 'operational';
}

export async function getSystemStatus(): Promise<SystemStatus> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('get_public_system_status_command');

    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[help] could not read the public system status: ${error.message}`);
      }
      return UNAVAILABLE;
    }

    const raw = objectFrom(data);
    if (raw.allowed !== true) return UNAVAILABLE;

    const components: SystemComponent[] = rowsFrom(raw.components)
      .map((row) => {
        const key = textFrom(row.key);
        const label = textFrom(row.label);
        if (!key || !label) return null;
        return {
          key,
          label,
          state: componentState(row.state),
          openIncidents: countFrom(row.openIncidents),
        } satisfies SystemComponent;
      })
      .filter((entry): entry is SystemComponent => entry !== null);

    const incidents: PublicIncident[] = rowsFrom(raw.incidents)
      .map((row) => {
        const title = textFrom(row.title);
        const summary = textFrom(row.summary);
        if (!title || !summary) return null;
        return {
          title,
          area: textFrom(row.area) ?? 'platform',
          severity: row.severity === 'major' ? 'major' : 'minor',
          state: textFrom(row.state) ?? 'open',
          summary,
          startedAt: textFrom(row.startedAt),
          updatedAt: textFrom(row.updatedAt),
          resolvedAt: textFrom(row.resolvedAt),
        } satisfies PublicIncident;
      })
      .filter((entry): entry is PublicIncident => entry !== null);

    return {
      available: true,
      checkedAt: textFrom(raw.checkedAt),
      overall: worstOf(components),
      components,
      incidents,
    };
  } catch (error) {
    // A missing environment variable or an unreachable database lands here. Both mean "not checked".
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[help] the public system status read threw', error);
    }
    return UNAVAILABLE;
  }
}

export const COMPONENT_STATE_COPY: Record<ComponentState, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  operational: { label: 'Operational', tone: 'ok' },
  degraded: { label: 'Degraded', tone: 'warn' },
  outage: { label: 'Outage', tone: 'bad' },
};

export const OVERALL_STATE_COPY: Record<ComponentState, { headline: string; detail: string }> = {
  operational: {
    headline: 'All systems are operating normally',
    detail: 'No open incident is being tracked in any of the areas below.',
  },
  degraded: {
    headline: 'Some parts of the platform are degraded',
    detail: 'An incident is open. Payments and project records remain the source of truth while it is resolved.',
  },
  outage: {
    headline: 'An outage is in progress',
    detail: 'One or more areas are not working. Nothing recorded before the outage is lost — the record is the database, not the screen.',
  },
};
