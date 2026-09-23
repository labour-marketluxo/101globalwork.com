import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import { ACCESS_NOTE } from '@/components/admin/trust-copy';
import { getAdminContext } from '@/features/admin/context';
import { getReasonCodes } from '@/features/admin/reason-codes';
import { getDiscoveryGraph, readBoolean, readNumber, readObject, readRows, readText, testIntentMapping } from '@/features/admin/taxonomy';
import {
  createTemplateVersionAction,
  deprecateTemplateAction,
  publishTemplateVersionAction,
} from '@/features/admin/taxonomy-actions';

export const metadata = { title: 'Discovery graph and templates', robots: { index: false, follow: false } };

/**
 * /admin/taxonomy/discovery — problems, outcomes and request templates.
 *
 * ⚠️ A PUBLISHED VERSION IS IMMUTABLE, SO ADAPTING MEANS COPYING FORWARD. Creating a version always writes a draft,
 * and the version already published stays live until somebody publishes the new one — which is the brief's
 * "retrieve and adapt before generating" expressed as the only thing the database will accept.
 *
 * ⚠️ "TEST INTENT MAPPING" IS A PHRASE MATCH AND THE PAGE SAYS SO. There is no learned model; the answer names
 * whether a name or a synonym matched, and returns nothing when neither does rather than guessing.
 */
export default async function DiscoveryTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; service?: string; saved?: string; failed?: string; published?: string; deprecated?: string; step_up?: string }>;
}) {
  const query = await searchParams;
  const [context, graph, reasons, test] = await Promise.all([
    getAdminContext(),
    getDiscoveryGraph(query.service),
    getReasonCodes(),
    query.q ? testIntentMapping(query.q) : Promise.resolve(null),
  ]);

  const canRead = Boolean(context?.has('platform.taxonomy.read') || context?.has('platform.taxonomy.manage') || context?.has('platform.seo.read') || context?.has('platform.admin.manage'));
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

  const templates = readRows(graph.data.templates);
  const counts = readObject(graph.data.counts);
  const services = readRows(graph.data.services);
  const intents = readRows(graph.data.intents);
  const disabledReason = 'Your role cannot change templates.';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Taxonomy · discovery</p>
          <h1>Intent graph and templates.</h1>
          <p>
            The problems and outcomes the platform recognises, and the validated request template recorded for each
            service. Adapting a template creates the next version; the published one stays live until you publish it.
          </p>
        </div>
        <div className="admin-row-actions">
          <Link className="secondary-button" href="/admin/taxonomy/services">Service registry</Link>
          <Link className="secondary-button" href="/admin/markets">Markets</Link>
        </div>
      </header>

      <section className="admin-stat-grid" aria-label="Template state">
        <article><span>Templates</span><strong>{readNumber(counts.templates) ?? 0}</strong><small>{readNumber(counts.active) ?? 0} active</small></article>
        <article><span>Without a published version</span><strong>{readNumber(counts.without_published_version) ?? 0}</strong><small>Nothing live for this intent</small></article>
        <article><span>Draft versions</span><strong>{readNumber(counts.draft_versions) ?? 0}</strong><small>Written but not live</small></article>
        <article><span>Intent entities</span><strong>{intents.length}</strong><small>Problems and outcomes</small></article>
      </section>

      {query.saved ? <p className="notice" role="status">Draft version saved. It is not live until it is published.</p> : null}
      {query.published ? <p className="notice" role="status">Version published. Any previously published version for this template is now marked deprecated, so there is exactly one live answer per intent.</p> : null}
      {query.deprecated ? <p className="notice" role="status">Template retired. Every version stays readable — customers simply stop being offered it.</p> : null}
      {query.failed ? <p className="notice" role="alert"><strong>That did not save.</strong></p> : null}

      <form method="get" action="/admin/taxonomy/discovery" className="admin-filters">
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="q">Test a phrase</label>
          <input id="q" name="q" type="search" defaultValue={query.q ?? ''} placeholder="e.g. dripping tap" className="admin-field" />
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="service">Filter templates by service</label>
          <select id="service" name="service" defaultValue={query.service ?? ''} className="admin-field">
            <option value="">Every service</option>
            {services.map(service => (
              <option key={readText(service.id) ?? ''} value={readText(service.id) ?? ''}>{readText(service.name) ?? readText(service.canonical_key)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="secondary-button">Test intent mapping</button>
        {query.q || query.service ? <Link className="text-button" href="/admin/taxonomy/discovery">Clear</Link> : null}
      </form>

      {test ? (
        <section className="admin-section admin-panel" aria-labelledby="intent-heading">
          <div className="admin-section-heading">
            <div>
              <h2 id="intent-heading">What “{readText(test.data.phrase) ?? query.q}” matches</h2>
              <p>{readText(test.data.strategy)}</p>
            </div>
            <span>{readRows(test.data.matches).length} match(es)</span>
          </div>
          {readRows(test.data.matches).length === 0 ? (
            <p className="empty-admin">Nothing matched. That is the honest answer — the platform will not guess a service from a phrase it does not recognise.</p>
          ) : (
            <div className="admin-list">
              {readRows(test.data.matches).map(match => (
                <article key={readText(match.service_id) ?? ''}>
                  <div>
                    <strong>{readText(match.service_name)} · {readText(match.matched_on)}</strong>
                    <span>
                      {readBoolean(match.is_active) ? 'Active' : 'Retired'} · key {readText(match.canonical_key)}
                    </span>
                    <span>
                      Templates: {readRows(match.templates).length === 0
                        ? 'none'
                        : readRows(match.templates)
                            .map(template => `${readText(template.problem_name) ?? 'any problem'} → ${readText(template.outcome_name) ?? 'any outcome'}${readText(template.published_version) ? ` (v${readText(template.published_version)})` : ' (no published version)'}`)
                            .join('; ')}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="admin-section" aria-labelledby="templates-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="templates-heading">Templates</h2>
            <p>One per service and intent pair, each with its version history.</p>
          </div>
          <span>{templates.length}</span>
        </div>
        {!graph.allowed ? (
          <p className="empty-admin">{graph.unavailable ? 'The graph could not be read. Nothing has changed.' : 'Your role cannot read the graph.'}</p>
        ) : templates.length === 0 ? (
          <p className="empty-admin">No template exists yet. Create the first version for a service and intent pair below.</p>
        ) : (
          templates.map(template => {
            const templateId = readText(template.template_id) ?? '';
            const published = readObject(template.published_version);
            const versions = readRows(template.versions);
            const drafts = versions.filter(version => readText(version.status) === 'draft');
            return (
              <article key={templateId} className="admin-incident">
                <div className="admin-incident-head">
                  <div>
                    <div className="admin-incident-meta">
                      <span className="admin-severity" data-severity={readText(template.status) === 'active' ? 'low' : 'high'}>{readText(template.status)}</span>
                      <span>{readText(template.service_name)} · {readText(template.service_key)}</span>
                    </div>
                    <h3>
                      {readText(template.problem_name) ?? 'Any problem'} → {readText(template.outcome_name) ?? 'any outcome'}
                    </h3>
                  </div>
                  <div className="admin-incident-count">
                    <span className="admin-incident-meta">
                      {published.version ? `Published v${readText(published.version)}` : 'Nothing published'}
                    </span>
                    <span className="admin-incident-meta">{versions.length} version(s)</span>
                  </div>
                </div>

                {published.fields ? (
                  <p className="admin-incident-meta">
                    <span>
                      Live fields: {readRows(published.fields).map(field => readText(field.label)).join(' · ')}
                    </span>
                  </p>
                ) : null}

                <details className="identity-details">
                  <summary>Version history</summary>
                  <div className="admin-list">
                    {versions.map(version => (
                      <article key={readText(version.id) ?? ''}>
                        <div>
                          <strong>v{readText(version.version)} · {readText(version.status)}</strong>
                          <span>{readText(version.notes) ?? 'no notes'}</span>
                          <span>{readRows(version.fields).map(field => readText(field.label)).join(' · ')}</span>
                        </div>
                        <small>{readText(version.published_at) ? `Published ${new Date(String(version.published_at)).toLocaleString('en-GB')}` : 'Not published'}</small>
                      </article>
                    ))}
                  </div>
                </details>

                {canManage && readText(template.status) === 'active' ? (
                  <div className="admin-row-actions">
                    {drafts.length > 0 ? (
                      drafts.map(draft => (
                        <form key={readText(draft.id) ?? ''} action={publishTemplateVersionAction}>
                          <input type="hidden" name="version_id" value={readText(draft.id) ?? ''} />
                          <input type="hidden" name="next" value="/admin/taxonomy/discovery" />
                          <ReasonCodeControl
                            triggerLabel={`Publish v${readText(draft.version)}`}
                            triggerClassName="admin-confirm-amber"
                            title="Publish this template version"
                            description="The version currently published becomes deprecated in the same transaction, so there is exactly one live answer for this intent pair."
                            confirmLabel="Publish it"
                            confirmClassName="admin-confirm-amber"
                            reasons={reasons.taxonomy_change}
                            noteLabel="Why this version is the right one"
                            tone="standard"
                            disabled={!canManage}
                            disabledReason={disabledReason}
                          />
                        </form>
                      ))
                    ) : null}
                    <form action={deprecateTemplateAction}>
                      <input type="hidden" name="template_id" value={templateId} />
                      <input type="hidden" name="next" value="/admin/taxonomy/discovery" />
                      <ReasonCodeControl
                        triggerLabel="Retire template"
                        triggerClassName="admin-trigger-danger"
                        title="Retire this template"
                        description="Customers stop being offered it and its published version is marked deprecated. Every version stays readable, so the wording somebody once answered is still on file."
                        confirmLabel="Retire it"
                        confirmClassName="admin-confirm-danger"
                        reasons={reasons.taxonomy_change}
                        noteLabel="Why it is being retired"
                        disabled={!canManage}
                        disabledReason={disabledReason}
                      />
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      {canManage ? (
        <section className="admin-section admin-panel" aria-labelledby="version-heading">
          <div className="admin-section-heading">
            <div>
              <h2 id="version-heading">Create the next template version</h2>
              <p>
                This writes a draft: paste the fields a request should ask for, one per line. Nothing reaches a
                customer until a version is published.
              </p>
            </div>
          </div>
          <form action={createTemplateVersionAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="next" value="/admin/taxonomy/discovery" />
            <div>
              <label className="admin-field-label" htmlFor="tpl-service">Service</label>
              <select id="tpl-service" name="service_id" required defaultValue="" className="admin-field">
                <option value="" disabled>Choose a service</option>
                {services.map(service => (
                  <option key={readText(service.id) ?? ''} value={readText(service.id) ?? ''}>{readText(service.name) ?? readText(service.canonical_key)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="admin-field-label" htmlFor="tpl-problem">Problem (optional)</label>
              <select id="tpl-problem" name="problem_id" defaultValue="" className="admin-field">
                <option value="">Any problem</option>
                {intents.filter(intent => readText(intent.kind) === 'problem').map(intent => (
                  <option key={readText(intent.id) ?? ''} value={readText(intent.id) ?? ''}>{readText(intent.name)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="admin-field-label" htmlFor="tpl-outcome">Outcome (optional)</label>
              <select id="tpl-outcome" name="outcome_id" defaultValue="" className="admin-field">
                <option value="">Any outcome</option>
                {intents.filter(intent => readText(intent.kind) === 'outcome').map(intent => (
                  <option key={readText(intent.id) ?? ''} value={readText(intent.id) ?? ''}>{readText(intent.name)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="admin-field-label" htmlFor="tpl-reason">Reason code</label>
              <select id="tpl-reason" name="reason_code" required defaultValue="" className="admin-field">
                <option value="" disabled>Choose a reason</option>
                {reasons.taxonomy_change.map(reason => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="admin-field-label" htmlFor="tpl-fields">Fields the request should ask for (one per line)</label>
              <textarea id="tpl-fields" name="fields" required rows={5} className="admin-field" />
            </div>
            <div className="sm:col-span-2">
              <label className="admin-field-label" htmlFor="tpl-notes">Notes for the next reviewer</label>
              <input id="tpl-notes" name="notes" maxLength={2000} className="admin-field" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="admin-confirm-amber">Create draft version</button>
            </div>
          </form>
        </section>
      ) : null}

      <p className="admin-incident-meta">
        <span>
          The service ids on this page are the canonical identity — a template points at a service id, never at a
          display name.{' '}
          <Link className="text-button" href="/admin/taxonomy/services">
            Service registry <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </span>
      </p>
    </div>
  );
}
