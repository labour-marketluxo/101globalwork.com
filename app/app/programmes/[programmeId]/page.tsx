import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProgrammeUnavailable } from '@/components/programmes/ProgrammeChrome';
import { ProgrammeDashboardBody } from '@/components/programmes/DashboardSections';
import { getProgrammeDashboard } from '@/features/programmes/programmes';

/**
 * Programme dashboard — /programmes/{programmeId}
 *
 * ⚠️ EVERY FIGURE ON THIS PAGE IS DRAWN FRESH PER REQUEST AND IS DIFFERENT FROM THE LAST ONE. The counts are
 * noised with the Laplace mechanism, so two visits give two answers and neither is "the" number. That is the
 * mechanism working; the page says so above the statistics rather than letting an institution discover it while
 * reconciling a grant report.
 *
 * ⚠️ A FAILED READ SHOWS NO FIGURES AT ALL. An aggregate dashboard that renders zeros when its query fails reports
 * an outage as an empty programme, which is exactly the mistake the administrator money console had to unlearn.
 */
export const metadata: Metadata = {
  title: 'Programme dashboard',
  description: 'Participation, cohorts, linked projects and allocated budget for a workforce programme.',
  robots: { index: false, follow: false },
};

export default async function ProgrammeDashboardPage({
  params,
}: {
  params: Promise<{ programmeId: string }>;
}) {
  const { programmeId } = await params;
  const read = await getProgrammeDashboard(programmeId);
  if (read.available && !read.allowed) notFound();

  if (!read.available || !read.programme) {
    return <ProgrammeUnavailable what="The dashboard" />;
  }

  return <ProgrammeDashboardBody read={read} />;
}
