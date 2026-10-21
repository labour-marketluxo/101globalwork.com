import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  AvatarPanel,
  ContactMethodsPanel,
  IdentityPanel,
  ProfileNotice,
  ProfileUnavailable,
  SignInContactPanel,
  WorkspacesPanel,
} from '@/components/settings/ProfileSections';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { PROFILE_PATH } from '@/features/settings/paths';
import { profileFailureCode, profileSuccessCode, PROFILE_FAILURE_COPY, PROFILE_SUCCESS_COPY } from '@/features/settings/copy';
import { getMyIdentity } from '@/features/settings/identity';
import { getAccountShell, initialsOf } from '@/features/settings/shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Profile and preferences — /settings/profile.
 *
 * ⚠️ THE PAGE IS A PAGE OF FACTS, NOT A FORM. Every panel states what the platform currently holds before it
 * offers a way to change it, and the ones that cannot be changed here say why: the sign-in address belongs to
 * the authentication provider, an SMS number needs a transport this deployment does not have, and a workspace
 * is a role somebody else granted rather than a preference to switch.
 *
 * ⚠️ IT DOES NOT RENDER AT ALL WHEN THE READ FAILS. A profile form drawn while the platform cannot read the
 * current values would be a blind overwrite — the display name box would be empty, and saving it would erase
 * the name rather than keep it. The unavailable state is an honest dead end instead.
 */
export const metadata: Metadata = {
  title: 'Profile & preferences',
  description: 'Your name, contacts, language, timezone and workspaces.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ failed?: string; saved?: string }>;

export default async function ProfileSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: PROFILE_PATH }));

  const [shell, identity] = await Promise.all([getAccountShell(), getMyIdentity()]);

  const failure = profileFailureCode(params.failed);
  const success = profileSuccessCode(params.saved);
  const now = new Date();

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Profile &amp; preferences
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          How you appear to the other party, how to reach you, and which workspaces this sign-in can act as.
        </p>
      </header>

      {failure ? <ProfileNotice tone="warning">{PROFILE_FAILURE_COPY[failure]}</ProfileNotice> : null}
      {success ? <ProfileNotice tone="success">{PROFILE_SUCCESS_COPY[success]}</ProfileNotice> : null}

      {!identity.available ? (
        <ProfileUnavailable />
      ) : (
        <>
          <IdentityPanel identity={identity} />
          <AvatarPanel
            identity={identity}
            initials={initialsOf(identity.profile.displayName, shell.email)}
            displayName={identity.profile.displayName}
          />
          <SignInContactPanel identity={identity} />
          <ContactMethodsPanel identity={identity} now={now} />
          <WorkspacesPanel identity={identity} />
        </>
      )}
    </div>
  );
}
