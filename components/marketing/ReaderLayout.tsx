import Link from 'next/link';
import type { ReactNode } from 'react';
import { CARD, PAGE_SHELL } from '@/components/discovery/tokens';

/**
 * ReaderLayout — the two-column shell shared by /legal and the guides.
 *
 * A long document needs two navigation aids that a service page does not: a list of the OTHER
 * documents (so a reader can switch from the privacy policy to the terms without going back),
 * and a list of the sections in THIS one. Both are the same shape — a heading, then links —
 * which is why one layout serves both routes rather than two near-identical files.
 *
 * The sidebar is `sticky` from `lg` up and collapses to a plain block above the article
 * below it: on a phone the section list is more useful as a short table of contents you pass
 * on the way in than as a fixed rail eating half the viewport.
 *
 * Typography is utility-only and deliberately plain — measure capped, generous line height,
 * `scroll-mt-24` on every anchor so a heading does not land under the sticky site header (the
 * same clearance the landing sections use). There is no client JavaScript here at all, so the
 * whole route stays cheap on a slow connection.
 */
export function ReaderLayout({
  sidebarTitle,
  sidebarItems,
  sidebarExtra,
  activeHref,
  meta,
  footer,
  children,
}: {
  sidebarTitle: string;
  sidebarItems: { label: string; href: string; detail?: string }[];
  /** Anything else the sidebar should carry — a guide's related links, for instance. */
  sidebarExtra?: ReactNode;
  /** The href currently being read, marked with `aria-current`. */
  activeHref?: string;
  /** Version / last-updated block, rendered above the sidebar list. */
  meta?: ReactNode;
  /** Anything after the article — related links, a CTA band. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={PAGE_SHELL}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:items-start lg:gap-14">
        <aside className="lg:sticky lg:top-28">
          <div className={`${CARD} p-5`}>
            <h2 className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              {sidebarTitle}
            </h2>
            {meta ? <div className="mt-3 border-b border-solid border-slate-100 pb-3.5">{meta}</div> : null}
            <ul className="mt-3 grid gap-1">
              {sidebarItems.map((item) => {
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`block rounded-lg px-3 py-2 text-sm no-underline transition-colors ${
                        active
                          ? 'bg-primary-surface font-bold text-primary'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                      {item.detail ? (
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          {item.detail}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {sidebarExtra ? (
              <div className="mt-4 border-t border-solid border-slate-100 pt-4">{sidebarExtra}</div>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0">
          <article className="grid max-w-3xl gap-10">{children}</article>
          {footer ? <div className="mt-12 grid max-w-3xl gap-10">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Prose — the document body.
 *
 * Section titles are headings with `id` anchors so the table of contents can link to them,
 * and `scroll-mt-24` so the sticky header does not cover the target. Nothing here invents a
 * typography scale: it is the same slate palette and sizes the rest of the site uses, one
 * step quieter, because a policy is read rather than scanned.
 */
export function Prose({
  sections,
}: {
  sections: { id: string; title: string; paragraphs: string[]; bullets?: string[] }[];
}) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{section.title}</h2>
          <div className="mt-3 grid gap-3">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-slate-600">
                {paragraph}
              </p>
            ))}
            {section.bullets?.length ? (
              <ul className="grid gap-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-3 text-sm leading-relaxed text-slate-600">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ))}
    </>
  );
}

/** The stub used where a document's text does not exist yet. */
export function NotInForceNotice() {
  return (
    <div className="rounded-xl border border-solid border-l-4 border-amber-200/80 border-l-amber-500 bg-amber-50/70 p-5">
      <p className="text-sm leading-relaxed text-slate-700">
        <strong className="font-bold text-slate-900">This document is not in force.</strong> The
        sections below describe what the published policy will cover, not what it says. Until it is
        published, nothing on this page is a term you are agreeing to, and the platform does not
        claim otherwise.
      </p>
    </div>
  );
}
