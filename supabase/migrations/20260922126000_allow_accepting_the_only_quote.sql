-- The most common case in the marketplace was impossible: one provider quotes, the customer wants to hire them.
--
-- WHAT WAS WRONG. `submit_quote_authoritatively` advances the request as quotes arrive — first quote moves
-- `submitted → matching`, a later one moves `matching → quoted`. But `validate_request_transition` allowed only
--
--     when 'matching' then new_state in ('quoted','cancelled')
--     when 'quoted'   then new_state in ('accepted','matching','cancelled')
--
-- so `matching → accepted` was refused (23514) while `quoted → accepted` was fine. The consequence, measured
-- against this database before the fix:
--
--     request state with exactly one live quote: matching
--     ACCEPT with one quote                     -> 400 invalid request state transition: matching -> accepted
--     ACCEPT after a SECOND provider quoted     -> 200
--
-- In other words: a customer with a single quote could not accept it, and the same quote became acceptable the
-- moment an unrelated second provider happened to quote the same job. The only way to hire one provider was for
-- somebody else to quote first.
--
-- WHY THIS IS A BUG AND NOT A POLICY. `accept_quote_authoritatively` states its own precondition as
-- `r.state in ('submitted','matching','quoted')` — it was written expecting to be reachable from `matching`.
-- The validator is the outlier between the two, and the command's own test suite passes because it runs as the
-- database owner and its fixtures set the request to `quoted` first.
--
-- THE FIX IS ONE ALTERNATIVE. `matching → accepted` joins the transitions out of `matching`. Nothing else
-- changes: `submitted → accepted` is deliberately NOT added, because a request in `submitted` cannot legally
-- hold a quote at all — the quote command always advances the state — so allowing it would widen the machine
-- for a state that cannot occur, and the UI does not offer it either.

create or replace function app_private.validate_request_transition(old_state public.request_state, new_state public.request_state)
returns boolean language sql immutable set search_path = '' as $$
select old_state = new_state or case old_state
  when 'draft' then new_state in ('submitted','cancelled')
  when 'submitted' then new_state in ('matching','cancelled')
  -- 'accepted' here is the fix: the first quote to arrive leaves the request in `matching`, and the customer
  -- must be able to accept it without waiting for a competitor.
  when 'matching' then new_state in ('quoted','accepted','cancelled')
  when 'quoted' then new_state in ('accepted','matching','cancelled')
  when 'accepted' then new_state in ('scheduled','cancelled','disputed')
  when 'scheduled' then new_state in ('in_progress','cancelled','disputed')
  when 'in_progress' then new_state in ('submitted_for_approval','disputed','cancelled')
  when 'submitted_for_approval' then new_state in ('completed','in_progress','disputed')
  when 'completed' then new_state in ('disputed')
  when 'cancelled' then false
  when 'disputed' then new_state in ('in_progress','submitted_for_approval','completed','cancelled')
  else false end;
$$;
