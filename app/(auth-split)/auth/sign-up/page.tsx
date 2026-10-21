import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PasswordField, SubmitButton } from '@/components/auth/AuthFormFields';
import {
  AUTH_LINK,
  AuthDivider,
  AuthField,
  AuthInput,
  AuthNotice,
  AuthShell,
  ConsentField,
  SocialAuth,
} from '@/components/auth/AuthSections';
import { signUpAction } from '@/features/auth/actions';
import {
  AUTH_PATHS,
  authErrorCode,
  authErrorMessage,
  hrefWith,
  postAuthTarget,
} from '@/features/auth/post-auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { IS_MOCK_MODE } from '@/lib/supabase/mock';

/**
 * Create an account — /auth/sign-up
 *
 * ONE IDENTITY ROOT, TWO JOURNEYS. The account created here is the same record either way: a
 * person can hire work on Monday and offer a trade later without a second account, which is why
 * the role choice is an intent and not a fork in the sign-up. The visible "what brings you here?"
 * chooser was removed at the brief's request; the intent still arrives as a `?intent=` hint from
 * the pages that link here and rides through a hidden field, so a provider-intent visitor is not
 * silently turned into a customer one. What it changes is the destination after sign-up and the
 * journey the workspace starts the visitor on.
 *
 * THE OLD TRUST POINTS ARE GONE. Three fact-checked bullets — verification before quoting,
 * itemized quotes, payment on approval — used to sit under the card. The brief asked the card to
 * carry only the form, so they were removed rather than redesigned. The claims themselves still
 * live where they are made properly: provider profiles and /trust-and-safety for verification,
 * the request flow and /{market}/guides for itemized quotes, and /how-it-works for the
 * release-on-approval sequence. Nothing here invents a review score, a completion count, a price
 * range or a response time.
 *
 * ⚠️ PASSWORDS: the rule is 10 characters, and that number appears in three places that must agree —
 * `minLength` on the field, the strength meter's threshold, and the check in signUpAction. The meter
 * says "long enough" and never "strong"; the reasoning is in AuthFormFields.tsx.
 *
 * PII IS NOT PUT IN THE URL. A sign-up that needs email confirmation sends the visitor to
 * /auth/verify with a flag and no address: query strings land in access logs, proxy logs and
 * referrer headers, and an email address is personal data. The resend form asks for it instead.
 *
 * THE CONSENT CHECKBOX IS VERIFIED SERVER-SIDE as well as by the browser, and it links to the two
 * policy pages. An account cannot be created without it, which is the point of asking. The line
 * that used to explain, under the checkbox, that the documents are drafted but not yet in force
 * was removed at the brief's request.
 */

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create one 101GlobalWork account to request work or to offer your services.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  error?: string;
  next?: string;
  redirect?: string;
  intent?: string;
}>;

export default async function AuthSignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const destination = postAuthTarget(params, '');
  const intent = params.intent === 'provider' ? 'provider' : 'customer';
  const code = authErrorCode(params.error);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  // MOCK MODE: keep the form reachable even though the dummy user is always present.
  if (!IS_MOCK_MODE && user && destination) redirect(destination);

  return (
    <AuthShell
      insideCard
      eyebrow="Create an account"
      title="Create your account"
      notice={
        code ? (
          <AuthNotice tone="error">
            {authErrorMessage(code)}
            {code === 'account_exists' ? (
              <>
                {' '}
                <Link href={hrefWith(AUTH_PATHS.signIn, { redirect: destination })} className={AUTH_LINK}>
                  Sign in
                </Link>{' '}
                or{' '}
                <Link href={AUTH_PATHS.recovery} className={AUTH_LINK}>
                  recover your password
                </Link>
                .
              </>
            ) : null}
            {code === 'unconfirmed' ? (
              <>
                {' '}
                <Link href={AUTH_PATHS.verify} className={AUTH_LINK}>
                  Send a new confirmation link
                </Link>
                .
              </>
            ) : null}
          </AuthNotice>
        ) : null
      }
    >
      <SocialAuth destination={destination || '/'} />

      <AuthDivider label="or use your email" />

      <form action={signUpAction} className="grid gap-4">
        <input type="hidden" name="next" value={destination} />

        {/* The chooser is gone from the card, but the intent hint the visitor arrived with still
            has to reach signUpAction — without it, a provider-intent link would create a
            customer-intent account. */}
        <input type="hidden" name="intent" value={intent} />

        <AuthField id="display_name" label="Full name">
          <AuthInput
            id="display_name"
            name="display_name"
            required
            minLength={2}
            autoComplete="name"
          />
        </AuthField>

        <AuthField id="signup-email" label="Email">
          <AuthInput
            id="signup-email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </AuthField>

        <PasswordField
          id="signup-password"
          name="password"
          label="Password"
          autoComplete="new-password"
          minLength={10}
          meter
        />

        <ConsentField />

        <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
      </form>

      {/* The account switch sits directly under the primary action, inside the card, so the next
          step is part of the form's flow rather than a footer below it. It replaces both the
          header's "Already registered?" pill and the shell's footer slot on this page. */}
      <p className="mt-4 pt-2 text-center font-sans text-sm text-slate-600">
        Already have an account?{' '}
        <Link
          href={hrefWith(AUTH_PATHS.signIn, { redirect: destination })}
          className="font-semibold text-amber-600 underline underline-offset-4 transition-colors hover:text-amber-700"
        >
          Sign in
        </Link>
        .
      </p>
    </AuthShell>
  );
}
