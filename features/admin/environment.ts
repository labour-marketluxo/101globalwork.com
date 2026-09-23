/**
 * Which environment the administrator is looking at.
 *
 * ⚠️ THE PLATFORM HAS NO ENVIRONMENT LABEL VARIABLE, SO THIS DERIVES WHAT IT CAN AND ADMITS THE REST.
 * There is no `NEXT_PUBLIC_ENVIRONMENT` in this project's configuration, and inventing one that only
 * this badge reads would be a label nobody else sets. What is real: Next tells the server whether this
 * is a development or production build, the host reports the deployment kind on the hosting platform,
 * and the Supabase project behind the page is identifiable from the public URL it is configured with.
 * Those three together are what an operator actually needs — "am I about to suspend somebody in
 * production or in the copy of it".
 *
 * ⚠️ IT IS A LABEL, NOT A SAFETY INTERLOCK. Nothing branches on this: it exists so a human notices. A
 * guard that disabled actions in one environment would be a guard that eventually gets disabled instead.
 */

export type AdminEnvironment = {
  /** 'Production', 'Preview', 'Development' or 'Unlabelled'. */
  label: string;
  tone: 'production' | 'preview' | 'development' | 'unknown';
  /** The Supabase project this deployment talks to, or null when it cannot be read. */
  dataStore: string | null;
  /** Whether Paystack execution is in test or live mode, or null when it cannot be determined. */
  payments: string | null;
};

function supabaseProject(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    // The connection string the platform uses is https://<project-ref>.supabase.co.
    const [projectRef] = host.split('.');
    return projectRef && projectRef.length > 0 ? projectRef : host;
  } catch {
    return null;
  }
}

export function describeAdminEnvironment(payments: string | null): AdminEnvironment {
  const vercel = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;

  let label = 'Unlabelled';
  let tone: AdminEnvironment['tone'] = 'unknown';
  if (vercel === 'production' || (!vercel && nodeEnv === 'production')) {
    label = 'Production';
    tone = 'production';
  } else if (vercel === 'preview') {
    label = 'Preview';
    tone = 'preview';
  } else if (vercel === 'development' || nodeEnv === 'development') {
    label = 'Development';
    tone = 'development';
  }

  return { label, tone, dataStore: supabaseProject(), payments };
}
