import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProgrammeUnavailable } from '@/components/programmes/ProgrammeChrome';
import { ProgrammeInsightsBody } from '@/components/programmes/InsightSections';
import { getProgrammeInsights } from '@/features/programmes/programmes';

/**
 * Labour intelligence — /programmes/{programmeId}/insights
 *
 * ⚠️ THE DIMENSIONS ARE FIXED IN THE DATABASE, NOT CHOSEN HERE. There is no grouping parameter, no filter and no
 * date range on this page: the command computes a known set of breakdowns, each one thresholded and noised. A
 * visitor who could choose the grouping could choose one that isolates a single person, and no threshold on the
 * output makes an unsafe question safe.
 *
 * ⚠️ THE PAGE IS USEFUL AND INCOMPLETE ON PURPOSE. Withheld cells are named and counted rather than dropped, so a
 * reader can see that a distribution is missing its small categories — which is the honest thing for an institution
 * writing a grant report, and the opposite of a table that silently omits half its rows.
 */
export const metadata: Metadata = {
  title: 'Labour intelligence',
  description: 'Skill, region, credential and rate aggregates for a workforce programme.',
  robots: { index: false, follow: false },
};

export default async function ProgrammeInsightsPage({
  params,
}: {
  params: Promise<{ programmeId: string }>;
}) {
  const { programmeId } = await params;
  const read = await getProgrammeInsights(programmeId);
  if (read.available && !read.allowed) notFound();

  if (!read.available) {
    return <ProgrammeUnavailable what="The labour intelligence" />;
  }

  return <ProgrammeInsightsBody read={read} />;
}
