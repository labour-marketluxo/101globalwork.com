import Link from 'next/link';
import { ArrowRight, History } from '@/components/ui/icons';
import ReasonCodeControl from '@/components/admin/ReasonCodeControl';
import type { ReasonCode } from '@/features/admin/copy';
import {
  createServiceAction,
  deprecateServiceAction,
  mergeServicesAction,
  updateServiceDefinitionAction,
  configureMarketAction,
  setMarketActiveAction,
} from '@/features/admin/taxonomy-actions';
import { readBoolean, readNumber, readObject, readRows, readText } from '@/features/admin/taxonomy';

/**
 * The taxonomy and market consoles.
 *
 * ⚠️ EVERY FORM CARRIES THE CANONICAL ID, NEVER A NAME. The lists show names because people read them; the hidden
 * fields and the links carry `service_id` / `market_id`, which is the invariant the brief asks for expressed as
 * markup rather than as a convention somebody could forget.
 */

const CREDENTIAL_TYPES = [
  { value: 'licence', label: 'Licence' },
  { value: 'certification', label: 'Certification' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'trade_registration', label: 'Trade registration' },
];

/**
 * The setting keys the brief names, so a market's timezone, address rules, tax adapter and payment routes are shown
 * as themselves rather than as a bare list of keys.
 *
 * ⚠️ THESE ARE PREFIXES, NOT A CLOSED VOCABULARY. The schema accepts any well-formed key at market scope, which is
 * what lets a market carry configuration nobody anticipated; the panel names the four the brief asks for and shows
 * everything else under "other settings" rather than pretending it is not there.
 */
const ADAPTER_PREFIXES = ['locale.', 'timezone', 'calendar', 'address.', 'address_rules', 'tax.', 'tax_adapter', 'payments.', 'payment_routes', 'paystack'];

function settingKey(setting: Record<string, unknown>): string {
  return readText(setting.key) ?? '';
}

function matchesAdapter(setting: Record<string, unknown>): boolean {
  const key = settingKey(setting);
  return ADAPTER_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix));
}

/** Render one setting value, which may be a string, a number, a boolean or a nested object. */
function describeSettingValue(value: unknown): string {
  if (value === null || value === undefined) return 'not set';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function marketSetting(settings: Record<string, unknown>[], prefixes: string[]): string | null {
  const match = settings.find(setting => {
    const key = settingKey(setting);
    return prefixes.some(prefix => key === prefix || key.startsWith(prefix));
  });
  if (!match) return null;
  return `${settingKey(match)} = ${describeSettingValue(match.value)}`;
}

function isNamedAdapter(settings: Record<string, unknown>[], setting: Record<string, unknown>): boolean {
  void settings;
  return matchesAdapter(setting);
}

export function ServiceRegistry({
  taxonomy,
  reasons,
  canManage,
  stepUpPending,
  query,
}: {
  taxonomy: { allowed: boolean; unavailable: boolean; data: Record<string, unknown> };
  reasons: ReasonCode[];
  canManage: boolean;
  stepUpPending: boolean;
  query: { q?: string; status?: string; saved?: string; failed?: string; merged?: string; deprecated?: string };
}) {
  const services = readRows(taxonomy.data.services);
  const counts = readObject(taxonomy.data.counts);
  const disabledReason = stepUpPending ? 'Confirm it is you on this session first.' : 'Your role cannot change the taxonomy.';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Taxonomy · services</p>
          <h1>Canonical service registry.</h1>
          <p>
            One entry per service the platform knows how to sell, with its localized names, search synonyms and the
            credentials it requires. The canonical id is the identity — names and keys are labels, and neither is
            ever used to look a service up.
          </p>
        </div>
        <div className="admin-row-actions">
          <Link className="secondary-button" href="/admin/taxonomy/discovery">Discovery graph</Link>
          <Link className="secondary-button" href="/admin/markets">Markets</Link>
        </div>
      </header>

      <section className="admin-stat-grid" aria-label="Registry state">
        <article><span>Services</span><strong>{readNumber(counts.total) ?? 0}</strong><small>{readNumber(counts.active) ?? 0} active · {readNumber(counts.deprecated) ?? 0} retired</small></article>
        <article><span>With credential rules</span><strong>{readNumber(counts.with_credential_rules) ?? 0}</strong><small>Rules the platform can enforce</small></article>
        <article><span>Missing a primary name</span><strong>{readNumber(counts.without_primary_name) ?? 0}</strong><small>A service nobody can read is a service nobody can choose</small></article>
        <article><span>Shown</span><strong>{services.length}</strong><small>Filtered list below</small></article>
      </section>

      {query.failed ? <p className="notice" role="alert"><strong>That did not save.</strong><br /></p> : null}
      {query.saved ? <p className="notice" role="status">Saved. The change is in the audit stream with your reason and note.</p> : null}
      {query.merged ? <p className="notice" role="status">Merge complete. The rows that pointed at the retired service now point at the survivor, and the retired one records where it went.</p> : null}
      {query.deprecated ? <p className="notice" role="status">Service retired. Nothing that points at it was deleted — it simply cannot be chosen again.</p> : null}

      <form method="get" action="/admin/taxonomy/services" className="admin-filters">
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={query.q ?? ''} placeholder="key, name or synonym" className="admin-field" />
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={query.status ?? ''} className="admin-field">
            <option value="">Every service</option>
            <option value="active">Active</option>
            <option value="deprecated">Retired</option>
          </select>
        </div>
        <button type="submit" className="secondary-button">Filter services</button>
        {query.q || query.status ? <Link className="text-button" href="/admin/taxonomy/services">Clear</Link> : null}
      </form>

      {!taxonomy.allowed ? (
        <p className="empty-admin">
          {taxonomy.unavailable ? 'The registry could not be read. Nothing has changed — reload to try again.' : 'Your role cannot read the taxonomy.'}
        </p>
      ) : services.length === 0 ? (
        <p className="empty-admin">No service matches that filter.</p>
      ) : (
        services.map(service => {
          const id = readText(service.id) ?? '';
          const active = readBoolean(service.is_active);
          const names = readRows(service.names);
          const synonyms = readRows(service.synonyms);
          const rules = readRows(service.credential_rules);
          return (
            <article key={id} className="admin-incident">
              <div className="admin-incident-head">
                <div>
                  <div className="admin-incident-meta">
                    <span className="admin-severity" data-severity={active ? 'low' : 'high'}>{active ? 'Active' : 'Retired'}</span>
                    <span>key {readText(service.canonical_key)}</span>
                    <span>risk level {readNumber(service.risk_level) ?? 0}/5</span>
                    {readBoolean(service.merged) ? <span className="admin-severity" data-severity="high">Merged into another service</span> : null}
                  </div>
                  <h3>{names.length > 0 ? readText(names[0].display_name) : 'No name recorded'}</h3>
                </div>
                <div className="admin-incident-count">
                  <span className="admin-incident-meta">{readNumber(service.provider_count) ?? 0} provider(s)</span>
                  <span className="admin-incident-meta">{readNumber(service.request_count) ?? 0} request(s)</span>
                </div>
              </div>

              <div className="admin-incident-meta">
                <span>
                  Names: {names.length === 0
                    ? 'none'
                    : names.map(name => `${readText(name.display_name)} (${readText(name.language_code)})`).join(' · ')}
                </span>
                <span>
                  Synonyms: {synonyms.length === 0 ? 'none recorded' : synonyms.map(synonym => readText(synonym.phrase)).join(', ')}
                </span>
                <span>
                  Credentials required: {rules.length === 0
                    ? 'none recorded'
                    : rules.map(rule => `${readText(rule.credential_type)}${readBoolean(rule.is_mandatory) ? ' (mandatory)' : ' (optional)'}`).join(', ')}
                </span>
                <span>Canonical id {id}</span>
              </div>

              {canManage && active ? (
                <div className="admin-row-actions">
                  <form action={updateServiceDefinitionAction}>
                    <input type="hidden" name="service_id" value={id} />
                    <input type="hidden" name="next" value="/admin/taxonomy/services" />
                    <ReasonCodeControl
                      triggerLabel="Edit service definition"
                      triggerClassName="admin-trigger-quiet"
                      title={`Edit ${readText(names[0]?.display_name) ?? readText(service.canonical_key)}`}
                      description="Changes the name for one language, the synonyms and the credential rules. The canonical id and key are not editable — they are what everything else points at."
                      confirmLabel="Save the definition"
                      confirmClassName="admin-confirm-amber"
                      reasons={reasons}
                      noteLabel="Why this change"
                      tone="standard"
                      disabled={stepUpPending}
                      disabledReason={disabledReason}
                      extraFields={
                        <>
                          <label className="admin-field-label" htmlFor={`name-${id}`}>Display name</label>
                          <input id={`name-${id}`} name="display_name" required minLength={2} maxLength={160} defaultValue={readText(names[0]?.display_name) ?? ''} className="admin-field" />
                          <label className="admin-field-label" htmlFor={`lang-${id}`}>Language</label>
                          <input id={`lang-${id}`} name="language_code" defaultValue={readText(names[0]?.language_code) ?? 'en'} maxLength={10} className="admin-field" />
                          <label className="admin-field-label" htmlFor={`syn-${id}`}>Synonyms (comma separated)</label>
                          <input id={`syn-${id}`} name="synonyms" defaultValue={synonyms.map(synonym => readText(synonym.phrase) ?? '').join(', ')} className="admin-field" />
                          <label className="admin-field-label" htmlFor={`rules-${id}`}>Mandatory credentials</label>
                          <select id={`rules-${id}`} name="credential_type" multiple size={4} className="admin-field">
                            {CREDENTIAL_TYPES.map(type => (
                              <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                          </select>
                        </>
                      }
                    />
                  </form>

                  <form action={deprecateServiceAction}>
                    <input type="hidden" name="service_id" value={id} />
                    <input type="hidden" name="next" value="/admin/taxonomy/services" />
                    <ReasonCodeControl
                      triggerLabel="Retire service"
                      triggerClassName="admin-trigger-danger"
                      title={`Retire ${readText(names[0]?.display_name) ?? readText(service.canonical_key)}`}
                      description="Refused while open work points at this service, because retiring it would strand that work. Merge it into a live service instead."
                      confirmLabel="Retire the service"
                      confirmClassName="admin-confirm-danger"
                      reasons={reasons}
                      noteLabel="Why it is being retired"
                      disabled={stepUpPending}
                      disabledReason={disabledReason}
                    />
                  </form>
                </div>
              ) : null}
            </article>
          );
        })
      )}

      {canManage ? (
        <section className="admin-section admin-panel" aria-labelledby="create-service-heading">
          <div className="admin-section-heading">
            <div>
              <h2 id="create-service-heading">Create a service, or merge two</h2>
              <p>
                A key is chosen once and never changes. A merge moves every provider link, request, route, credential
                rule and template from the service being retired onto the survivor, and reports what it moved.
              </p>
            </div>
          </div>
          <form action={createServiceAction} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="next" value="/admin/taxonomy/services" />
            <div>
              <label className="admin-field-label" htmlFor="canonical_key">Canonical key</label>
              <input id="canonical_key" name="canonical_key" required pattern="[a-z][a-z0-9_]{3,60}" placeholder="e.g. plumbing_residential" className="admin-field" />
            </div>
            <div>
              <label className="admin-field-label" htmlFor="display_name">Display name</label>
              <input id="display_name" name="display_name" required minLength={2} maxLength={160} className="admin-field" />
            </div>
            <div>
              <label className="admin-field-label" htmlFor="language_code">Language</label>
              <input id="language_code" name="language_code" defaultValue="en" maxLength={10} className="admin-field" />
            </div>
            <div className="sm:col-span-2">
              <label className="admin-field-label" htmlFor="create-note">Why this service exists</label>
              <input id="create-note" name="note" required minLength={10} maxLength={2000} className="admin-field" />
            </div>
            <div>
              <label className="admin-field-label" htmlFor="create-reason">Reason code</label>
              <select id="create-reason" name="reason_code" required defaultValue="" className="admin-field">
                <option value="" disabled>Choose a reason</option>
                {reasons.map(reason => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="admin-confirm-amber">Create service</button>
            </div>
          </form>

          <form action={mergeServicesAction} className="mt-4 grid gap-3 border-t border-solid border-slate-200 pt-4 sm:grid-cols-2">
            <input type="hidden" name="next" value="/admin/taxonomy/services" />
            <div>
              <label className="admin-field-label" htmlFor="source_id">Retire this service</label>
              <select id="source_id" name="source_id" required defaultValue="" className="admin-field">
                <option value="" disabled>Choose the service to retire</option>
                {services.filter(service => readBoolean(service.is_active)).map(service => (
                  <option key={readText(service.id) ?? ''} value={readText(service.id) ?? ''}>
                    {readText(readRows(service.names)[0]?.display_name) ?? readText(service.canonical_key)} · {readText(service.canonical_key)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="admin-field-label" htmlFor="target_id">Into this service</label>
              <select id="target_id" name="target_id" required defaultValue="" className="admin-field">
                <option value="" disabled>Choose the surviving service</option>
                {services.filter(service => readBoolean(service.is_active)).map(service => (
                  <option key={readText(service.id) ?? ''} value={readText(service.id) ?? ''}>
                    {readText(readRows(service.names)[0]?.display_name) ?? readText(service.canonical_key)} · {readText(service.canonical_key)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="admin-field-label" htmlFor="merge-note">Why they are the same thing</label>
              <input id="merge-note" name="note" required minLength={10} maxLength={2000} className="admin-field" />
            </div>
            <div>
              <label className="admin-field-label" htmlFor="merge-reason">Reason code</label>
              <select id="merge-reason" name="reason_code" required defaultValue="" className="admin-field">
                <option value="" disabled>Choose a reason</option>
                {reasons.map(reason => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={stepUpPending} className="admin-confirm-danger">Merge via migration</button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

export function MarketDirectory({
  markets,
  resolution,
  reasons,
  canManage,
  query,
}: {
  markets: { allowed: boolean; unavailable: boolean; data: Record<string, unknown> };
  resolution: { allowed: boolean; unavailable: boolean; data: Record<string, unknown> } | null;
  reasons: ReasonCode[];
  canManage: boolean;
  query: { setting?: string; market?: string; saved?: string; failed?: string; changed?: string };
}) {
  const list = readRows(markets.data.markets);
  const counts = readObject(markets.data.counts);
  const disabledReason = 'Your role cannot change a market.';

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Markets</p>
          <h1>Global adapter configuration.</h1>
          <p>
            Language, currency, regions and the settings rows that make a market behave differently — address rules,
            tax adapters and payment routes are configuration, not schema.
          </p>
        </div>
        <div className="admin-row-actions">
          <Link className="secondary-button" href="/admin/taxonomy/services">Service taxonomy</Link>
          <Link className="secondary-button" href="/admin/discovery">Discovery &amp; SEO</Link>
        </div>
      </header>

      <section className="admin-stat-grid" aria-label="Market state">
        <article><span>Markets</span><strong>{readNumber(counts.markets) ?? 0}</strong><small>{readNumber(counts.active) ?? 0} active</small></article>
        <article><span>Settings rows</span><strong>{readNumber(counts.settings_rows) ?? 0}</strong><small>{readNumber(counts.global_settings) ?? 0} at global scope</small></article>
        <article><span>Precedence</span><strong>5</strong><small>Global → market → region → organisation → project</small></article>
        <article><span>Project scope</span><strong>0</strong><small>No per-project store exists yet</small></article>
      </section>

      {query.saved ? <p className="notice" role="status">Market saved. New settings rows are in force immediately for anything that resolves through the chain.</p> : null}
      {query.changed ? <p className="notice" role="status">Market state changed, with your reason in the audit stream.</p> : null}

      <form method="get" action="/admin/markets" className="admin-filters">
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="setting">Preview a setting</label>
          <input id="setting" name="setting" defaultValue={query.setting ?? ''} placeholder="e.g. address.postcode_required" className="admin-field" />
        </div>
        <div className="admin-field-group">
          <label className="admin-field-label" htmlFor="market">In market</label>
          <select id="market" name="market" defaultValue={query.market ?? ''} className="admin-field">
            <option value="">No market context</option>
            {list.map(market => (
              <option key={readText(market.id) ?? ''} value={readText(market.id) ?? ''}>{readText(market.display_name) ?? readText(market.code)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="secondary-button">Preview inheritance chain</button>
      </form>

      {resolution ? (
        <section className="admin-section admin-panel" aria-labelledby="resolution-heading">
          <div className="admin-section-heading">
            <div>
              <h2 id="resolution-heading">
                How {readText(resolution.data.setting_key) ?? 'that setting'} resolves
              </h2>
              <p>
                {readText(resolution.data.winner_scope)
                  ? `The value in force comes from the ${readText(resolution.data.winner_scope)} scope.`
                  : 'Nothing sets this key at any scope, so a reader gets no value at all.'}
              </p>
            </div>
            <span className="admin-quick-note"><History aria-hidden="true" className="h-3.5 w-3.5" />Chain</span>
          </div>
          <div className="admin-list">
            {readRows(resolution.data.chain).map((step, index) => {
              const value = step.value;
              const scope = readText(step.scope) ?? 'scope';
              const isWinner = scope === readText(resolution.data.winner_scope);
              return (
                <article key={`${scope}-${index}`}>
                  <div>
                    <strong>{scope}{isWinner ? ' — in force' : ''}</strong>
                    <span>
                      {value === null || value === undefined
                        ? 'not set'
                        : typeof value === 'string' ? value : JSON.stringify(value)}
                    </span>
                    <span>{readText(step.note) ?? ''}</span>
                  </div>
                  {isWinner ? <small>Wins</small> : <small>Shadowed</small>}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {!markets.allowed ? (
        <p className="empty-admin">
          {markets.unavailable ? 'Markets could not be read. Nothing has changed — reload to try again.' : 'Your role cannot read markets.'}
        </p>
      ) : (
        list.map(market => {
          const id = readText(market.id) ?? '';
          const active = readBoolean(market.is_active);
          const regions = readRows(market.regions);
          const settings = readRows(market.settings);
          return (
            <article key={id} className="admin-incident">
              <div className="admin-incident-head">
                <div>
                  <div className="admin-incident-meta">
                    <span className="admin-severity" data-severity={active ? 'low' : 'high'}>{active ? 'Active' : 'Inactive'}</span>
                    <span>{readText(market.code)}</span>
                    <span>{readText(market.default_language_code)} · {readText(market.default_currency_code)}</span>
                  </div>
                  <h3>{readText(market.display_name) ?? readText(market.code)}</h3>
                </div>
                <div className="admin-incident-count">
                  <span className="admin-incident-meta">{readNumber(market.active_providers) ?? 0} active provider(s)</span>
                  <span className="admin-incident-meta">{readNumber(market.requests) ?? 0} request(s)</span>
                </div>
              </div>

              <div className="admin-incident-meta">
                <span>
                  Regions: {regions.length === 0 ? 'none recorded' : regions.map(region => readText(region.name) ?? readText(region.canonical_code)).join(', ')}
                </span>
                <span>
                  {settings.length === 0
                    ? 'No market-specific settings: this market behaves exactly like the global defaults.'
                    : `${settings.length} market-specific setting(s) in force — shown below.`}
                </span>
                <span>Market id {id}</span>
              </div>

              {/* The four adapter categories the brief names, each read from the settings rows rather than a column:
                  a market's timezone, address rules, tax adapter and payment routes are configuration, which is what
                  lets a new market launch without a migration. Anything set that does not fall into one of them stays
                  visible underneath rather than being silently dropped. */}
              <dl className="admin-facts">
                <div>
                  <dt>Timezone and calendar</dt>
                  <dd>{marketSetting(settings, ['locale.timezone', 'timezone', 'calendar']) ?? 'Not set — the application default applies'}</dd>
                </div>
                <div>
                  <dt>Address rules</dt>
                  <dd>{marketSetting(settings, ['address.', 'address_rules']) ?? 'Not set — addresses are free text plus a country code'}</dd>
                </div>
                <div>
                  <dt>Tax adapter</dt>
                  <dd>{marketSetting(settings, ['tax.', 'tax_adapter']) ?? 'No tax adapter configured for this market'}</dd>
                </div>
                <div>
                  <dt>Payment processor routes</dt>
                  <dd>{marketSetting(settings, ['payments.', 'payment_routes', 'paystack']) ?? 'No market-specific payment route: the platform default adapter is used'}</dd>
                </div>
                {settings.filter(setting => !isNamedAdapter(settings, setting)).length > 0 ? (
                  <div>
                    <dt>Other settings</dt>
                    <dd>
                      {settings
                        .filter(setting => !isNamedAdapter(settings, setting))
                        .map(setting => `${readText(setting.key)} = ${describeSettingValue(setting.value)}`)
                        .join(' · ')}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {canManage ? (
                <div className="admin-row-actions">
                  <form action={configureMarketAction}>
                    <input type="hidden" name="market_id" value={id} />
                    <input type="hidden" name="next" value="/admin/markets" />
                    <ReasonCodeControl
                      triggerLabel="Configure market"
                      triggerClassName="admin-trigger-quiet"
                      title={`Configure ${readText(market.display_name) ?? readText(market.code)}`}
                      description="Language, currency and display name are core columns; anything else — address rules, tax adapters, payment routes — is a settings row, so a new rule never needs a migration."
                      confirmLabel="Save the market"
                      confirmClassName="admin-confirm-amber"
                      reasons={reasons}
                      noteLabel="Why this change"
                      tone="standard"
                      disabled={false}
                      disabledReason={disabledReason}
                      extraFields={
                        <>
                          <label className="admin-field-label" htmlFor={`display-${id}`}>Display name</label>
                          <input id={`display-${id}`} name="display_name" defaultValue={readText(market.display_name) ?? ''} maxLength={120} className="admin-field" />
                          <label className="admin-field-label" htmlFor={`lang-${id}`}>Default language</label>
                          <input id={`lang-${id}`} name="default_language_code" defaultValue={readText(market.default_language_code) ?? 'en'} maxLength={10} className="admin-field" />
                          <label className="admin-field-label" htmlFor={`currency-${id}`}>Default currency</label>
                          <input id={`currency-${id}`} name="default_currency_code" defaultValue={readText(market.default_currency_code) ?? 'NGN'} maxLength={3} className="admin-field" />
                          <label className="admin-field-label" htmlFor={`key-${id}`}>Setting key (optional)</label>
                          <input id={`key-${id}`} name="setting_key" placeholder="e.g. address.postcode_required" className="admin-field" />
                          <label className="admin-field-label" htmlFor={`value-${id}`}>Setting value</label>
                          <input id={`value-${id}`} name="setting_value" className="admin-field" />
                        </>
                      }
                    />
                  </form>

                  <form action={setMarketActiveAction}>
                    <input type="hidden" name="market_id" value={id} />
                    <input type="hidden" name="next" value="/admin/markets" />
                    <input type="hidden" name="active" value={active ? 'false' : 'true'} />
                    <ReasonCodeControl
                      triggerLabel={active ? 'Deactivate market' : 'Activate market'}
                      triggerClassName={active ? 'admin-trigger-danger' : 'admin-confirm-amber'}
                      title={active ? 'Deactivate this market' : 'Activate this market'}
                      description={
                        active
                          ? 'Refused while requests are still open in this market: deactivating stops new work, it does not cancel anybody’s job.'
                          : 'New work can be commissioned in this market again. Providers and existing projects are untouched.'
                      }
                      confirmLabel={active ? 'Deactivate' : 'Activate'}
                      confirmClassName={active ? 'admin-confirm-danger' : 'admin-confirm-amber'}
                      reasons={reasons}
                      noteLabel="Why"
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

      <p className="admin-incident-meta">
        <span>
          The chain is resolved in order — global, market, region, organisation, then project — and the preview above
          shows every level, including the ones it shadowed.{' '}
          <Link className="text-button" href="/admin/taxonomy/discovery">
            Discovery graph <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </span>
      </p>
    </div>
  );
}
