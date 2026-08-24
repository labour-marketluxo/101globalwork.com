'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const CreateRequestSchema = z.object({
  marketId: z.string().uuid(),
  needText: z.string().trim().min(5).max(4000),
  locationId: z.string().uuid().nullable().optional(),
  serviceEntityId: z.string().uuid().nullable().optional(),
  problemEntityId: z.string().uuid().nullable().optional(),
  outcomeEntityId: z.string().uuid().nullable().optional(),
  locale: z.string().trim().max(32).nullable().optional(),
  timezone: z.string().trim().max(128).nullable().optional(),
});

export type CreateRequestInput = z.infer<typeof CreateRequestSchema>;

export async function createRequest(input: CreateRequestInput) {
  const parsed = CreateRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: 'INVALID_INPUT', issues: parsed.error.flatten() };
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false as const, code: 'AUTH_REQUIRED' };

  const idempotencyKey = `web:${auth.user.id}:${randomUUID()}`;
  const { data, error } = await supabase.rpc('create_request_command', {
    p_market_id: parsed.data.marketId,
    p_need_text: parsed.data.needText,
    p_idempotency_key: idempotencyKey,
    p_location_id: parsed.data.locationId ?? null,
    p_service_entity_id: parsed.data.serviceEntityId ?? null,
    p_problem_entity_id: parsed.data.problemEntityId ?? null,
    p_outcome_entity_id: parsed.data.outcomeEntityId ?? null,
    p_locale: parsed.data.locale ?? null,
    p_timezone: parsed.data.timezone ?? null,
  });

  if (error) return { ok: false as const, code: 'CREATE_FAILED', message: error.message };
  return { ok: true as const, requestId: data as string };
}
