import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import {
  CoveragePanel,
  FieldClassificationPanel,
  PortfolioPanel,
  ProfileEditorHeader,
  ProfileForm,
  PublishPanel,
  ServicePanel,
} from '@/components/provider/ProfileSections';
import { WorkspaceNotice, WorkspaceSkeleton, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { getProviderProfileEditor } from '@/features/provider-workspace/profile';
import { PROVIDER_PATHS, PROVIDER_FAILURE_COPY, providerFailureCode } from '@/features/provider-workspace/paths';

/**
 * /provider/profile — the editor.
 *
 * ⚠️ THE EDITOR AND THE PREVIEW ARE SEPARATE ROUTES, NOT A TOGGLE. A provider comparing what they wrote
 * with what a customer sees is doing two things that want different amounts of screen: a form with
 * eight sections, and a page that looks like the marketplace. The preview is a click away and re-renders
 * from the database, so what it shows is what a customer would get at that moment — not what the form
 * currently holds, which is the difference between a preview and a mock-up.
 */
export const metadata: Metadata = {
  title: 'Profile',
  description: 'The public and private parts of your provider profile.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ saved?: string; published?: string; failed?: string }>;

export default async function ProviderProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const failure = providerFailureCode(params.failed);

  return (
    <div className="grid gap-6">
      {failure ? (
        <WorkspaceNotice tone="amber" role="alert" title="That change did not go through.">
          <p>{PROVIDER_FAILURE_COPY[failure]}</p>
        </WorkspaceNotice>
      ) : null}
      {params.saved ? (
        <WorkspaceNotice tone="teal" role="status" title="Saved.">
          <p>Your profile is updated and readiness has been recalculated.</p>
        </WorkspaceNotice>
      ) : null}
      {params.published === '1' ? (
        <WorkspaceNotice tone="teal" role="status" title="Published.">
          <p>
            You are in the marketplace. Matching now reads the services and areas on this page, so keep
            them accurate.
          </p>
        </WorkspaceNotice>
      ) : null}

      <Suspense fallback={<WorkspaceSkeleton />}>
        <ProfileBody providerId={provider.id} />
      </Suspense>
    </div>
  );
}

async function ProfileBody({ providerId }: { providerId: string }) {
  const { editor, unavailable } = await getProviderProfileEditor(providerId);
  if (unavailable || !editor) return <WorkspaceUnavailable what="Your profile" />;

  const descriptionLength = editor.publicDescription.trim().length;
  const requirements = [
    { label: 'Public description of 80 characters or more', done: descriptionLength >= 80, href: '#profile-form' },
    { label: 'At least one service category', done: editor.services.length > 0, href: '#services' },
    { label: 'At least one coverage area', done: editor.areas.length > 0, href: '#coverage' },
    { label: 'Identity verified', done: editor.identityVerified, href: PROVIDER_PATHS.verification },
  ];

  return (
    <>
      <ProfileEditorHeader editor={editor} />
      <FieldClassificationPanel />
      <ProfileForm editor={editor} nextPath={PROVIDER_PATHS.profile} />
      <ServicePanel editor={editor} nextPath={PROVIDER_PATHS.profile} />
      <CoveragePanel editor={editor} nextPath={PROVIDER_PATHS.profile} />
      <PortfolioPanel editor={editor} nextPath={PROVIDER_PATHS.profile} />
      <PublishPanel editor={editor} nextPath={PROVIDER_PATHS.profile} requirements={requirements} />
    </>
  );
}
