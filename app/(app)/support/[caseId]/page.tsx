import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Timer } from '@/components/ui/icons';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import AccountSettingsHeader from '@/components/settings/AccountSettingsHeader';
import {
  AttachmentsPanel,
  CaseFacts,
  CaseThread,
  CloseCasePanel,
  FeedbackPanel,
  LinkedRecordPanel,
  PrivacyNote,
  ReplyPanel,
  StatusPill,
  SupportNotice,
  SupportUnavailable,
} from '@/components/support/SupportSections';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { SUPPORT_PATH, supportCasePath } from '@/features/support/paths';
import { getAccountShell } from '@/features/settings/shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMySupportCase } from '@/features/support/cases';
import {
  supportFailureCode,
  supportSuccessCode,
  SUPPORT_FAILURE_COPY,
  SUPPORT_SUCCESS_COPY,
} from '@/features/support/copy';

/**
 * One support case — /support/[caseId]
 *
 * ⚠️ THE URL CARRIES A CASE ID AND NOT A REFERENCE, AND THE REFERENCE IS THE ONLY ONE SHOWN. `SUP-3F9A2C81B4`
 * is what a person reads out or quotes; the uuid identifies a row and appears only in the address bar, where
 * every other signed-in surface in this application also puts its identifiers. Knowing a reference gets nobody
 * anywhere: no command accepts one, and the case commands resolve ownership from the session.
 *
 * ⚠️ A CASE THAT IS NOT YOURS IS A 404, NOT A REFUSAL. The command returns "case not found" for both a case
 * belonging to another account and a case that does not exist, and this page renders `notFound()` for both.
 * A distinct "that is not yours" would confirm the case exists, which is information the platform has no
 * reason to give anybody — the difference is an existence oracle, and ticket ids are guessable in bulk.
 *
 * ⚠️ NOTHING HERE IS OPTIMISTIC. A reply, a close and a rating are all server actions that redirect back to
 * this page with a code; the page then shows the thread as the database has it. On a support thread, the
 * difference between "sent" and "recorded" is the whole question.
 */
export const metadata: Metadata = {
  title: 'Support case',
  description: 'A private case with 101GlobalWork.',
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type Params = Promise<{ caseId: string }>;
type SearchParams = Promise<{ failed?: string; saved?: string }>;

export default async function SupportCasePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ caseId }, query] = await Promise.all([params, searchParams]);

  // A malformed id is not worth a database round trip, and it is not a page: the address is the only place a
  // uuid appears, and anything else in that segment is somebody editing it.
  if (!UUID.test(caseId)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: supportCasePath(caseId) }));

  const [shell, read] = await Promise.all([getAccountShell(), getMySupportCase(caseId)]);
  if (read.denied) notFound();

  const failure = supportFailureCode(query.failed);
  const success = supportSuccessCode(query.saved);

  if (!read.available || !read.detail) {
    return (
      <div className={PAGE_SHELL}>
        <AccountSettingsHeader shell={shell} showAccountNav current="support" />
        <div className="mt-6">
          <SupportUnavailable />
        </div>
      </div>
    );
  }

  const detail = read.detail;
  const now = new Date();

  return (
    <div className={PAGE_SHELL}>
      <AccountSettingsHeader shell={shell} showAccountNav current="support" />

      <p className="mt-6">
        <Link
          href={SUPPORT_PATH}
          className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-primary no-underline hover:text-primary-dark"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          All cases
        </Link>
      </p>

      <header className="mt-3 border-b border-solid border-slate-200 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            {detail.reference}
          </span>
          <StatusPill status={detail.status} />
          {detail.slaState === 'first_response_overdue' || detail.slaState === 'resolution_overdue' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-red-700 uppercase">
              <Timer aria-hidden="true" className="h-3 w-3" />
              Past target
            </span>
          ) : null}
        </div>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {detail.subject}
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{SUPPORT_STATUS_EXPLAINER}</p>
      </header>

      {failure ? (
        <div className="mt-5">
          <SupportNotice tone="warning">{SUPPORT_FAILURE_COPY[failure]}</SupportNotice>
        </div>
      ) : null}
      {success ? (
        <div className="mt-5">
          <SupportNotice tone="success">{SUPPORT_SUCCESS_COPY[success]}</SupportNotice>
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
        <div className="grid gap-6">
          <CaseThread messages={read.messages} now={now} />
          <ReplyPanel detail={detail} />
          <AttachmentsPanel
            caseId={detail.id}
            attachments={read.attachments}
            canAttach={detail.canReply}
            now={now}
          />
          <PrivacyNote />
        </div>

        <div className="grid gap-4 lg:sticky lg:top-28">
          <CaseFacts detail={detail} now={now} />
          {read.link ? <LinkedRecordPanel link={read.link} /> : null}
          <CloseCasePanel detail={detail} />
          <FeedbackPanel detail={detail} feedback={read.feedback} />
        </div>
      </div>
    </div>
  );
}

/** One sentence under the heading, so the pill's meaning is never a colour the reader has to interpret. */
const SUPPORT_STATUS_EXPLAINER =
  'This thread is private to your account and the platform. Targets shown beside it are the platform\u2019s own service targets, not contractual deadlines.';
