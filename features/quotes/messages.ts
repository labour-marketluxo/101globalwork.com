import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The provider's messages about a request, read by whichever side is looking.
 *
 * ⚠️ ONE READER FOR TWO PAGES, and that is the point of this module existing outside either workspace. The
 * provider's quote page and the customer's quote page show the same thread; a second read written beside
 * the second page is how the two start disagreeing about what was said. Which rows come back is decided by
 * RLS — the provider's owner policy and the customer's request policy — not by anything this file passes.
 *
 * ⚠️ THIS IS HALF A CONVERSATION. The other half is `quote_change_requests`, written by the customer and
 * read by the provider. There is no shared thread table and none is invented here: both directions are
 * shown side by side on the pages, labelled with who asked what.
 */

export type ProviderMessage = {
  id: string;
  message: string;
  createdAt: string | null;
  quoteId: string | null;
};

export async function getProviderMessages(requestId: string, quoteId?: string | null): Promise<ProviderMessage[]> {
  const supabase = await createSupabaseServerClient();

  // A message attached to no version belongs to the request as a whole, so it belongs on every version's
  // page: asking "is the price for the whole roof or one side?" before quoting is about the job, not about
  // a price that does not exist yet.
  //
  // ⚠️ NO JOIN TO `providers` FOR THE NAME. A customer has no read policy on that table, so an embedded
  // resource comes back null for the very person the thread is for. The name is passed in by the page, which
  // already has it from the quote comparison read.
  const query = supabase
    .from('provider_quote_messages')
    .select('id,message,created_at,quote_id')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });

  const { data, error } = quoteId
    ? await query.or(`quote_id.is.null,quote_id.eq.${quoteId}`)
    : await query;

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[quotes] could not read provider messages: ${error.message}`);
    }
    return [];
  }

  return (data ?? []).map(row => ({
    id: row.id,
    message: row.message,
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    quoteId: typeof row.quote_id === 'string' ? row.quote_id : null,
  }));
}
