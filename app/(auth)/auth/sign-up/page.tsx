import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { PasswordField, SubmitButton } from '@/components/auth/AuthFormFields';
import {
  AUTH_LINK,
  AuthDivider,
  AuthField,
  AuthInput,
  AuthNotice,
  AuthShell,
  ConsentField,
  RoleIntentField,
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

/**
 * Create an account — /auth/sign-up
 *
 * ONE IDENTITY ROOT, TWO JOURNEYS. The account created here is the same record either way: a
 * person can hire work on Monday and offer a trade later without a second account, which is why
 * the role choice is an intent and not a fork in the sign-up. What it changes is the destination
 * after sign-up and the journey the workspace starts the visitor on.
 *
 * WHAT THE TRUST POINTS UNDER THE HEADING MAY SAY — this is the part of the brief most likely to
 * turn into marketing copy, so each of the three is tied to a fact that exists in the codebase:
 *
 *   verification before quoting   the provider path checks identity before a provider can quote
 *                                 (provider profiles and /trust-and-safety say exactly this)
 *   itemized quotes               the request flow collects a scope and quotes are compared line
 *                                 by line against it — the guide at /{market}/guides explains how
 *   payment released on approval  stated on every provider profile and on /how-it-works
 *
 * Nothing here claims a review score, a completion count, a price range or a response time: none
 * of those exist in the database, and a sign-up page is the worst place to start inventing them.
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
 * policy pages — which are honest that they are drafted but not yet in force. An account cannot be
 * created without it, which is the point of asking.
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

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: 'Identity is checked before anyone quotes',
    body: 'Providers are verified before they can price your work, and the checks that run are described on the provider profile rather than implied.',
  },
  {
    icon: Wallet,
    title: 'Quotes are compared line by line',
    body: 'You describe the work once, and every quote is itemized against that same scope — so two numbers can actually be compared.',
  },
  {
    icon: Sparkles,
    title: 'Payment is released when you approve the work',
    body: 'Money is released to the provider after you approve what was done, not when they accept the job.',
  },
];

export default async function AuthSignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const destination = postAuthTarget(params, '');
  const intent = params.intent === 'provider' ? 'provider' : 'customer';
  const code = authErrorCode(params.error);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && destination) redirect(destination);

  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      lede="One account, whichever side of the work you are on. It takes a minute, and nothing is published about you until you choose to publish it."
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
      aside={
        <ul className="grid gap-3">
          {TRUST_POINTS.map((point) => (
            <li key={point.title} className="flex gap-3">
              <point.icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">{point.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{point.body}</span>
              </span>
            </li>
          ))}
        </ul>
      }
      footer={
        <>
          Already have an account?{' '}
          <Link href={hrefWith(AUTH_PATHS.signIn, { redirect: destination })} className={AUTH_LINK}>
            Sign in
          </Link>
          .
        </>
      }
    >
      <SocialAuth destination={destination || '/'} />

      <AuthDivider label="or use your email" />

      <form action={signUpAction} className="grid gap-4">
        <input type="hidden" name="next" value={destination} />

        <RoleIntentField selected={intent} />

        <AuthField id="display_name" label="Full name">
          <AuthInput
            id="display_name"
            name="display_name"
            required
            minLength={2}
            autoComplete="name"
          />
        </AuthField>

        <AuthField
          id="signup-email"
          label="Email"
          hint="This is how you sign in and how the platform reaches you about your requests. Phone sign-up is not enabled yet."
        >
          <AuthInput
            id="signup-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-describedby="signup-email-hint"
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
    </AuthShell>
  );
}
