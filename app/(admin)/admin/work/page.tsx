import { redirect } from 'next/navigation';

/**
 * /admin/work now redirects to /admin/projects.
 *
 * ⚠️ WHY THE PATH MOVED. "Work" was a landing page with three counts and a list of recent requests. The console
 * that replaced it is an exception directory with a per-project diagnostics screen, and the brief names both
 * under projects. The old path is kept as a redirect so the incident feed's deep links, the overview's cards
 * and anything an operator has saved keep working.
 */
export default function RetiredWorkPage() {
  redirect('/admin/projects');
}
