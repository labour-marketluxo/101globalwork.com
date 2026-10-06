'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleAlert, CircleCheck, Info, Lock, ShieldCheck } from '@/components/ui/icons';
import { CARD } from '@/components/discovery/tokens';
import { PROGRAMME_TABS } from '@/features/programmes/paths';
import { cellReasonText, privacySentence, type PrivacyCell, type PrivacyRate, type PrivacySummary } from '@/features/programmes/privacy';
import { ROLE_COPY } from '@/features/programmes/copy';

/**
 * This module is a client component because of the tab bar (it reads the pathname) and nothing else. Everything
 * else here — the notices, the cell renderers, the privacy panel — is server-safe markup that is imported by
 * server components; being in a `'use client'` file means it can also be rendered inside the tab bar's tree.
 */

export function ProgrammeTabs({ programmeId }: { programmeId: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Programme sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max items-center gap-1 border-b border-solid border-slate-200">
        {PROGRAMME_TABS.map((tab) => {
          const href = tab.href(programmeId);
          const isCurrent = pathname === href;
          return (
            <li key={tab.key}>
              <Link
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={`-mb-px inline-flex items-center border-b-2 border-solid px-3.5 py-2.5 text-sm font-semibold no-underline transition-colors ${
                  isCurrent
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ProgrammeNotice({ tone, children }: { tone: 'success' | 'warning' | 'info'; children: React.ReactNode }) {
  const Icon = tone === 'success' ? CircleCheck : tone === 'warning' ? CircleAlert : Info;
  return (
    <div
      role={tone === 'warning' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border border-solid p-4 text-sm leading-relaxed ${
        tone === 'success'
          ? 'border-primary-subtle bg-primary-surface text-slate-700'
          : tone === 'warning'
            ? 'border-secondary bg-secondary-light text-amber-900'
            : 'border-slate-200 bg-white text-slate-600'
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          tone === 'success' ? 'text-primary' : tone === 'warning' ? 'text-amber-800' : 'text-slate-400'
        }`}
      />
      <div>{children}</div>
    </div>
  );
}

export function ProgrammeUnavailable({ what }: { what: string }) {
  return (
    <ProgrammeNotice tone="warning">
      <p className="font-semibold">{what} could not be read.</p>
      <p className="mt-1">
        Nothing has been changed and no figures are shown, because a page that rendered zeros would be reporting an
        outage as an empty programme. Reload to try again.
      </p>
    </ProgrammeNotice>
  );
}

export function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  const copy = ROLE_COPY[role] ?? { label: role, explains: '' };
  return (
    <span
      title={copy.explains}
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-slate-600 uppercase"
    >
      <ShieldCheck aria-hidden="true" className="h-3 w-3" />
      {copy.label}
    </span>
  );
}

/**
 * One published figure.
 *
 * ⚠️ THERE IS NO PATH THROUGH THIS COMPONENT THAT PRINTS A NUMBER FOR A WITHHELD CELL. It takes the whole cell,
 * and the suppressed branch returns before `value` is read — so a page cannot accidentally render the thing the
 * database refused to publish, even if a future parser hands it a cell with a value in it.
 *
 * A published value keeps its `~`: the reader is being told it moved, not that it is arithmetic.
 */
export function CellValue({ cell, suffix }: { cell: PrivacyCell; suffix?: string }) {
  if (cell.suppressed) {
    return (
      <span
        title={cellReasonText(cell)}
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-slate-500 uppercase"
      >
        <Lock aria-hidden="true" className="h-3 w-3" />
        Withheld
      </span>
    );
  }

  return (
    <span
      title={`Noised count. ${cell.epsilon ? `Laplace mechanism, epsilon ${cell.epsilon}.` : ''} This number is deliberately approximate.`}
      className="font-mono text-sm font-bold tracking-tight text-slate-900"
    >
      ~{cell.value}
      {suffix ? <span className="ml-0.5 text-xs font-normal text-slate-500">{suffix}</span> : null}
    </span>
  );
}

export function RateValue({ rate }: { rate: PrivacyRate }) {
  if (rate.suppressed) {
    const reason = rate.numerator.suppressed ? rate.numerator : rate.denominator;
    return (
      <span
        title={cellReasonText({ ...reason, reason: 'component_below_threshold' })}
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-slate-500 uppercase"
      >
        <Lock aria-hidden="true" className="h-3 w-3" />
        Withheld
      </span>
    );
  }

  return (
    <span
      title={`Computed from two noised counts: ${rate.numerator.value} of ${rate.denominator.value}. The percentage is approximate.`}
      className="font-mono text-sm font-bold tracking-tight text-slate-900"
    >
      ~{rate.percent}%
    </span>
  );
}

/**
 * The parameters, and how much of the budget this page spent.
 *
 * ⚠️ IT REPORTS THE COMPOSITION RATHER THAN IMPLYING A SINGLE GUARANTEE. Each published figure is one Laplace
 * draw; the count and the total epsilon are shown so the cost of reading the page is visible. Withheld figures
 * spend nothing because no mechanism ran for them — they are a threshold rule, not a private mechanism, and the
 * panel says so rather than folding the two protections into one comforting number.
 */
export function PrivacyPanel({ privacy }: { privacy: PrivacySummary }) {
  return (
    <section aria-labelledby="privacy-heading" className={`${CARD} p-5`}>
      <h2 id="privacy-heading" className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
        <Lock aria-hidden="true" className="h-4 w-4 text-primary" />
        How these figures are protected
      </h2>

      <dl className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Minimum group
          </dt>
          <dd className="mt-0.5 font-mono text-sm font-bold text-slate-900">{privacy.minGroupSize}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">Epsilon</dt>
          <dd className="mt-0.5 font-mono text-sm font-bold text-slate-900">{privacy.epsilon}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Figures published
          </dt>
          <dd className="mt-0.5 font-mono text-sm font-bold text-slate-900">{privacy.cellsPublished}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase">Withheld</dt>
          <dd className="mt-0.5 font-mono text-sm font-bold text-slate-900">{privacy.cellsWithheld}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-slate-600">{privacySentence(privacy)}</p>
      {privacy.notice ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{privacy.notice}</p> : null}
      {privacy.limitation ? (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>{privacy.limitation}</span>
        </p>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Each published figure is one Laplace draw at the epsilon above, so this page spent about{' '}
        {privacy.epsilonSpent} epsilon. A withheld figure spent nothing: withholding is a threshold rule, not a
        private mechanism, and it protects a different thing — that a small group was reported at all.
      </p>
    </section>
  );
}
