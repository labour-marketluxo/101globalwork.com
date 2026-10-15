import type { ReactNode } from 'react';
import { CircleCheckBig } from '@/components/ui/icons';

/**
 * CheckList — the platform's one bulleted list.
 *
 * WHY THIS EXISTS. Every public page invented its own way of marking a list: an amber dot on the
 * taxonomy pages, an amber dash inside the numbered steps, a slate dash on the trust page, grey
 * chips on /pricing, and a row of pills on /services. Read side by side they looked like five
 * different sites. "These are the things this does" is one idea, so it gets one marker.
 *
 * THE MARKER IS A CHECK IN THE BRAND NAVY — `text-primary`, #0f383d. A check reads as a yes, which
 * is what these lines are; a dot or a dash reads as neither.
 *
 * `tone="dark"` IS FOR THE DEEP-TEAL BANDS. The navy disappears into a `bg-primary` panel, so on
 * dark surfaces the check is amber-300, the same accent those cards already use for a state you
 * can trust. The tone is a property of the SURFACE, not of the list's importance.
 *
 * WHEN NOT TO USE IT. Two cases keep their own shape:
 *   · navigation: sidebars, footers and "related" rails are lists of links and keep their arrows;
 *   · card grids and chip rows, which are laid out as cards and pills rather than as bullets.
 *
 * ONE LIST READS AGAINST THE GRAIN, ON PURPOSE. The "What it does not mean" card on
 * /trust-and-safety lists things verification is NOT, so a check there says "yes" about a "no". It
 * carries the check anyway: the call was that one marker across every public page matters more than
 * the marker's literal reading. If it is ever reversed, the dashes are four lines of markup in git.
 *
 * `className` REPLACES the whole class string rather than extending it, so a caller that needs
 * tighter spacing passes its own `grid list-none gap-1.5` instead of fighting a default it cannot
 * see. (Appending would not work anyway: two competing `gap-*` utilities resolve by stylesheet
 * order, not by the order they appear in the attribute.)
 */
export function CheckList({
  children,
  className = 'grid list-none gap-2.5',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <ul className={className}>{children}</ul>;
}

/**
 * One line of a CheckList. `className` carries the type scale and colour, because the lists this
 * replaces ranged from `text-[11px]` captions to `text-sm` body copy.
 *
 * `iconClassName` exists for the same reason: the check is `h-4 w-4` next to body text and needs to
 * come down to `h-3.5 w-3.5` beside an 11px caption, or it out-weighs the line it marks.
 */
export function CheckItem({
  children,
  trailing,
  tone = 'light',
  iconClassName = 'h-4 w-4',
  className = '',
}: {
  children: ReactNode;
  /**
   * Metadata that belongs at the right edge of the row — the severity of a problem, a count. It is
   * pushed over with `ml-auto`, so a caller only has to hand over the node and not the alignment.
   */
  trailing?: ReactNode;
  tone?: 'light' | 'dark';
  iconClassName?: string;
  className?: string;
}) {
  return (
    <li className={`flex gap-2.5 ${className}`}>
      <CircleCheckBig
        aria-hidden="true"
        className={`mt-0.5 shrink-0 ${iconClassName} ${tone === 'dark' ? 'text-amber-300' : 'text-primary'}`}
      />
      <span>{children}</span>
      {trailing ? <span className="ml-auto shrink-0">{trailing}</span> : null}
    </li>
  );
}
