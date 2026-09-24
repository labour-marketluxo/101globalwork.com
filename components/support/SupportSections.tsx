import Link from 'next/link';
import { CircleAlert, CircleCheck, Clock, FileText, Info, LifeBuoy, Paperclip, ShieldAlert, Timer } from 'lucide-react';
import { CARD, CARD_INTERACTIVE, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import ConfirmSubmit from '@/components/ui/ConfirmSubmit';
import { formatRelativeTime } from '@/features/settings/device-label';
import { SUPPORT_PATH } from '@/features/support/paths';
import {
  attachSupportFileAction,
  closeSupportCaseAction,
  createSupportCaseAction,
  replyToSupportCaseAction,
  submitSupportFeedbackAction,
} from '@/features/support/case-actions';
import {
  KIND_COPY,
  MAX_ATTACHMENT_BYTES,
  PRIORITY_COPY,
  SLA_COPY,
  STATUS_COPY,
  supportKind,
} from '@/features/support/copy';
import type {
  SupportAttachment,
  SupportCaseDetail,
  SupportCaseSummary,
  SupportFeedback,
  SupportKindOption,
  SupportMessage,
  SupportOption,
} from '@/features/support/cases';

/**
 * The support workspace's presentation, all server components.
 *
 * ⚠️ WHAT THIS PAGE PROMISES, AND WHAT IT REFUSES TO. It can say what the platform knows about a case: its
 * state, its reply history, the target dates and whether they have passed, what it is attached to, and any
 * files either side has put on it. It CANNOT promise a reply at a particular hour, so the target dates are
 * labelled as the platform's own target and the page says plainly that missing one changes nothing about the
 * work or the money. A countdown that reads as a contractual deadline would be a promise the platform has not
 * made, and /pricing owns the contractual position.
 *
 * ⚠️ THE THREAD IS THE RECORD AND IS NEVER EDITED. Messages are append-only, in order, with the author of each
 * one named as either "You" or the platform. There is no editing, no "delete my message" and no merging: a
 * support thread is read later, by somebody who was not there, and an editable one is not evidence of anything.
 */

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(date);
}

/**
 * A forward-looking countdown.
 *
 * ⚠️ `formatRelativeTime` CANNOT DO THIS. It measures how long ago something was, and a deadline is in the
 * future: passing it a future timestamp returns "Just now", which is the one wrong answer for a countdown. So
 * the direction is computed here, once, and both the overdue case and the remaining case are said in words.
 */
function deadlineState(dueIso: string | null, now: Date): { label: string; overdue: boolean } | null {
  if (!dueIso) return null;
  const due = new Date(dueIso).getTime();
  if (!Number.isFinite(due)) return null;

  const diff = due - now.getTime();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);

  const span =
    days > 0 ? `${days} day${days === 1 ? '' : 's'}${hours > 0 ? ` ${hours}h` : ''}`
      : hours > 0 ? `${hours}h ${minutes}m`
        : `${minutes}m`;

  return diff >= 0
    ? { label: `${span} remaining`, overdue: false }
    : { label: `passed by ${span}`, overdue: true };
}

export function SupportNotice({ tone, children }: { tone: 'success' | 'warning'; children: React.ReactNode }) {
  const isSuccess = tone === 'success';
  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      className={`flex items-start gap-3 rounded-xl border border-solid p-4 text-sm leading-relaxed ${
        isSuccess
          ? 'border-primary-subtle bg-primary-surface text-slate-700'
          : 'border-secondary bg-secondary-light text-amber-900'
      }`}
    >
      {isSuccess ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      ) : (
        <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" />
      )}
      <div>{children}</div>
    </div>
  );
}

export function SupportUnavailable() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-solid border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <p className="font-semibold text-slate-900">Your support cases could not be read.</p>
        <p className="mt-1">
          This is not the same as having none. Nothing has been changed — reload to try again. A case you have
          already opened keeps its thread, its deadline and its files while this page is unavailable.
        </p>
      </div>
    </div>
  );
}

/** The status pill. Words always accompany the colour, because a colour is not a label. */
export function StatusPill({ status }: { status: SupportCaseSummary['status'] }) {
  const copy = STATUS_COPY[status];
  return (
    <span
      title={copy.explains}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider uppercase ${copy.className}`}
    >
      {copy.label}
    </span>
  );
}

/**
 * Open a case.
 *
 * The link picker is populated from the account's own projects and payments — never from a search field, which
 * would let somebody attach a case to work they have nothing to do with and, worse, reveal that it exists.
 */
export function NewCasePanel({
  options,
  defaultKind,
}: {
  options: { targets: SupportOption[]; kinds: SupportKindOption[] };
  defaultKind: string;
}) {
  const kind = supportKind(defaultKind);

  return (
    <section aria-labelledby="new-case-heading" className={`${CARD} p-5 sm:p-6`}>
      <h2 id="new-case-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Open a support case
      </h2>
      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600">
        A case is private to you and the platform. You can attach files, reply in the same thread, and close it
        yourself when it is settled. The target for a first reply is set from the type of problem.
      </p>

      {kind === 'safety' ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-secondary-light p-3 text-xs leading-relaxed text-amber-900">
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
          <span>
            <strong className="font-bold">This is not an emergency service.</strong> If somebody is in danger,
            contact the emergency services where the work is taking place and tell the platform afterwards. A
            safety case is opened at high priority and the other party is not told who reported it.
          </span>
        </p>
      ) : null}

      <form action={createSupportCaseAction} className="mt-4 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="case-kind">
              What is this about?
            </label>
            <select id="case-kind" name="kind" defaultValue={kind} className={FIELD}>
              {options.kinds.length === 0 ? (
                <option value="general">Something else</option>
              ) : (
                options.kinds.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.label}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className={LABEL} htmlFor="case-target">
              Link it to a project or payment (optional)
            </label>
            <select id="case-target" name="target_id" defaultValue="" className={FIELD}>
              <option value="">Not about a specific record</option>
              {options.targets.map((target) => (
                <option key={`${target.kind}-${target.id}`} value={target.id}>
                  {target.kind === 'payment' ? 'Payment · ' : 'Project · '}
                  {target.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              Only work you are part of is listed. Linking a case means the platform can see the record it is
              about without asking you to describe it again — and a payment case with no link is answered from
              what you write here.
            </p>
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="case-subject">
            Subject
          </label>
          <input
            id="case-subject"
            name="subject"
            type="text"
            required
            minLength={6}
            maxLength={160}
            placeholder="One line that names the problem"
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="case-body">
            What happened?
          </label>
          <textarea
            id="case-body"
            name="body"
            required
            minLength={10}
            maxLength={8000}
            rows={6}
            placeholder="What you expected, what happened instead, and when. Dates, amounts and the record it relates to all help."
            className={FIELD}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Write it once, here. Anything you do not want the other party to read belongs on this case and
            nowhere else: a case is visible only to you and the platform.
          </p>
        </div>

        <div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase transition-colors hover:bg-secondary-dark"
          >
            <LifeBuoy aria-hidden="true" className="h-4 w-4" />
            Open the case
          </button>
        </div>
      </form>
    </section>
  );
}

export function SupportCaseList({
  cases,
  filter,
  counts,
  now,
}: {
  cases: SupportCaseSummary[];
  filter: string;
  counts: { open: number; closed: number };
  now: Date;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter cases">
          <ul className="flex flex-wrap items-center gap-1.5">
            {(['open', 'closed', 'all'] as const).map((value) => {
              const isCurrent = value === filter;
              const href = value === 'open' ? SUPPORT_PATH : `${SUPPORT_PATH}?filter=${value}`;
              const count = value === 'open' ? counts.open : value === 'closed' ? counts.closed : counts.open + counts.closed;
              return (
                <li key={value}>
                  <Link
                    href={href}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold no-underline transition-colors ${
                      isCurrent
                        ? 'bg-primary text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {value === 'open' ? 'Open cases' : value === 'closed' ? 'Closed' : 'All'}
                    <span className="font-mono text-[11px]">{count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="text-xs text-slate-500">
          {counts.open} open · {counts.closed} closed
        </p>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">
            {filter === 'closed' ? 'No closed cases.' : 'No open cases.'}
          </p>
          <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
            {filter === 'closed'
              ? 'Cases you close yourself, or ones the platform resolves, are kept here with their thread intact.'
              : 'Nothing is waiting on the platform from this account. Cases appear here as soon as you open one, and stay until they are closed.'}
          </p>
          {filter !== 'closed' ? (
            <p className="mt-3">
              <Link href="/help" className={LINK_ARROW}>
                Search the knowledge base first
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-3">
          {cases.map((supportCase) => (
            <li key={supportCase.id}>
              <Link
                href={`${SUPPORT_PATH}/${supportCase.id}`}
                className={`${CARD_INTERACTIVE} block p-4 no-underline`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                    {supportCase.reference}
                  </span>
                  <StatusPill status={supportCase.status} />
                  {supportCase.awaitingYou && supportCase.status !== 'closed' ? (
                    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      Waiting on you
                    </span>
                  ) : null}
                  {supportCase.resolutionOverdue ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-red-700 uppercase">
                      <Timer aria-hidden="true" className="h-3 w-3" />
                      Past target
                    </span>
                  ) : null}
                </span>

                <span className="mt-1.5 block text-sm font-bold tracking-tight text-slate-900">
                  {supportCase.subject}
                </span>

                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{KIND_COPY[supportCase.kind] ?? supportCase.kind}</span>
                  <span>
                    {supportCase.messageCount} message{supportCase.messageCount === 1 ? '' : 's'}
                  </span>
                  {supportCase.attachmentCount > 0 ? (
                    <span className="flex items-center gap-1">
                      <Paperclip aria-hidden="true" className="h-3 w-3" />
                      {supportCase.attachmentCount}
                    </span>
                  ) : null}
                  {supportCase.link ? <span>{supportCase.link.label}</span> : null}
                  <span>
                    Opened {formatRelativeTime(supportCase.createdAt, now)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The case facts and the two deadlines.
 *
 * ⚠️ BOTH TARGETS ARE SHOWN, AND BOTH SAY WHAT THEY ARE. A first-reply target and a resolution target are
 * different promises, and a single "SLA" number would let a case look on-track because it was answered quickly
 * while the problem itself sat unresolved.
 */
export function CaseFacts({ detail, now }: { detail: SupportCaseDetail; now: Date }) {
  const sla = SLA_COPY[detail.slaState] ?? SLA_COPY.on_track;
  const firstTarget = deadlineState(detail.firstResponseDueAt, now);
  const resolutionTarget = deadlineState(detail.resolutionDueAt, now);

  return (
    <section aria-labelledby="facts-heading" className={`${CARD} p-5`}>
      <h2 id="facts-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Where this stands
      </h2>

      <p
        className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
          sla.tone === 'ok'
            ? 'bg-primary-subtle text-primary'
            : sla.tone === 'bad'
              ? 'bg-red-50 text-red-700'
              : sla.tone === 'warn'
                ? 'bg-secondary-light text-amber-800'
                : 'bg-slate-100 text-slate-600'
        }`}
      >
        <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {sla.label}
      </p>

      <dl className="mt-4 grid gap-3 text-xs">
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-500">Case reference</dt>
          <dd className="font-mono font-bold text-slate-900">{detail.reference}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-500">Type</dt>
          <dd className="text-right font-semibold text-slate-800">{KIND_COPY[detail.kind] ?? detail.kind}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-500">Priority</dt>
          <dd className="text-right font-semibold text-slate-800">
            {PRIORITY_COPY[detail.priority] ?? detail.priority}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-500">Opened</dt>
          <dd className="text-right text-slate-700">{formatDay(detail.createdAt) ?? 'Unknown'}</dd>
        </div>
        {detail.reopenedCount > 0 ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-slate-500">Reopened</dt>
            <dd className="text-right text-slate-700">
              {detail.reopenedCount} time{detail.reopenedCount === 1 ? '' : 's'}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 grid gap-2 border-t border-solid border-slate-200 pt-4">
        <TargetLine
          label="First reply target"
          iso={detail.firstResponseDueAt}
          state={detail.firstRespondedAt ? 'met' : firstTarget?.overdue ? 'passed' : 'open'}
          stateLabel={
            detail.firstRespondedAt
              ? `replied ${formatRelativeTime(detail.firstRespondedAt, now)}`
              : firstTarget?.label ?? 'not set'
          }
        />
        <TargetLine
          label="Resolution target"
          iso={detail.resolutionDueAt}
          state={detail.resolvedAt ? 'met' : resolutionTarget?.overdue ? 'passed' : 'open'}
          stateLabel={
            detail.resolvedAt
              ? `resolved ${formatRelativeTime(detail.resolvedAt, now)}`
              : resolutionTarget?.label ?? 'not set'
          }
        />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        These are the platform&rsquo;s own targets, not contractual deadlines. Missing one does not change what
        the platform holds, when a payment is released, or anything agreed on a project.
      </p>
    </section>
  );
}

function TargetLine({
  label,
  iso,
  state,
  stateLabel,
}: {
  label: string;
  iso: string | null;
  state: 'met' | 'passed' | 'open';
  stateLabel: string;
}) {
  const tone =
    state === 'met' ? 'text-primary' : state === 'passed' ? 'text-red-700' : 'text-slate-700';
  const when = formatDateTime(iso);

  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-semibold ${tone}`} title={when ?? undefined}>
        {stateLabel}
        {when ? <span className="mt-0.5 block font-mono text-[10px] font-normal text-slate-400">{when}</span> : null}
      </span>
    </div>
  );
}

/** The linked project or payment, given its own card so the case can say what it is about in one click. */
export function LinkedRecordPanel({ link }: { link: { kind: string; label: string; detail: string; href: string } }) {
  return (
    <section aria-labelledby="linked-heading" className={`${CARD} p-5`}>
      <h2 id="linked-heading" className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        Linked record
      </h2>
      <p className="mt-2 text-sm font-bold tracking-tight text-slate-900">{link.label}</p>
      {link.detail ? <p className="mt-0.5 text-xs text-slate-500">{link.detail}</p> : null}
      <p className="mt-3">
        <Link href={link.href} className={LINK_ARROW}>
          {link.kind === 'payment' ? 'Open the payment' : 'Open the project'}
        </Link>
      </p>
    </section>
  );
}

/**
 * The thread.
 *
 * Chronological, append-only, and attributed. "You" rather than the account's display name because the reader
 * is the account; the platform side is always named as the platform, never as whichever person typed it.
 */
export function CaseThread({ messages, now }: { messages: SupportMessage[]; now: Date }) {
  return (
    <section aria-labelledby="thread-heading" className="grid gap-3">
      <h2 id="thread-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Case thread
      </h2>

      {messages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500">
          Nothing has been written on this case yet.
        </p>
      ) : (
        <ol className="grid gap-3">
          {messages.map((message) => {
            const when = formatDateTime(message.createdAt);
            const isRequester = message.authorRole === 'requester';
            const isSystem = message.authorRole === 'system';

            return (
              <li key={message.id}>
                <article
                  className={`rounded-xl border border-solid p-4 ${
                    isSystem
                      ? 'border-dashed border-slate-300 bg-slate-50'
                      : isRequester
                        ? 'border-slate-200 bg-white'
                        : 'border-primary-subtle bg-primary-surface'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="flex items-center gap-2 text-xs font-bold tracking-tight text-slate-900">
                      {isRequester ? 'You' : message.authorName}
                      {!isRequester && !isSystem ? (
                        <span className="rounded-full bg-white/70 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-primary uppercase">
                          Support
                        </span>
                      ) : null}
                    </p>
                    {when ? (
                      <p className="font-mono text-xs text-slate-500">
                        <time dateTime={message.createdAt ?? undefined}>{when}</time> ·{' '}
                        {formatRelativeTime(message.createdAt, now)}
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">{message.body}</p>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function AttachmentsPanel({
  caseId,
  attachments,
  canAttach,
  now,
}: {
  caseId: string;
  attachments: SupportAttachment[];
  canAttach: boolean;
  now: Date;
}) {
  return (
    <section aria-labelledby="attachments-heading" className={`${CARD} p-5`}>
      <h2 id="attachments-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <Paperclip aria-hidden="true" className="h-4 w-4 text-slate-400" />
        Files
      </h2>

      {attachments.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          No files on this case. Photographs of the problem, a quote, a receipt or a message you received all
          help — and they are stored privately rather than linked from somewhere else.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <a
                href={attachment.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-solid border-slate-200 px-3.5 py-2.5 text-xs no-underline transition-colors hover:border-primary"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate font-semibold text-slate-800">{attachment.fileName}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-slate-500">
                  {(attachment.sizeBytes / 1024).toFixed(0)} KB · {formatRelativeTime(attachment.createdAt, now)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {canAttach ? (
        <form action={attachSupportFileAction} className="mt-4 grid gap-3 border-t border-solid border-slate-200 pt-4">
          <input type="hidden" name="case_id" value={caseId} />
          <label className={LABEL} htmlFor="support-file">
            Attach a file
          </label>
          <input
            id="support-file"
            name="file"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,text/plain,text/csv"
            className="block w-full cursor-pointer rounded-lg border border-solid border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
          />
          <p className="text-xs leading-relaxed text-slate-500">
            Images, PDF, plain text or CSV, up to {Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB. Files go
            straight into private storage; only you and the platform can fetch them.
          </p>
          <div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
            >
              <Paperclip aria-hidden="true" className="h-3.5 w-3.5" />
              Attach
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export function ReplyPanel({ detail }: { detail: SupportCaseDetail }) {
  if (!detail.canReply) {
    return (
      <section aria-labelledby="reply-heading" className={`${CARD} p-5`}>
        <h2 id="reply-heading" className="text-sm font-bold tracking-tight text-slate-900">
          This case is closed
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          {STATUS_COPY.closed.explains} If the same problem has come back, open a new case and link it to the
          same record — the platform can read this one alongside it.
        </p>
        <p className="mt-3">
          <Link href="/support" className={LINK_ARROW}>
            Open a new case
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="reply-heading" className={`${CARD} p-5`}>
      <h2 id="reply-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Reply
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        Your reply goes on this thread and to the same queue. You cannot edit or delete it afterwards — that is
        what makes the thread usable as a record.
        {detail.status === 'resolved'
          ? ' Replying to a resolved case reopens it.'
          : ''}
      </p>
      <form action={replyToSupportCaseAction} className="mt-3 grid gap-3">
        <input type="hidden" name="case_id" value={detail.id} />
        <label className={LABEL} htmlFor="reply-body">
          Your reply
        </label>
        <textarea
          id="reply-body"
          name="body"
          required
          minLength={1}
          maxLength={8000}
          rows={5}
          placeholder="Add anything that has changed, or answer the question above."
          className={FIELD}
        />
        <div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-mono text-xs font-bold tracking-wide text-white uppercase transition-colors hover:bg-primary-dark"
          >
            Submit reply
          </button>
        </div>
      </form>
    </section>
  );
}

export function CloseCasePanel({ detail }: { detail: SupportCaseDetail }) {
  if (!detail.canClose) return null;

  return (
    <section aria-labelledby="close-heading" className={`${CARD} p-5`}>
      <h2 id="close-heading" className="text-sm font-bold tracking-tight text-slate-900">
        Close this case
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        Use this when it is settled. Closing does not change anything about the project or the payment it was
        about — it ends the thread, and closed cases cannot be replied to.
      </p>
      <form action={closeSupportCaseAction} className="mt-3 grid gap-3">
        <input type="hidden" name="case_id" value={detail.id} />
        <label className={LABEL} htmlFor="close-reason">
          Why are you closing it? (optional)
        </label>
        <input
          id="close-reason"
          name="close_reason"
          type="text"
          maxLength={500}
          placeholder="Sorted, no longer needed, resolved elsewhere…"
          className={FIELD}
        />
        <div>
          <ConfirmSubmit
            label="Close case"
            triggerClassName="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
            icon="danger"
            title="Close this case?"
            description="The thread ends and no further replies are possible on it. Nothing about the project or the payment changes."
            confirmLabel="Close case"
          />
        </div>
      </form>
    </section>
  );
}

/**
 * Post-resolution feedback.
 *
 * Offered only once there is a resolution, and editable afterwards by submitting again: a misclicked star that
 * cannot be corrected is a rating nobody can act on.
 */
export function FeedbackPanel({
  detail,
  feedback,
}: {
  detail: SupportCaseDetail;
  feedback: SupportFeedback | null;
}) {
  if (detail.status !== 'resolved' && detail.status !== 'closed') return null;

  return (
    <section aria-labelledby="feedback-heading" className={`${CARD} p-5`}>
      <h2 id="feedback-heading" className="text-sm font-bold tracking-tight text-slate-900">
        {feedback ? 'Your rating' : 'How did we do?'}
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        {feedback
          ? `You rated this case ${feedback.rating} out of 5${feedback.submittedAt ? ` on ${formatDay(feedback.submittedAt)}` : ''}. Submitting again replaces it.`
          : 'The rating is about the support you received, not about the outcome on the job. It is recorded against this case only.'}
      </p>

      <form action={submitSupportFeedbackAction} className="mt-3 grid gap-3">
        <input type="hidden" name="case_id" value={detail.id} />
        <fieldset>
          <legend className={LABEL}>Rating</legend>
          <div className="flex flex-wrap items-center gap-3">
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  required
                  defaultChecked={feedback ? feedback.rating === value : value === 5}
                  className="h-4 w-4"
                />
                {value}
              </label>
            ))}
            <span className="text-xs text-slate-500">1 = not resolved &amp; 5 = resolved well</span>
          </div>
        </fieldset>

        <div>
          <label className={LABEL} htmlFor="feedback-comment">
            Anything to add? (optional)
          </label>
          <textarea
            id="feedback-comment"
            name="comment"
            rows={3}
            maxLength={2000}
            defaultValue={feedback?.comment ?? ''}
            className={FIELD}
          />
        </div>

        <div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary"
          >
            {feedback ? 'Update rating' : 'Send feedback'}
          </button>
        </div>
      </form>
    </section>
  );
}

/** The line under the case heading explaining that this page is private. */
export function PrivacyNote() {
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        This case is visible only to your account and the platform. It is not shown to the other party on a job,
        it is not indexed by search engines, and nothing on it changes a project, a payment or an agreement.
      </span>
    </p>
  );
}
