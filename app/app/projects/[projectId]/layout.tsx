import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PAGE_SHELL } from '@/components/discovery/tokens';
import ProjectTabs from '@/components/projects/ProjectShell';
import { ProjectHeader } from '@/components/projects/ProjectSections';
import { getProject } from '@/features/projects/project';

/**
 * The shared project layout — one header and one tab bar for every tab.
 *
 * ⚠️ AUTHORISATION HAPPENS HERE, ONCE, AND AGAIN IN EVERY READ. The layout asks for the project as the caller and
 * renders `notFound()` when the command says they have no role on it, so an unauthorised visitor never sees a shell
 * that implies the project exists. The pages do the same check, because a layout is not a security boundary: a page
 * can be requested and rendered on its own, and every read re-derives the role inside the database.
 *
 * ⚠️ NOINDEX IS SET HERE AND INHERITED. Next merges a layout's metadata into its pages, so a future tab under this
 * route is noindex without anybody remembering to say so — the same belt the provider workspace uses.
 *
 * ⚠️ `projectId` IS AN ASSIGNMENT ID. There is no projects table in this schema; the unit of agreed work is the
 * assignment, created when a customer accepts a quote. The route keeps the brief's shape so a real projects table
 * could be pointed at it later.
 */
export const metadata: Metadata = {
  title: 'Project',
  description: 'One piece of agreed work, seen by both parties.',
  robots: { index: false, follow: false },
};

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { project, denied, unavailable } = await getProject(projectId);

  if (unavailable) {
    // An unavailable read is not a 404: the project may exist and the platform may be having a bad minute. Saying
    // so is better than telling somebody their job is gone.
    return (
      <div className={PAGE_SHELL}>
        <p className="text-sm text-slate-600">
          This project could not be loaded. Nothing has changed — reload to try again.
        </p>
      </div>
    );
  }
  if (denied || !project) notFound();

  return (
    <div className={PAGE_SHELL}>
      <ProjectHeader project={project} />

      <div className="mt-5">
        <ProjectTabs assignmentId={project.header.assignmentId} />
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}
