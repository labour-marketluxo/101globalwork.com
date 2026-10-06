import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, CircleAlert, Eye, Search } from '@/components/ui/icons';
import PublicProfileView from '@/components/providers/PublicProfileView';
import { LINK_ARROW } from '@/components/discovery/tokens';
import { WorkspaceNotice, WorkspaceUnavailable } from '@/components/provider/WorkspaceNotices';
import { getProviderContext } from '@/features/provider-workspace/context';
import { getProviderProfileEditor, getProviderProfilePreview } from '@/features/provider-workspace/profile';
import { PROVIDER_PATHS } from '@/features/provider-workspace/paths';

/**
 * /provider/profile/preview — the exact customer-facing view.
 *
 * ⚠️ IT RENDERS `PublicProfileView`, THE SAME COMPONENT THE PUBLIC PAGE RENDERS, from the same
 * allowlisted projection. A hand-built "preview" is a promise the platform cannot keep: it drifts from
 * the real page the first time either one changes, and the provider is the one misled.
 *
 * ⚠️ AN UNPUBLISHED PROFILE HAS NO PUBLIC VIEW, AND SAYING SO IS THE POINT. The projection returns no
 * row for a draft, so this page does not simulate one — it shows the draft summary, labelled as a
 * draft, plus the searchability warnings that explain what publishing would actually change. A preview
 * that looked live while the profile was invisible to everybody would be worse than no preview.
 */
export const metadata: Metadata = {
  title: 'Profile preview',
  description: 'What customers see on your public profile page.',
  robots: { index: false, follow: false },
};

export default async function ProviderProfilePreviewPage() {
  const context = await getProviderContext();
  const provider = context?.active ?? null;
  if (!provider) redirect(PROVIDER_PATHS.onboarding);

  const [{ editor, unavailable }, preview] = await Promise.all([
    getProviderProfileEditor(provider.id),
    getProviderProfilePreview(provider.id, provider.slug),
  ]);

  if (unavailable || !editor) {
    return (
      <div className="grid gap-6">
        <PreviewHeader />
        <WorkspaceUnavailable what="Your profile preview" />
      </div>
    );
  }

  if (preview.unavailable) {
    return (
      <div className="grid gap-6">
        <PreviewHeader />
        <WorkspaceUnavailable what="The public version of your profile" />
      </div>
    );
  }

  const projection = preview.projection;
  const indexed = projection ? Number(projection.readiness_score ?? 0) >= 60 : false;

  return (
    <div className="grid gap-6">
      <PreviewHeader />

      {/* Searchability and indexability, stated as facts rather than as advice. */}
      {!projection ? (
        <WorkspaceNotice tone="amber" role="status" title="This profile is not published, so there is no customer view yet.">
          <p>
            Nothing on this page exists for customers or for search engines. Publishing is what creates
            it, and publishing is gated on the checklist in the editor.
          </p>
          <p className="mt-1">
            <Link href={PROVIDER_PATHS.profile} className={LINK_ARROW}>
              Go back to the editor
            </Link>
          </p>
        </WorkspaceNotice>
      ) : indexed ? (
        <WorkspaceNotice tone="teal" role="status" title="Published, and search engines are allowed to index it.">
          <p>
            Your readiness score is {Math.round(Number(projection.readiness_score ?? 0))}/100, which is
            above the 60 the platform requires before asking search engines to index a provider page.
            Being allowed to be indexed is not a ranking — the order results appear in is decided by the
            search engine, not by this platform.
          </p>
        </WorkspaceNotice>
      ) : (
        <WorkspaceNotice tone="amber" role="status" title="Published, but search engines are asked not to index it yet.">
          <p>
            Your readiness score is {Math.round(Number(projection.readiness_score ?? 0))}/100. Below 60
            the public page still works for anybody who has the link, but the platform asks search
            engines not to list it — a thin provider page in a search index is worse for a marketplace
            than one that is not there yet.
          </p>
          <p className="mt-1">
            <Link href={PROVIDER_PATHS.searchReadiness} className={LINK_ARROW}>
              <Search aria-hidden="true" className="h-3.5 w-3.5" />
              See what is missing
            </Link>
          </p>
        </WorkspaceNotice>
      )}

      {projection && !projection.accepts_new_work ? (
        <WorkspaceNotice tone="slate" role="status" title="You are offline.">
          <p>
            Your profile is visible and quotes can still be accepted, but no new matching runs. The
            banner on this previewed page says what a customer reading it sees.
          </p>
        </WorkspaceNotice>
      ) : null}

      {projection ? (
        <section aria-label="Public profile preview">
          <p className="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            Exactly what a customer sees at /providers/{projection.slug}
          </p>
          <div className="rounded-2xl border border-solid border-slate-200 bg-white p-6 sm:p-8">
            <PublicProfileView profile={projection} />
          </div>
        </section>
      ) : (
        <DraftSummary editor={editor} />
      )}
    </div>
  );
}

function PreviewHeader() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono text-[11px] font-bold tracking-wider text-primary uppercase">Profile</p>
        <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Preview
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          The public half of your profile, rendered from the same allowlist the live page uses.
        </p>
      </div>
      <Link href={PROVIDER_PATHS.profile} className={LINK_ARROW}>
        <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
        Back to the editor
      </Link>
    </div>
  );
}

/**
 * The draft, labelled as a draft.
 *
 * ⚠️ IT DOES NOT IMPERSONATE A PUBLIC PAGE. There is no header image, no date and no URL bar pretend —
 * the frame is a dashed border and the eyebrow says "draft". What it does show is the public half of
 * what has been written so far, because "what will customers read?" is the question the provider
 * actually has, and answering it with an empty state would be unhelpful rather than honest.
 */
function DraftSummary({ editor }: { editor: Awaited<ReturnType<typeof getProviderProfileEditor>>['editor'] }) {
  if (!editor) return null;
  const missing = [
    editor.publicDescription.trim().length >= 80 ? null : 'A public description of at least 80 characters.',
    editor.services.length === 0 ? 'At least one service category.' : null,
    editor.areas.length === 0 ? 'At least one coverage area.' : null,
    editor.identityVerified ? null : 'A verified identity.',
  ].filter((item): item is string => item !== null);

  return (
    <section
      className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 shadow-sm"
      aria-label="Draft preview"
    >
      <p className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
        Draft — not visible to anybody
      </p>

      <h2 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">
        {editor.headline ?? editor.displayName}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
        {editor.publicDescription.trim() || 'No public description yet.'}
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Services</dt>
          <dd className="mt-0.5 text-sm text-slate-700">
            {editor.services.length > 0 ? editor.services.map(service => service.name).join(', ') : 'None selected'}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Areas</dt>
          <dd className="mt-0.5 text-sm text-slate-700">
            {editor.areas.length > 0 ? editor.areas.map(area => area.name).join(', ') : 'None selected'}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] font-bold tracking-wider text-slate-500 uppercase">Languages</dt>
          <dd className="mt-0.5 text-sm text-slate-700">
            {editor.languages.length > 0 ? editor.languages.join(', ') : 'Not stated'}
          </dd>
        </div>
      </dl>

      {missing.length > 0 ? (
        <div className="mt-5 rounded-xl border border-solid border-secondary bg-secondary-light p-4">
          <p className="text-sm font-bold text-amber-900">Still needed before this can be published</p>
          <ul className="mt-2 grid gap-1 text-sm text-amber-900">
            {missing.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link href={PROVIDER_PATHS.profile} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900 underline underline-offset-2">
            Fix these in the editor
          </Link>
        </div>
      ) : null}
    </section>
  );
}
