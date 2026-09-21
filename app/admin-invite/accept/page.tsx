import { permanentRedirect, redirect } from 'next/navigation';

/**
 * /admin-invite/accept?token=… — retired, redirected.
 *
 * This was the link inside the invitation email, and it may still be the link in invitations sitting in
 * inboxes right now, so it has to keep working. It now hands over to /invitations/{token}, which is the
 * canonical surface and does everything this page did — plus the things it could not: showing who
 * invited you, what the role can do, when it expires, whether you are signed in as the right person, and
 * a way to decline.
 *
 * ⚠️ THE REDIRECT ALSO CLOSES A LEAK. This page used to render whatever arrived in `?error=`, and the
 * action beside it built that parameter from `error.message` — the provider's own text, reflected into a
 * user-editable part of the URL and printed inside the page. It is now a code from a fixed vocabulary
 * (see features/invitations/invitation.ts), which is why nothing here forwards an error string.
 *
 * 308, not 307: the mapping is a rename with no runtime resolution behind it. The token travels as a
 * PATH segment rather than a query parameter, where it is less likely to be logged as part of a
 * parameter dump and cannot be rewritten by a second `?token=` appearing later in the URL.
 */
export default async function LegacyAdminInviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // Without a token there is nothing to redirect to; the platform has no invitation index to fall back
  // on, so the honest destination is the front page rather than an invitation page for an empty string.
  if (!token) redirect('/');
  permanentRedirect(`/invitations/${encodeURIComponent(token)}`);
}
