-- The public system status behind the strip on /help.
--
-- ── THIS IS A PUBLICATION BOUNDARY, NOT A VIEW ────────────────────────────────────────────────
--
-- `platform_incidents` is an operator's table. A single row carries, alongside the words a visitor may
-- read: `runbook_reference` (the internal playbook, which names systems and escalation paths),
-- `lead_account_id`, `acknowledged_by_account_id`, `created_by_account_id` (who at the platform is
-- handling it), `trust_case_id` and `money_case_id` (links into cases the platform may not have told
-- anybody about yet), and `resolution` (written for the record, not for publication).
--
-- So the function below BUILDS THE PUBLIC SHAPE FIELD BY FIELD. It does not select the row and delete
-- keys from it, because a denylist ships every column somebody adds later — the mistake
-- 20260922101000_session_projection_allowlist.sql already records making once. What is absent from this
-- file is not published, whatever the table grows next.
--
-- TWO DELIBERATE COARSENINGS, both of which lose information on purpose:
--
--   SEVERITY   internal severity is critical/high/medium/low. The public vocabulary is
--              outage/degraded/operational. "Critical" tells an attacker which component is worth
--              attacking and tells a competitor how bad the week was; "an outage is in progress in
--              Payments" is what a visitor needs in order to decide whether to wait.
--
--   RESOLUTION  omitted entirely. The operator's resolution note is written for the record and can name
--              internal systems, third parties and individuals. A public postmortem is a document
--              somebody drafts and approves, not a column that gets published because it exists.
--
-- ── AND IT IS READABLE WITHOUT A SESSION ──────────────────────────────────────────────────────
--
-- Granted to `anon` as well as `authenticated`: the help centre is public and pre-rendered, and a status
-- strip that only renders for signed-in visitors is a status strip nobody reads. A signed-out caller
-- cannot name an account, a case or a tenant in it — the function takes no arguments at all.

create or replace function public.get_public_system_status_command()
returns jsonb
language sql
stable
security definer
set search_path = public, app_private
as $$
  with published_incidents as (
    select i.id,
           i.title,
           i.area,
           -- The internal rank, kept only long enough to decide the public word and never emitted.
           case i.severity when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end as weight,
           i.severity,
           i.state,
           -- Truncated rather than published whole: an incident summary is written while somebody is
           -- under pressure and the long tail of it tends to name systems that are not public. The
           -- ellipsis is added inside the case so a 400-character summary is not left looking complete.
           case
             when char_length(i.summary) > 400 then left(i.summary, 397) || '…'
             else i.summary
           end as summary,
           i.created_at,
           i.updated_at,
           i.closed_at
      from public.platform_incidents i
     -- Closed incidents are not shown: the strip answers "is anything wrong right now". The 90-day floor
     -- exists so that an incident left open by mistake years ago cannot pin a component red for ever.
     where i.state <> 'closed'
       and i.created_at > now() - interval '90 days'
  ),
  components(ordinal, component_key, label, areas) as (
    values (1, 'platform', 'Platform & accounts', array['platform', 'data']),
           (2, 'payments', 'Payments & payouts', array['payments']),
           (3, 'projects', 'Projects & messages', array['delivery']),
           (4, 'search', 'Search & discovery', array['search']),
           (5, 'trust', 'Trust & safety', array['trust'])
  )
  select jsonb_build_object(
    'allowed', true,
    'checkedAt', now(),
    'components', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'key', c.component_key,
                   'label', c.label,
                   'state', case
                     when coalesce(worst.weight, 0) >= 3 then 'outage'
                     when coalesce(worst.weight, 0) = 2 then 'degraded'
                     else 'operational'
                   end,
                   'openIncidents', coalesce(worst.total, 0)
                 )
                 order by c.ordinal
               )
          from components c
          left join lateral (
            select max(p.weight) as weight, count(*) as total
              from published_incidents p
             where p.area = any (c.areas)
          ) worst on true
      ),
      '[]'::jsonb
    ),
    -- Newest first, and the public severity word is derived here rather than passed through.
    'incidents', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   -- ⚠️ NO ROW ID IS PUBLISHED. An incident's uuid identifies a row in an operator's
                   -- table, and putting it on a public page hands out an identifier whose only use is to
                   -- correlate the public strip with whatever else references it. The UI keys the list by
                   -- position instead: the order is fixed by started_at and the list is server-rendered.
                   'title', p.title,
                   'area', p.area,
                   'severity', case when p.severity in ('critical', 'high') then 'major' else 'minor' end,
                   'state', p.state,
                   'summary', p.summary,
                   'startedAt', p.created_at,
                   'updatedAt', p.updated_at,
                   'resolvedAt', p.closed_at
                 )
                 order by p.created_at desc
               )
          from published_incidents p
      ),
      '[]'::jsonb
    )
  );
$$;

comment on function public.get_public_system_status_command() is
  'The public status strip. Allowlisted field by field from platform_incidents: no runbook, no staff, no case links, no resolution text, and internal severity coarsened to outage/degraded/operational.';

revoke all on function public.get_public_system_status_command() from public;
grant execute on function public.get_public_system_status_command() to anon, authenticated;
