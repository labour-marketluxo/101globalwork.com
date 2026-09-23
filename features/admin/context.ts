import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Who is looking at the administrator workspace, and what their capabilities cover.
 *
 * ⚠️ ONE ROUND TRIP PER REQUEST, SHARED BY THE SHELL AND EVERY PAGE UNDER IT. `admin_context_command` is
 * the only source of truth for capabilities, and a page that guessed them from the navigation would
 * eventually render a control the command refuses. React's `cache` makes the second caller free.
 *
 * ⚠️ `can` IS A PREFIX TEST, WHICH IS HOW CAPABILITIES ARE NAMED HERE: 'platform.support' covers
 * 'platform.support.read' and 'platform.support.intervene'. It is a UI convenience only — every write
 * re-derives the capability in the database, so a page that drew a button it should not have drawn
 * still cannot perform the action.
 *
 * ⚠️ PREFIX FOR NAVIGATION, `has` FOR CONTROLS. The two are not interchangeable: 'platform.admin'
 * matches 'platform.admin.view_audit' as well as 'platform.admin.manage', so an auditor would be shown
 * every administrator control if the prefix form were used to decide what to render. `has` compares the
 * whole capability, which is what a button that performs a write needs.
 */

export type AdminContext = {
  accountId: string;
  isOwner: boolean;
  roles: { key: string; name: string }[];
  capabilities: string[];
  can: (prefix: string) => boolean;
  has: (capability: string) => boolean;
};

type Raw = Record<string, unknown>;

export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('admin_context_command');
  if (!data || typeof data !== 'object') return null;

  const raw = data as Raw;
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.filter((value): value is string => typeof value === 'string')
    : [];
  const isOwner = raw.is_owner === true;
  const accountId = typeof raw.account_id === 'string' ? raw.account_id : '';

  return {
    accountId,
    isOwner,
    roles: Array.isArray(raw.roles)
      ? raw.roles
          .filter((role): role is Raw => Boolean(role) && typeof role === 'object')
          .map(role => ({
            key: typeof role.key === 'string' ? role.key : '',
            name: typeof role.name === 'string' ? role.name : 'Administrator',
          }))
      : [],
    capabilities,
    can: (prefix: string) => isOwner || capabilities.some(capability => capability === prefix || capability.startsWith(`${prefix}.`)),
    has: (capability: string) => isOwner || capabilities.includes(capability),
  };
});
