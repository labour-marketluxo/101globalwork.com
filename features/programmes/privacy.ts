/**
 * The privacy primitives, as the pages see them.
 *
 * PURE MODULE, deliberately: the tab bar and the cell renderer may both end up in a client bundle if a future
 * control needs state, and a module that imported the Supabase server client could not cross that boundary.
 *
 * ⚠️ A CELL IS NEVER A NUMBER. `PrivacyCell.value` is null whenever the cell is suppressed, and the component
 * that renders one takes the whole cell rather than a `number | null` — so there is no way for a page to print a
 * figure for a group the server refused to report. That is a type-level version of the disclosure rule.
 */

export type PrivacyCell = {
  suppressed: boolean;
  /** Null when suppressed. Never zero-instead-of-withheld. */
  value: number | null;
  reason: 'below_threshold' | 'no_data' | 'component_below_threshold' | null;
  epsilon: number | null;
};

export type PrivacyRate = {
  suppressed: boolean;
  percent: number | null;
  numerator: PrivacyCell;
  denominator: PrivacyCell;
  reason: string | null;
};

export type PrivacySummary = {
  minGroupSize: number;
  epsilon: number;
  roundingUnit: number;
  cellsPublished: number;
  cellsWithheld: number;
  epsilonSpent: number;
  notice?: string;
  limitation?: string;
};

export const EMPTY_CELL: PrivacyCell = { suppressed: true, value: null, reason: 'no_data', epsilon: null };

/** Text for a withheld cell. It says the platform is not saying, not that the number is zero. */
export const WITHHELD_LABEL = 'Withheld';

export function cellReasonText(cell: PrivacyCell): string {
  if (!cell.suppressed) return '';
  if (cell.reason === 'component_below_threshold') {
    return 'Withheld: one of the two figures this rate is built from was below the minimum group size.';
  }
  if (cell.reason === 'no_data') return 'Nothing recorded for this group yet.';
  return 'Withheld: the group is smaller than the minimum size, and the platform does not say how small.';
}

/**
 * How the numbers are described in one sentence.
 *
 * The rounding and the floor are part of the promise, so they are stated rather than left as implementation
 * detail: a reader who does not know the figures are rounded will compare two of them and conclude something
 * happened.
 */
export function privacySentence(summary: PrivacySummary): string {
  return `Every figure about people below is a noised count over a group of at least ${summary.minGroupSize}, rounded to the nearest ${summary.roundingUnit}. A withheld figure was below the threshold. The figures will not add up to each other — that is the point.`;
}
