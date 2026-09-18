/**
 * Pricing domain types.
 *
 * `Money` is minor units plus a currency code, never a float: these values are
 * published next to real quotes, and a rounded percentage is the kind of error
 * that ends up on an invoice. Formatting happens at the edge (see the /pricing
 * page), not here.
 */

export type Money = {
  /** Minor units — kobo, cents. Integer by construction. */
  amountMinor: number;
  /** ISO 4217, e.g. 'NGN'. */
  currency: string;
};

export type FeeRate = {
  /** Percentage of the agreed quote, e.g. 5 for 5%. Null = no percentage part. */
  percent: number | null;
  /** Fixed amount charged per job, in minor units. Null = no flat part. */
  flatMinor: number | null;
  /** What the fee is charged on, in words, for the published table. */
  basis: string;
};

export type FeeExample = {
  label: string;
  quote: Money;
};

export type FeePolicy = {
  /** False until a schedule is agreed. /pricing publishes no numbers while false. */
  published: boolean;
  /** ISO date the rates take effect. Required by the PRD once published. */
  effectiveFrom: string | null;
  /** ISO date the schedule was last checked. Drives the staleness notice. */
  reviewedAt: string | null;
  customer: FeeRate | null;
  provider: FeeRate | null;
  examples: FeeExample[];
  notes: string[];
};
