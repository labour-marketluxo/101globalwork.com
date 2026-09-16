import InteractivePhotoCards from '@/components/marketing/InteractivePhotoCards';
import SearchWizard from '@/components/marketing/SearchWizard';

/**
 * Landing page — Service Search Gateway.
 *
 * Everything above the fold: headline, the two-stage SearchWizard, and the
 * quick-select photo cards. Deliberately a SERVER component — the interactive
 * pieces are client components of their own (SearchWizard), and the photo cards
 * need no JavaScript at all (CSS hover + Link).
 *
 * HEADER: not rendered here. The site header comes from app/layout.tsx via
 * MainNav/AuthNav, so adding one to this page would double it. See the report
 * for what that means for the "support link" in the brief.
 *
 * The previous composition (PRD 7.1 — hero, action chips, categories, trust
 * banner, recent work) lived here. Those sections still exist, untouched, in
 * components/marketing/HomeSections.tsx so this direction can be reverted in
 * one commit rather than being lost.
 */
export default function HomePage() {
  return (
    // The brief specified `bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]`.
    // That is a Tailwind v3 recipe and renders NOTHING in v4: the `from-*` /
    // `via-*` / `to-*` utilities build `--tw-gradient-stops` out of a var()
    // chain that includes `--tw-gradient-position`, which only a
    // `bg-linear-*`/`bg-gradient-*` utility sets. With the arbitrary
    // radial-gradient there is no such utility, so `--tw-gradient-stops`
    // resolves empty and the whole background-image is invalid — verified as
    // `background-image: none`, not as a wrong-looking gradient.
    //
    // `bg-radial-[at_top]` is the v4-native form; it sets the position itself
    // and the same from/via/to tokens then compose correctly.
    <div className="min-h-screen bg-radial-[at_top] from-slate-100 via-slate-50 to-white">
      <section className="mx-auto w-full max-w-6xl px-6 pt-16 pb-20 text-center sm:pt-24">
        <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
          101GlobalWork
        </p>

        <h1 className="mx-auto mt-4 max-w-3xl text-5xl font-black tracking-tight text-slate-900">
          Find On-Demand Experts Near You
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-600">
          Tell us where and what you need. Compare verified providers, agree an itemized quote, and
          release payment only once the work is approved.
        </p>

        {/* Interactive gateway — stage 1 location, stage 2 service.
            Width is owned by the wizard's own card shell (max-w-2xl mx-auto),
            so it is not constrained twice here. */}
        <div className="mt-8 text-left">
          <SearchWizard />
        </div>

        <InteractivePhotoCards className="mt-12 text-left" />
      </section>
    </div>
  );
}
