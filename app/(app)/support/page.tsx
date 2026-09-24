import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import AccountSettingsHeader from '@/components/settings/AccountSettingsHeader';
import {
  NewCasePanel,
  SupportCaseList,
  SupportNotice,
  SupportUnavailable,
} from '@/components/support/SupportSections';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { SUPPORT_PATH } from '@/features/support/paths';
import { getAccountShell } from '@/features/settings/shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getMySupportCases, getMySupportCaseOptions } from '@/features/support/cases';
import {
  supportFailureCode,
  supportFilter,
  supportKind,
  SUPPORT_FAILURE_COPY,
} from '@/features/support/copy';

/**
 * The support workspace — /support
 *
 * ⚠️ THIS IS THE SIGNED-IN DOOR, AND THE HELP CENTRE LINKS TO IT DELIBERATELY. A case belongs to an account:
 * that is what makes it private, what lets a file be attached to it, and what lets the platform answer in a
 * thread rather than by email to an address anybody could type. A signed-out visitor who follows "Contact
 * support" is sent to sign-in and comes back here, which is stated on the help page rather than discovered at
 * the wall.
 *
 * ⚠️ ONE PAGE OPENS A CASE AND LISTS THEM, and that is a deliberate pairing rather than a crowded screen: the
 * question "has anybody answered me" and the question "how do I ask" are the same visit. The list comes first
 * because a person with an open case should see it before they are invited to open another.
 */
export const metadata: Metadata = {
  title: 'Support',
  description: 'Your support cases with 101GlobalWork, and a way to open one.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ filter?: string; kind?: string; failed?: string }>;

export default async function SupportWorkspacePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filter = supportFilter(params.filter);
  const kind = supportKind(params.kind);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: SUPPORT_PATH }));

  const [shell, list, options] = await Promise.all([
    getAccountShell(),
    getMySupportCases(filter),
    getMySupportCaseOptions(),
  ]);

  const failure = supportFailureCode(params.failed);
  const now = new Date();

  return (
    <div className={PAGE_SHELL}>
      <AccountSettingsHeader shell={shell} showAccountNav current="support" />

      <header className="mt-6">
        <h1 className="flex items-center gap-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          <LifeBuoy aria-hidden="true" className="h-6 w-6 text-primary" />
          Support
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          Private cases with the platform. Each one keeps its own thread, its own target for a reply, and any
          files either side attaches — so a question about your project, payment or account does not have to be
          reconstructed from an inbox later.
        </p>
      </header>

      {failure ? (
        <div className="mt-5">
          <SupportNotice tone="warning">{SUPPORT_FAILURE_COPY[failure]}</SupportNotice>
        </div>
      ) : null}

      <div className="mt-6 grid gap-8">
        {list.available ? (
          <SupportCaseList cases={list.cases} filter={filter} counts={list.counts} now={now} />
        ) : (
          <SupportUnavailable />
        )}

        {options.available ? (
          <NewCasePanel options={options} defaultKind={kind} />
        ) : (
          <SupportNotice tone="warning">
            The form for opening a case could not be prepared, because the list of your projects and payments
            could not be read. Nothing is wrong with your account — reload to try again. Do not describe the
            problem twice in the meantime: an existing case keeps its thread and its deadline.
          </SupportNotice>
        )}

        <p className="text-xs leading-relaxed text-slate-500">
          Looking for an answer rather than a person?{' '}
          <Link href="/help" className="underline underline-offset-2">
            The help centre
          </Link>{' '}
          has guides for customers, providers and organisations, and shows the current platform status before
          you wait on a case.
        </p>
      </div>
    </div>
  );
}
