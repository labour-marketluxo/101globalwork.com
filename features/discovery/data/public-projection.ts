import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Shared readers for the curated public projections.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE. Every public discovery surface reads the same
 * kind of thing: a projection table that is curated from the canonical schema, readable
 * by an anonymous visitor, and ALLOWED TO BE ABSENT (the tables are created by
 * migrations, which are applied to a database separately from the code that reads
 * them). The tolerant-read behaviour and the value coercion that goes with it were
 * copied into a second module already; a third copy is how two of them silently drift
 * and only one gets fixed.
 *
 * THE TOLERANCE IS STILL NARROW, and deliberately so: a missing, unreadable or empty
 * projection all mean "this layer has nothing to show", and none of them justifies a 500
 * on a public page. But a silent empty array also hides bugs — one already hid a column
 * that did not exist (`is_primary`) for a whole verification pass — so anything that is
 * NOT "the table is not there" warns in development.
 */

export type ProjectionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function readPublicProjection(
  supabase: ProjectionClient,
  table: string,
  columns: string,
): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await supabase.from(table).select(columns);
    if (error) {
      const absent = error.code === 'PGRST205' || error.code === '42P01';
      if (!absent && process.env.NODE_ENV !== 'production') {
        console.warn(`[discovery] ${table} read failed (${error.code}): ${error.message}`);
      }
      return [];
    }
    return (data ?? []) as unknown as Record<string, unknown>[];
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[discovery] ${table} read threw`, error);
    }
    return [];
  }
}

/** Curated string arrays arrive as jsonb. Anything else resolves to []. */
export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** PostgREST returns numerics as numbers, but a projection can always surprise you. */
export function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * A jsonb array of `{ title, body }` steps, as the planning lists store them.
 * Anything malformed is dropped rather than rendered as an empty card.
 */
export function stepArray(value: unknown): { title: string; body: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const title = text(record.title);
    const body = text(record.body);
    return title && body ? [{ title, body }] : [];
  });
}
