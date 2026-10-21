'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { projectOrdersPath } from '@/features/orders/paths';
import type { OrdersFailureCode } from '@/features/orders/copy';

/**
 * The goods hub's writes.
 *
 * ⚠️ NO PRICE CROSSES THIS BOUNDARY. The order form posts product ids and quantities; `place_commerce_order_command`
 * looks every price up in the catalogue itself and totals it there. There is no field for a price to arrive in,
 * which is stronger than validating one.
 *
 * ⚠️ NOTHING HERE RECORDS A PAYMENT OR A REFUND, AND THAT IS THE LEDGER SEPARATION MADE VISIBLE. Recording money
 * against a commerce order is the platform's job — it needs the `platform.money.reconcile` capability and an
 * aal2 session — and it is not reachable from a customer page. What a customer can do about money here is ask
 * for the goods to go back, which is a request and not a posting.
 */

function failureCode(message: string): OrdersFailureCode {
  if (message.includes('cannot mix currencies')) return 'mixed_currency';
  if (message.includes('already has a return')) return 'return_in_progress';
  if (message.includes('cannot be fulfilled')) return 'not_fulfillable';
  if (message.includes('once the goods have been delivered')) return 'not_delivered';
  if (message.includes('use a return request')) return 'not_payable';
  if (message.includes('not authorized') || message.includes('authentication required') || message.includes('only the account')) {
    return 'not_authorized';
  }
  if (message.includes('not found') || message.includes('not available') || message.includes('not supplied')) {
    return 'not_found';
  }
  return 'bad_request';
}

function backTo(projectId: string, params: Record<string, string | number | undefined>): string {
  const base = projectOrdersPath(projectId);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `${base}?${encoded}` : base;
}

async function requireSession(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: projectOrdersPath(projectId) }));
  return supabase;
}

/**
 * Build the line list from the form.
 *
 * Quantities arrive as `qty_<product id>`, which is how one form can carry the whole catalogue without a
 * client-side cart. A line left at zero or blank is not ordered; a line with anything else that is not a whole
 * number is refused rather than rounded, because the difference between 10 bags and 10.5 bags is a real one.
 */
function linesFromForm(formData: FormData): { product_id: string; quantity: number }[] | null {
  const lines: { product_id: string; quantity: number }[] = [];

  for (const [field, value] of formData.entries()) {
    if (!field.startsWith('qty_')) continue;
    const productId = field.slice(4);
    const raw = String(value).trim();
    if (raw.length === 0 || raw === '0') continue;

    if (!/^[0-9]+$/.test(raw)) return null;
    const quantity = Number.parseInt(raw, 10);
    if (quantity < 1 || quantity > 10000) return null;
    if (productId.length === 0) return null;

    lines.push({ product_id: productId, quantity });
  }

  return lines.length > 0 ? lines : null;
}

export async function placeOrderAction(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '');
  const supabase = await requireSession(projectId);

  const lines = linesFromForm(formData);
  if (!lines) redirect(backTo(projectId, { failed: 'bad_request' }));

  const { error } = await supabase.rpc('place_commerce_order_command', {
    p_assignment_id: projectId,
    p_items: lines,
    p_delivery_address: String(formData.get('delivery_address') ?? '').trim(),
    p_delivery_note: String(formData.get('delivery_note') ?? '').trim() || null,
  });

  if (error) redirect(backTo(projectId, { failed: failureCode(error.message) }));
  redirect(backTo(projectId, { saved: 'placed' }));
}

export async function cancelOrderAction(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '');
  const supabase = await requireSession(projectId);

  const { error } = await supabase.rpc('cancel_commerce_order_command', {
    p_order_id: String(formData.get('order_id') ?? ''),
    p_reason: String(formData.get('cancel_reason') ?? '').trim() || null,
  });
  if (error) redirect(backTo(projectId, { failed: failureCode(error.message) }));

  redirect(backTo(projectId, { saved: 'cancelled' }));
}

export async function recordShipmentAction(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '');
  const supabase = await requireSession(projectId);

  const { error } = await supabase.rpc('record_commerce_shipment_command', {
    p_order_id: String(formData.get('order_id') ?? ''),
    p_state: String(formData.get('state') ?? 'preparing'),
    p_carrier: String(formData.get('carrier') ?? '').trim() || null,
    p_tracking_reference: String(formData.get('tracking_reference') ?? '').trim() || null,
    p_note: String(formData.get('note') ?? '').trim() || null,
  });
  if (error) redirect(backTo(projectId, { failed: failureCode(error.message) }));

  redirect(backTo(projectId, { saved: 'shipment' }));
}

export async function requestReturnAction(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '');
  const supabase = await requireSession(projectId);

  const { error } = await supabase.rpc('request_commerce_return_command', {
    p_order_id: String(formData.get('order_id') ?? ''),
    p_reason: String(formData.get('return_reason') ?? '').trim(),
  });
  if (error) redirect(backTo(projectId, { failed: failureCode(error.message) }));

  redirect(backTo(projectId, { saved: 'returned' }));
}
