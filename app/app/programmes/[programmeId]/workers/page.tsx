import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProgrammeNotice, ProgrammeUnavailable } from '@/components/programmes/ProgrammeChrome';
import { WorkerRegistryBody } from '@/components/programmes/WorkerSections';
import { getProgrammeWorkers } from '@/features/programmes/programmes';
import {
  programmeFailureCode,
  programmeSuccessCode,
  PROGRAMME_FAILURE_COPY,
  PROGRAMME_SUCCESS_COPY,
} from '@/features/programmes/copy';

/**
 * Worker registry — /programmes/{programmeId}/workers
 *
 * ⚠️ THERE IS NO PUBLIC VERSION OF THIS PAGE AND NO ROUTE THAT COULD BECOME ONE. It requires a session, it requires
 * a role on the programme, every read returns pseudonyms unless a consent covers the caller, and no function behind
 * it is granted to an anonymous request. The brief forbids public worker registries by default; the platform's way
 * of forbidding something is not to build a switch for it.
 */
export const metadata: Metadata = {
  title: 'Worker registry',
  description: 'The programme’s pool of verified workers.',
  robots: { index: false, follow: false },
};

export default async function ProgrammeWorkersPage({
  params,
  searchParams,
}: {
  params: Promise<{ programmeId: string }>;
  searchParams: Promise<{ failed?: string; saved?: string }>;
}) {
  const [{ programmeId }, query] = await Promise.all([params, searchParams]);
  const read = await getProgrammeWorkers(programmeId);
  if (read.available && !read.allowed) notFound();

  if (!read.available) {
    return <ProgrammeUnavailable what="The worker registry" />;
  }

  const failure = programmeFailureCode(query.failed);
  const success = programmeSuccessCode(query.saved);
  const now = new Date();

  return (
    <div className="grid gap-6">
      <header>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Worker registry</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
          The programme&rsquo;s verified pool. Every worker is listed by a pseudonym that is unique to this
          programme, so the same person enrolled in two programmes cannot be recognised across them.
        </p>
      </header>

      {failure ? <ProgrammeNotice tone="warning">{PROGRAMME_FAILURE_COPY[failure]}</ProgrammeNotice> : null}
      {success ? <ProgrammeNotice tone="success">{PROGRAMME_SUCCESS_COPY[success]}</ProgrammeNotice> : null}

      <WorkerRegistryBody read={read} programmeId={programmeId} now={now} />
    </div>
  );
}
