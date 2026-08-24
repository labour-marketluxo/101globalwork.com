'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function createRequestAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in`);

  const needText = String(formData.get('need_text') ?? '').trim();
  const marketId = String(formData.get('market_id') ?? '');
  const locationId = String(formData.get('location_id') ?? '');
  const serviceId = String(formData.get('service_entity_id') ?? '');

  const { data, error } = await supabase.rpc('create_request_command', {
    p_market_id: marketId,
    p_need_text: needText,
    p_idempotency_key: `web:${user.id}:${randomUUID()}`,
    p_location_id: locationId || null,
    p_service_entity_id: serviceId || null,
    p_problem_entity_id: null,
    p_outcome_entity_id: null,
    p_locale: 'en',
    p_timezone: null,
  });

  if (error) redirect(`/requests/new?error=${encodeURIComponent(error.message)}&q=${encodeURIComponent(needText)}`);
  redirect(`/requests/${String(data)}/matches`);
}
