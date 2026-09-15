/**
 * Shared, cross-domain types.
 *
 * Placeholder for the centralised type layer. Domain types live in the sibling
 * modules (auth.ts, discovery.ts, payments.ts, provider.ts, requests.ts).
 *
 * Context: the app currently declares most types inline at their usage sites
 * (e.g. `type RequestRow`, `type RosterItem` inside route files). Those are
 * consolidated here in a later phase — nothing imports this module yet.
 */
export {};
