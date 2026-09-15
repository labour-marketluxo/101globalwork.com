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
 * (app/(marketing)/[country]/[city]/[locality]/[service]/page.tsx) render an
 * identical trail.
 *
 * Links are emitted WITHOUT trailing slashes. next.config.ts does not set
 * `trailingSlash`, so "/ng/" would 308-redirect to "/ng" — a needless hop on
 * every breadcrumb click.
 */
export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          {item.href ? (
            <Link href={item.href}>{item.label}</Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
