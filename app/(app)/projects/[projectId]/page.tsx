import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  ChangesSection,
  ProjectOverview,
} from '@/components/projects/ProjectSections';
import { getProject } from '@/features/projects/project';

/**
 * /projects/[projectId] — the overview hub.
 *
 * ⚠️ RISKS, THEN THE ONE ACTION, THEN EVERYTHING ELSE BEHIND A DISCLOSURE. The order is the point of progressive
 * disclosure on a shared page: both parties see the same document, and the thing that needs a decision is above the
 * things that can wait. The financial and technical detail collapses by default and opens without JavaScript.
 *
 * Evidence, Timeline and Documents now have routes of their own; Changes and Milestones remain sections here, because
 * each is one card's worth of content. The page keeps only what belongs to an overview.
 */
export const metadata: Metadata = {
  title: 'Project overview',
  robots: { index: false, follow: false },
};

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, denied } = await getProject(projectId);
  if (denied || !project) notFound();

  return (
    <div className="grid gap-6">
      <ProjectOverview project={project} />
      <ChangesSection project={project} />
    </div>
  );
}
