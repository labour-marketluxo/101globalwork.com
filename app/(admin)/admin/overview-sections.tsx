import Link from 'next/link';
import { IncidentCard } from '@/components/admin/AdminSections';
import type { IncidentFeed } from '@/features/admin/incidents';
import type { ReasonCode } from '@/features/admin/copy';

/**
 * The overview's two incident groups.
 *
 * ⚠️ OUTSTANDING AND CLEAR ARE SEPARATED, NOT SORTED. "Nothing outstanding" and "the check did not run" are
 * different facts, and a single list that happens to be empty cannot tell an operator which one they are
 * looking at. The clear group is rendered compactly for the same reason it is rendered at all: it is
 * evidence that the platform looked.
 */
export function IncidentFeedList({
  feed,
  now,
  reasons,
  canAcknowledge,
  filters,
}: {
  feed: IncidentFeed;
  now: Date;
  reasons: ReasonCode[];
  canAcknowledge: boolean;
  filters: { market?: string; window?: string; severity?: string };
}) {
  const outstanding = feed.items.filter(item => item.count > 0);
  const clear = feed.items.filter(item => item.count === 0);

  return (
    <>
      <section className="admin-section" aria-labelledby="outstanding-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="outstanding-heading">Needs attention</h2>
            <p>
              Derived from the records that already carry the exception — nothing here is a threshold somebody
              configured separately from the queue it counts.
            </p>
          </div>
          <span>{outstanding.length} of {feed.items.length} checks firing</span>
        </div>

        {outstanding.length === 0 ? (
          <p className="empty-admin">
            Nothing is firing in the last {feed.windowHours} hour{feed.windowHours === 1 ? '' : 's'} for this
            filter. The checks themselves still ran — they are listed below.
          </p>
        ) : (
          <div className="admin-incident-grid">
            {outstanding.map(item => (
              <IncidentCard
                key={item.key}
                item={item}
                now={now}
                reasons={reasons}
                canAcknowledge={canAcknowledge}
                filters={filters}
              />
            ))}
          </div>
        )}
      </section>

      <section className="admin-section" aria-labelledby="clear-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="clear-heading">Checks reporting clear</h2>
            <p>Zero in this window is a result, not an absence — these are the queues the platform watches.</p>
          </div>
        </div>
        <div className="admin-list">
          {clear.map(item => (
            <article key={item.key}>
              <div>
                <strong>{item.title}</strong>
                <span>
                  {item.area} · measured on {item.windowBasis}
                  {item.marketScoped ? '' : ' · not narrowed by the market filter'}
                </span>
              </div>
              <Link className="text-button" href={item.deepLink}>
                {item.actionLabel}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
