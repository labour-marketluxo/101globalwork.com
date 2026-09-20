import Link from 'next/link';
import { Fragment } from 'react';

export type BreadcrumbItem = {
  label: string;
  /** Omit on the final entry — that one renders as the current page. */
  href?: string;
};

/**
 * Breadcrumb trail.
 *
 * Uses the `.breadcrumbs` styles already defined in app/globals.css so the hub
 * pages and the existing leaf route
 * (app/(marketing)/[market]/[city]/[locality]/[service]/page.tsx) render an
 * identical trail.
 *
 * Links are emitted WITHOUT trailing slashes. next.config.ts does not set
 * `trailingSlash`, so "/ng/" would 308-redirect to "/ng" — a needless hop on
 * every breadcrumb click.
 *
 * TWO TONES. `.breadcrumbs` (components layer) paints the trail in `--muted`,
 * which is right on the page canvas and wrong on the deep-teal hero band the
 * market search page now opens with — nothing would be readable there. `tone`
 * only swaps colour: `dark` sets slate-400 and lifts the links on hover, and
 * because both are utilities they outrank the class in the cascade. The
 * separator and the current-page span inherit, so one class covers all three
 * pieces of the trail. `className` exists for the same reason — the band wants
 * a tighter bottom margin than the class's 24px.
 */
const TONE: Record<'light' | 'dark', string> = {
  light: '',
  dark: 'text-slate-400 [&_a]:text-slate-300 [&_a]:transition-colors [&_a]:hover:text-white',
};

export default function Breadcrumbs({
  items,
  tone = 'light',
  className = '',
}: {
  items: BreadcrumbItem[];
  /** `dark` for light text on the deep-teal bands. Defaults to the on-canvas look. */
  tone?: 'light' | 'dark';
  className?: string;
}) {
  return (
    <nav className={`breadcrumbs ${TONE[tone]} ${className}`} aria-label="Breadcrumb">
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          {/* `aria-current` marks the CURRENT page, and only the last crumb is that.
              A middle crumb can be href-less for a legitimate reason — the local
              discovery page drops an ancestor's link when its hub route does not exist
              rather than pointing at a 404 — and marking those as "current" told a
              screen reader that three different levels were the page being read. */}
          {item.href ? (
            <Link href={item.href}>{item.label}</Link>
          ) : (
            <span aria-current={index === items.length - 1 ? 'page' : undefined}>
              {item.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
