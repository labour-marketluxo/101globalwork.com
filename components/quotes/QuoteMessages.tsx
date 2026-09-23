import { MessageSquare } from 'lucide-react';
import { CARD } from '@/components/discovery/tokens';
import type { ProviderMessage } from '@/features/quotes/messages';

/**
 * What the provider has said about this work.
 *
 * ⚠️ IT RENDERS THE PROVIDER'S SIDE ONLY, AND SAYS SO. The customer's questions live in
 * `quote_change_requests` and are rendered by the comparison page as their own list; showing them here as
 * well would present one conversation as two, and a customer would have to work out which list their own
 * question went into. This component is the other half, and each page pairs it with whichever list it owns.
 *
 * ⚠️ NO COMPOSER HERE. A customer cannot reply in this thread today — their channel is the question form on
 * the quote page, which the provider reads. A reply box that posted nowhere would be the exact failure this
 * platform refuses elsewhere.
 */
export default function QuoteMessages({
  messages,
  providerName,
  heading = 'Messages from your provider',
  emptyNote,
}: {
  messages: ProviderMessage[];
  /** Passed in rather than joined: a customer cannot read `providers`, so the caller supplies the name. */
  providerName: string;
  heading?: string;
  emptyNote?: string;
}) {
  if (messages.length === 0) {
    return emptyNote ? (
      <p className="text-xs leading-relaxed text-slate-500">{emptyNote}</p>
    ) : null;
  }

  return (
    <section className={`${CARD} p-5`} aria-labelledby="provider-messages-heading">
      <h2 id="provider-messages-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <MessageSquare aria-hidden="true" className="h-4 w-4 text-primary" />
        {heading}
      </h2>
      <ul className="mt-3 grid gap-3">
        {messages.map(message => (
          <li key={message.id} className="rounded-xl border border-solid border-slate-200 p-3.5">
            <p className="text-xs font-semibold text-slate-800">{providerName}</p>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-700">{message.message}</p>
            <p className="mt-1.5 font-mono text-[11px] tracking-wide text-slate-400 uppercase">
              {message.createdAt
                ? new Date(message.createdAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Date not recorded'}
              {message.quoteId ? ' · about a specific version' : ' · about the request'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
