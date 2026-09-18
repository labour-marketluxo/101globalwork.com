import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * AuthNav — the header's right-hand action group, rendered per session state.
 *
 * Two actions, deliberately unequal:
 *
 *   Sign In          outlined in amber — transparent fill, 1.5px amber hairline,
 *                    amber label. It matches the primary's geometry exactly
 *                    (`rounded-lg px-4 py-2.5 text-sm`) so the pair reads as one
 *                    control group, and it FILLS amber on hover.
 *   Post a Request   solid amber, bold, trailing arrow, brighter on hover and
 *                    pressing it scales slightly (`active:scale-95`). The one
 *                    filled control in the bar, which is what makes it the
 *                    obvious next step.
 *
 * Amber is reserved for actions and status in this design, so the CTA being the
 * only filled amber element in the chrome is the intent rather than a coincidence.
 *
 * CONTRAST NOTE: white on the amber fill (the Sign In hover, and the primary CTA
 * at rest) measures ~2.2:1 and ~3.2:1 — both under AA for 14px text. That is the
 * design's own pairing, reproduced here rather than quietly altered, because
 * changing it would change the brand colour of every primary action. Dark teal on
 * the amber fill (~5.8:1) is the fix if you ever want it to pass. The outlined
 * state is fine on its own: amber-500 on the deep teal bar is ~5.8:1.
 *
 * ROUTES. Signed out, BOTH of these target /sign-in, per the navbar spec. Note
 * the trade-off: /sign-up?intent=customer&next=%2Frequests%2Fnew — the URL this
 * CTA used before — carries the intent and the destination through the auth
 * flow, so a new customer lands on the request form rather than back on the
 * homepage. /sign-in also drops the `next` parameter, because the sign-in page
 * does not accept one. Signed in, the CTA targets /requests/new directly, since
 * sending a signed-in user to /sign-in would be a dead end.
 *
 * Every anchor carries `no-underline` explicitly: preflight is deliberately not
 * imported in this project, so there is no global `a { text-decoration: none }`
 * and a bare <a> renders browser-default blue and underlined.
 *
 * Responsive order of disappearance: section links (MainNav, <lg, where the
 * drawer takes over), then here — Account (<md), provider link (<lg), Sign In
 * (<sm, it is in the drawer instead). The CTA never collapses, so the bar is
 * always actionable and always one row.
 */

const LINK =
  'no-underline text-[14px] font-medium text-slate-200 transition-colors hover:text-white';

/**
 * Secondary CTA. Geometry is deliberately identical to CTA below — same radius,
 * same padding, same text size — so the two line up as one control group. Its
 * 1.5px border is why the primary below carries a TRANSPARENT border of the same
 * width: without it the outlined button renders 3px taller than the filled one
 * (43px vs 40px, measured), and the pair sits visibly crooked in the bar.
 *
 * No `bg-transparent` on it either: the element is already transparent, and
 * declaring it gives the hover fill a competing `background-color` at the same
 * layer, which is the sort of thing that silently decides which one wins.
 */
const GHOST =
  'inline-flex items-center rounded-lg border-[1.5px] border-solid border-amber-500 px-4 py-2.5 text-sm font-semibold text-amber-500 no-underline transition-all duration-200 hover:bg-amber-500 hover:text-white';

/**
 * The primary's hover is a COLOUR change, not `brightness-110`.
 *
 * Two reasons, in order of importance: the design's own hover for this button is
 * a darker amber (`hover:bg-[#b86404]` in code.html), which is `secondary-dark`
 * here, so the colour change is the faithful one; and a colour change is the one
 * hover mechanism that cannot fail quietly in a project without preflight, where
 * composite-effect utilities depend on `--tw-*` custom properties landing
 * correctly (the same family of bug that needed the `--tw-border-style` shim in
 * app/globals.css). If you want the brightness version back, the swap is one
 * class — but verify it in a real browser with a mouse, which is the only place
 * hover state can be checked (see the note in NavLinks.tsx).
 */
const CTA =
  'inline-flex shrink-0 items-center gap-2 rounded-lg border-[1.5px] border-solid border-transparent bg-secondary px-4 py-2.5 font-mono text-sm font-bold text-white no-underline shadow-lg shadow-amber-950/20 transition-all duration-200 hover:bg-secondary-dark active:scale-95 sm:px-5';

export default async function AuthNav() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: account } = await supabase.from('accounts').select('id').eq('auth_user_id', user.id).maybeSingle();
    let hasProvider = false;
    if (account?.id) {
      const { count } = await supabase.from('providers').select('id', { count: 'exact', head: true }).eq('owner_account_id', account.id).neq('status', 'closed');
      hasProvider = Boolean(count);
    }

    return (
      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        <nav aria-label="Account navigation" className="hidden items-center gap-5 sm:flex">
          <Link href="/work" className={LINK}>My work</Link>
          <Link href={hasProvider ? '/provider' : '/providers'} className={`hidden lg:inline-flex ${LINK}`}>
            {hasProvider ? 'Provider workspace' : 'Become a provider'}
          </Link>
          <Link
            href="/account/security"
            title={user.email ?? undefined}
            className={`hidden md:inline-flex ${LINK}`}
          >
            Account
          </Link>
        </nav>
        <Link href="/requests/new" className={CTA}>
          Post a Request
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-3">
      <Link href="/sign-in" className={`hidden sm:inline-flex ${GHOST}`}>
        Sign In
      </Link>
      <Link href="/sign-in" className={CTA}>
        Post a Request
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </div>
  );
}
