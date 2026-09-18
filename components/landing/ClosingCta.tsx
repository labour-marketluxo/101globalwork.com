import { LayoutGrid, Sparkles } from 'lucide-react';
import { ActionLink, ActionRow, CtaBand } from '@/components/marketing/PageSections';

/**
 * ClosingCta — the landing page's final call to action.
 *
 * Now a thin wrapper over the shared `CtaBand`, which the three dedicated
 * marketing routes (/how-it-works, /pricing, /trust-and-safety) also close with.
 * The band carries the design's glow — `blur-[140px]` on a `bg-secondary/15`
 * circle at the centre of a deep-teal section — and that markup used to exist in
 * this file alone; four copies of it was the alternative.
 *
 * The design's second button was "Schedule Enterprise Demo" pointing at `#`.
 * There is no demo-booking flow in this app, and a button that goes nowhere is
 * worse than no button, so it points at the service directory instead — the
 * genuine next step for someone who is not ready to post yet. The id stays
 * `get-started` because the header and footer used to anchor to it; the header no
 * longer does, but existing links may.
 */
export default function ClosingCta() {
  return (
    <CtaBand
      id="get-started"
      eyebrow="Ready when you are"
      title="Ready to get your next job sorted?"
      lede="Post what you need, compare itemized quotes from verified providers, and release payment only once you are happy with the work."
      actions={
        <ActionRow>
          <ActionLink
            href="/requests/new"
            variant="amber"
            icon={<Sparkles aria-hidden="true" className="h-5 w-5" />}
          >
            Post a request
          </ActionLink>
          <ActionLink
            href="/services"
            variant="ghost"
            icon={<LayoutGrid aria-hidden="true" className="h-5 w-5" />}
          >
            Browse services
          </ActionLink>
        </ActionRow>
      }
    />
  );
}
