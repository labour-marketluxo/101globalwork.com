import { ServiceRegistry } from '@/components/admin/TaxonomySections';
import { ACCESS_NOTE } from '@/components/admin/trust-copy';
import { getAdminContext } from '@/features/admin/context';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { getServiceTaxonomy } from '@/features/admin/taxonomy';

export const metadata = { title: 'Service taxonomy', robots: { index: false, follow: false } };

/**
 * /admin/taxonomy/services — the canonical registry.
 *
 * ⚠️ THE CANONICAL ID IS THE IDENTITY, AND EVERY CONTROL ON THIS PAGE CARRIES IT. Display names and canonical keys
 * are shown because people need them; neither is ever used to look a service up. A rename changes a label, and a
 * merge moves the rows that pointed at the loser onto the winner — the ids themselves are history and stay.
 */
export default async function ServiceTaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; saved?: string; failed?: string; step_up?: string; merged?: string; deprecated?: string }>;
}) {
  const query = await searchParams;
  const [context, taxonomy, reasons] = await Promise.all([
    getAdminContext(),
    getServiceTaxonomy({ search: query.q, status: query.status }),
    getReasonCodes(),
  ]);

  const canRead = Boolean(context?.has('platform.taxonomy.read') || context?.has('platform.taxonomy.manage') || context?.has('platform.admin.manage'));
  const canManage = Boolean(context?.has('platform.taxonomy.manage') || context?.has('platform.admin.manage'));

  if (!canRead) {
    return (
      <div className="admin-page">
        <section className="admin-section admin-panel" role="alert">
          <h1>Not available to your role</h1>
          <p>{ACCESS_NOTE}</p>
        </section>
      </div>
    );
  }

  return (
    <ServiceRegistry
      taxonomy={taxonomy}
      reasons={reasons.taxonomy_change}
      canManage={canManage}
      stepUpPending={query.step_up === '1'}
      query={query}
    />
  );
}
