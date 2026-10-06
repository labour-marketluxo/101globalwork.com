import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CARD, PAGE_SHELL } from '@/components/discovery/tokens';
import { PendingButton } from '@/components/provider/ProviderControls';
import { WorkspaceNotice } from '@/components/provider/WorkspaceNotices';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { acceptInvitationAction } from '@/features/organisations/directory-actions';

/**
 * /org/join/[token] — accepting an organisation invitation.
 *
 * ⚠️ THE EMAIL MUST MATCH, AND THE COMMAND CHECKS IT. The signed-in account's own address has to be the one the
 * invitation was sent to, which is the same rule the platform invitations use: an invitation is not a password, and a
 * forwarded link does not let a stranger in.
 *
 * ⚠️ THE TOKEN IS HASHED HERE BEFORE IT IS COMPARED. Only the hash is stored, so the link is not a credential the
 * database could leak in a readable form.
 */
export const metadata: Metadata = {
  title: 'Organisation invitation',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string }>;

export default async function OrganisationJoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: SearchParams;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=/org/join/${encodeURIComponent(token)}`);

  return (
    <div className={PAGE_SHELL}>
      <div className={`${CARD} mx-auto max-w-xl p-6`}>
        <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">Organisation invitation</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Join this organisation</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Accepting adds you as a member with the role and the site scope the invitation carries. Your signed-in address
          has to be the one it was sent to — if it is not, nothing happens and the inviter needs to send it there.
        </p>

        {query.failed ? (
          <div className="mt-4">
            <WorkspaceNotice tone="amber" role="alert" title="That invitation could not be accepted.">
              <p>
                It may have expired, been revoked by a later invitation, or been sent to a different email address than
                the one you are signed in with.
              </p>
            </WorkspaceNotice>
          </div>
        ) : null}

        <form action={acceptInvitationAction} className="mt-5">
          <input type="hidden" name="token" value={token} />
          <PendingButton
            idle="Accept and join"
            pending="Joining…"
            className="inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-6 py-3 font-sans text-sm font-bold tracking-wide text-white shadow-lg shadow-amber-950/20 transition-all hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-70"
          />
        </form>
      </div>
    </div>
  );
}
