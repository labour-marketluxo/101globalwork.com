import { CircleCheck, Info, ShieldAlert } from '@/components/ui/icons';
import { CARD } from '@/components/discovery/tokens';

/**
 * The shared notices of the provider workspace — all server components.
 *
 * ONE PLACE, because the alternative is what the customer pages already show: four hand-written
 * `role="alert"` paragraphs whose tones, borders and icon spacing have drifted apart. The tones here
 * are the platform's three meanings — amber for "you need to do something", teal for "done", slate for
 * "here is how this works" — and `role` is chosen by the caller so the same visual can be a status
 * (polite) or an alert (assertive) depending on whether the visitor just pressed a button.
 */

export function WorkspaceNotice({
  tone,
  role,
  title,
  children,
}: {
  tone: 'amber' | 'teal' | 'slate';
  role?: 'status' | 'alert';
  title?: string;
  children?: React.ReactNode;
}) {
  const cls =
    tone === 'amber'
      ? 'border-secondary bg-secondary-light text-amber-900'
      : tone === 'teal'
        ? 'border-primary-subtle bg-primary-surface text-slate-700'
        : 'border-slate-200 bg-white text-slate-600';
  const Icon = tone === 'amber' ? ShieldAlert : tone === 'teal' ? CircleCheck : Info;
  const iconColor = tone === 'amber' ? 'text-amber-800' : tone === 'teal' ? 'text-primary' : 'text-slate-400';

  return (
    <div role={role} className={`flex items-start gap-3 rounded-xl border border-solid p-4 text-sm leading-relaxed ${cls}`}>
      <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
      <div className="min-w-0">
        {title ? <p className="font-bold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

/**
 * The Suspense fallback.
 *
 * Shaped like the content it replaces — a hero, then two cards — so the page does not jump when the
 * read lands. `motion-reduce:animate-none` because a pulsing card is motion, and this page is opened
 * by somebody about to decide whether to drive somewhere.
 */
export function WorkspaceSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden="true">
      <div className="h-40 animate-pulse rounded-2xl border border-solid border-primary/10 bg-primary-surface motion-reduce:animate-none" />
      <div className={`${CARD} h-56 animate-pulse motion-reduce:animate-none`} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={`${CARD} h-40 animate-pulse motion-reduce:animate-none`} />
        <div className={`${CARD} h-40 animate-pulse motion-reduce:animate-none`} />
      </div>
    </div>
  );
}

/** A read that failed, said plainly and with something to do next. */
export function WorkspaceUnavailable({ what }: { what: string }) {
  return (
    <WorkspaceNotice tone="slate" role="status" title={`${what} could not be loaded.`}>
      <p>
        Nothing has changed and nothing is lost — this is a page that could not read your data, not a
        change that failed. Reload to try again. If it keeps failing, the platform has a problem rather
        than your account having one.
      </p>
    </WorkspaceNotice>
  );
}

/** The one empty state every list in this workspace shares, so they cannot drift apart. */
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-solid border-slate-300 bg-white px-5 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">{children}</p> : null}
    </div>
  );
}
