import type { Metadata } from 'next';
import { PAGE_SHELL } from '@/components/discovery/tokens';

export const metadata: Metadata = {
  title: 'New organisation',
  description: 'Set up a business entity on 101GlobalWork.',
  robots: { index: false, follow: false },
};

const STEPS = [
  { number: '1', label: 'Identity', href: '#step-1' },
  { number: '2', label: 'Locations & currency', href: '#step-2' },
  { number: '3', label: 'Policies & contacts', href: '#step-3' },
  { number: '4', label: 'Plan', href: '#step-4' },
] as const;

export default function NewOrganisationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={PAGE_SHELL}>
      <header className="overflow-hidden rounded-[20px] border border-amber-500/20 bg-[#0D282E] px-6 py-8 text-white sm:px-8 sm:py-10">
        <div className="max-w-3xl">
          <p className="font-sans text-[11px] font-bold tracking-[0.16em] text-amber-300 uppercase">New organisation</p>
          <h1 className="mt-3 max-w-2xl text-2xl leading-tight font-extrabold tracking-tight text-white sm:text-3xl">
            Set up a business entity
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
            Four steps, in any order. Nothing is created until you press Create, and Save Draft keeps what you have
            typed so you can come back to it.
          </p>
        </div>

        <div className="-mx-1 mt-8 overflow-x-auto px-1 pb-1">
          <ol className="grid min-w-[580px] grid-cols-4">
            {STEPS.map((step, index) => {
              const active = index === 0;
              return (
                <li key={step.href} className="relative flex min-w-[140px] flex-col items-center text-center">
                  {index > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-[18px] left-0 h-px w-1/2 bg-amber-500/20"
                    />
                  ) : null}
                  {index < STEPS.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={`absolute top-[18px] right-0 h-px w-1/2 ${index === 0 ? 'bg-amber-500/55' : 'bg-amber-500/20'}`}
                    />
                  ) : null}
                  <a
                    href={step.href}
                    className="group relative z-10 flex flex-col items-center gap-2 no-underline"
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full border font-sans text-xs font-bold transition-colors ${
                        active
                          ? 'border-amber-400 bg-amber-500 text-slate-950'
                          : 'border-amber-500/25 bg-[#0D282E] text-slate-300 group-hover:border-amber-400/50 group-hover:text-amber-200'
                      }`}
                    >
                      {step.number}
                    </span>
                    <span
                      className={`max-w-[128px] text-[11px] leading-tight font-semibold transition-colors ${
                        active ? 'text-white' : 'text-slate-400 group-hover:text-white'
                      }`}
                    >
                      {step.label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      </header>
      {children}
    </div>
  );
}
