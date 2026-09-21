import { permanentRedirect, redirect } from 'next/navigation';

/**
 * /admin/invitations/accept?token=… — retired, redirected.
 *
 * The second copy of the acceptance page: the same form, different wording, aimed at somebody already
 * inside the administrative workspace who is taking on another role. Two pages doing one job is how the
 * two drift, so this one now defers to /invitations/{token} as well.
 *
 * NOTE ON REACHABILITY: this path sits under the (admin) layout, which requires an administrative
 * context, so a recipient who is not yet an administrator never sees this page — the layout bounces
 * them first. That is unchanged by the redirect, and it is why the emailed link points at
 * /admin-invite/accept rather than here.
 */
export default async function LegacyAdminInvitationsAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect('/admin');
  permanentRedirect(`/invitations/${encodeURIComponent(token)}`);
}
