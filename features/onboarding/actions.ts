'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Record the journey the visitor chose, then send them into it.
 *
 * WHY IT IS STORED ON THE ACCOUNT rather than acted on and forgotten: the choice is an intent, and the
 * platform already records one at sign-up (`signup_intent`, written by signUpAction). Someone who
 * changes their mind on this page should change that record, not leave two answers disagreeing about
 * which journey they are on.
 *
 * IT GRANTS NOTHING. This metadata is a hint for routing and copy; capability is decided in the
 * database, per account, after verification. Nothing reachable from a sign-up form can confer it —
 * which is exactly why the provider path here is a redirect to `/provider/onboarding` rather than a
 * switch that makes the account a provider.
 *
 * The provider journey is an existing flow: /provider/onboarding collects services, service area and
 * verification. The customer journey is the workspace at /work. Choosing "organisation" is not
 * possible, because multi-user accounts do not exist in this schema — see the page.
 */
export async function chooseJourneyAction(formData: FormData) {
  const journey = formData.get('journey') === 'provider' ? 'provider' : 'customer';

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent('/onboarding')}`);

  // Spread the existing metadata explicitly: `updateUser({ data })` writes the object it is given, and
  // passing only the intent would drop the display name captured at sign-up.
  await supabase.auth.updateUser({
    data: { ...(user.user_metadata ?? {}), signup_intent: journey },
  });

  redirect(journey === 'provider' ? '/provider/onboarding' : '/work');
}
