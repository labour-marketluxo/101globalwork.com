import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight } from '@/components/ui/icons';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import WorkspaceHero, { WORKSPACE_HERO_ACTION } from '@/components/workspace/WorkspaceHero';
import { ProjectsEmpty, ProjectCard } from '@/components/projects/ProjectIndexSections';
import { AUTH_PATHS, hrefWith } from '@/features/auth/post-auth';
import { getMyProjects } from '@/features/projects/list';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * /app/projects — the index of agreed work.
 *
 * ⚠️ THIS PAGE EXISTS BECAUSE THE ROUTE HAD NO WAY IN. `/app/projects/[projectId]` is a shared destination that
 * belongs to neither workspace, so no section navigation lists it: a customer reached it only from the
 * completion review at the end of a job, and a provider only from the field workspace. The bar that appears on
 * every signed-in route outside the three sections (see FallbackNavbar) now carries a "Projects" entry, and
 * this is what it opens.
 *
 * ⚠️ IT IS AN INDEX, NOT A DASHBOARD. Each card says what the job is, which side of it you are on, who the
 * other party is, where and when — and links to the project. No counts and no money: the project's own overview
 * decides the next action from the authoritative state, and a second opinion here could only disagree with it.
 * The one action on the page commissions new work, which is not a project's next step and belongs to no job.
 *
 * ⚠️ AUTHORISATION IS NOT DECIDED HERE EITHER. Both reads behind `getMyProjects` scope themselves to the
 * caller in SQL, so this list cannot contain a project the caller is not party to, and every row's link lands
 * on a page that re-derives the same answer again.
 */
export const metadata: Metadata = {
  title: 'Projects',
  description: 'Every piece of agreed work you are party to, from both sides.',
  robots: { index: false, follow: false },
};

export default async function ProjectsIndexPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(hrefWith(AUTH_PATHS.signIn, { next: '/app/projects' }));

  const { rows, unavailable } = await getMyProjects();

  if (unavailable) {
    // The same distinction the project layout draws: an unavailable read is not an empty list, and telling
    // somebody their work is gone is worse than telling them the platform is having a bad minute.
    return (
      <div className={PAGE_SHELL}>
        <p className="text-sm text-slate-600">
          Your projects could not be loaded. Nothing has changed — reload to try again.
        </p>
      </div>
    );
  }

  return (
    <div className={PAGE_SHELL}>
      {/* The same deep-teal band every other signed-in surface opens with: this page renders under the fallback
          bar rather than inside a workspace shell, so without it the top of the page would be bare. */}
      <WorkspaceHero
        eyebrow="Projects"
        title="Your projects"
        description="Every piece of agreed work you are party to, whichever side of it you are on. Both parties open the same project: the plan, the messages, the evidence, the documents and the money behind it."
      >
        <Link href="/app/customer/requests/new" className={WORKSPACE_HERO_ACTION}>
          Post a request
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </WorkspaceHero>

      {rows.length > 0 ? (
        /* Three to a row on a desktop and two on a tablet: the cards are short enough to be scanned as a set,
           which is the point of an index, and one per row on a phone. */
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(row => (
            <ProjectCard key={row.assignmentId} row={row} />
          ))}
        </ul>
      ) : (
        <ProjectsEmpty />
      )}

      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        Platform staff see every project, including ones they are not party to, in the{' '}
        <Link href="/admin/projects" className="font-semibold text-primary no-underline hover:text-primary-dark">
          admin console
        </Link>
        .
      </p>
    </div>
  );
}
