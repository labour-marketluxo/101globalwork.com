import { getCustomerBookings } from '@/features/customer/bookings';
import { getProviderContext } from '@/features/provider-workspace/context';
import { getProviderWork } from '@/features/provider-workspace/work';

/**
 * The caller's projects, from whichever side they are on.
 *
 * ⚠️ THE ROUTE HAS NO HOME WORKSPACE, SO THIS IS WHAT MAKES IT REACHABLE. `/app/projects/*` is a destination
 * both parties step into and is deliberately a sibling of `/app/customer/*` and `/app/provider/*` — the same
 * assignment, seen by both. Nothing in either workspace's navigation points at it, so the index behind the
 * "Projects" switcher entry has to answer "which projects do I have" for a customer, for a provider, and for
 * an account that is both.
 *
 * ⚠️ IT IS COMPOSED FROM THE TWO READS THAT ALREADY EXIST, NOT A THIRD ONE. `get_customer_bookings()` returns
 * every assignment where the caller is the customer; `get_my_work_command()` returns every job one provider
 * profile holds. Both authorise inside the database and both project the counterparty's display name, which a
 * plain select cannot: `providers` and `profiles` are readable only by their owner, so a customer cannot read
 * the provider row of their own assignment. A `get_my_projects_command` would be a third projection of the
 * same rows for a page that shows less than either source already returns.
 *
 * ⚠️ EVERY PROVIDER PROFILE IS READ, NOT JUST THE ACTIVE ONE. An account can own more than one
 * (`providers.owner_account_id` is a plain reference) and `getProviderContext()` deliberately picks a single
 * one for the workspace bars — the published business, else the oldest draft. An index that read only that
 * one would hide the other profiles' jobs without saying so, so this asks each of them.
 *
 * ⚠️ THE LABELS ARE SOMEBODY ELSE'S WORDS. `request_label` and `need_text` are both the customer's own
 * description of the job, coalesced to a placeholder in SQL. This module does not write a second fallback.
 */

export type ProjectSide = 'customer' | 'provider';

export type ProjectListRow = {
  assignmentId: string;
  requestId: string;
  /** What the job is, in the words it was asked in. */
  label: string;
  /** Which side of this job the caller is on. The same account can be on both, across different jobs. */
  side: ProjectSide;
  /** The other party's display name, as the job itself already shows it. */
  counterparty: string | null;
  /** `requests.state` — the vocabulary the project's own header renders from. */
  state: string;
  assignmentStatus: string;
  locationName: string | null;
  scheduledStart: string | null;
  /** The zone the time was agreed in, so a row can say it rather than assume the server's. */
  scheduleTimezone: string | null;
};

export type ProjectListRead = { rows: ProjectListRow[]; unavailable: boolean };

/** The request states in which an assignment has stopped moving. */
const CLOSED_STATES = new Set(['completed', 'cancelled']);

/**
 * ⚠️ ONE DEFINITION, TWO READERS. The index sorts on this and the card chooses its badge colour from it, so a
 * project can never be listed as finished while wearing the amber "still moving" chip — which is the kind of
 * disagreement a second copy of the rule would eventually produce.
 */
export const isProjectOpen = (row: Pick<ProjectListRow, 'state' | 'assignmentStatus'>): boolean =>
  row.assignmentStatus === 'active' && !CLOSED_STATES.has(row.state);

/**
 * Open work first, then the soonest appointment, then alphabetically.
 *
 * Not by date alone: most projects have no agreed time yet, and sorting on a null would either bury every new
 * job or float it above the work happening this morning.
 */
function byUrgency(a: ProjectListRow, b: ProjectListRow): number {
  const aOpen = isProjectOpen(a);
  const bOpen = isProjectOpen(b);
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  if (a.scheduledStart !== b.scheduledStart) {
    if (!a.scheduledStart) return 1;
    if (!b.scheduledStart) return -1;
    return a.scheduledStart < b.scheduledStart ? -1 : 1;
  }
  return a.label.localeCompare(b.label);
}

export async function getMyProjects(): Promise<ProjectListRead> {
  const [bookings, context] = await Promise.all([getCustomerBookings(), getProviderContext()]);

  const asCustomer: ProjectListRow[] = bookings.bookings.map(booking => ({
    assignmentId: booking.assignmentId,
    requestId: booking.requestId,
    label: booking.requestLabel,
    side: 'customer',
    counterparty: booking.providerName,
    state: booking.requestState,
    assignmentStatus: booking.assignmentStatus,
    locationName: booking.locationName,
    scheduledStart: booking.scheduledStart,
    scheduleTimezone: booking.scheduleTimezone,
  }));

  const workReads = await Promise.all(
    (context?.providers ?? []).map(provider => getProviderWork(provider.id)),
  );

  const asProvider: ProjectListRow[] = workReads.flatMap(read =>
    read.rows.map(row => ({
      assignmentId: row.assignmentId,
      requestId: row.requestId,
      label: row.needText,
      side: 'provider' as const,
      counterparty: row.customerDisplayName,
      state: row.requestState,
      assignmentStatus: row.assignmentStatus,
      locationName: row.locationName,
      scheduledStart: row.scheduledStart,
      scheduleTimezone: row.scheduleTimezone,
    })),
  );

  /**
   * ⚠️ A GUARD, NOT AN EXPECTED CASE. Bidding on your own request is refused by `submit_quote_authoritatively`,
   * so one account should never be both parties to one assignment. If it ever is, the row it reads as is the
   * one it commissioned — the customer rows are written second, so they win the key.
   */
  const merged = new Map<string, ProjectListRow>();
  for (const row of asProvider) merged.set(row.assignmentId, row);
  for (const row of asCustomer) merged.set(row.assignmentId, row);

  return {
    rows: [...merged.values()].sort(byUrgency),
    unavailable: bookings.unavailable || workReads.some(read => read.unavailable),
  };
}
