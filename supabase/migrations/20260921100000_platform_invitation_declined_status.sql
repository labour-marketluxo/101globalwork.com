-- Adds 'declined' to the invitation lifecycle.
--
-- WHY THIS IS ITS OWN MIGRATION, AND NOT PART OF THE ONE BESIDE IT.
--
-- Postgres can add a value to an enum inside a transaction (12+), but the new value cannot be USED
-- in that same transaction. Supabase applies each migration file in a transaction, so a file that
-- both added 'declined' and created a function whose body writes it would be relying on a
-- distinction between "referenced in a function body" and "evaluated" — true today, and exactly the
-- kind of subtlety that breaks on a provider upgrade. Two files, two transactions, no argument.
--
-- WHAT THE VALUE IS FOR: an invitee can now say no. Until this existed the only answers to an
-- invitation were accept and ignore, and "ignore" is indistinguishable from "never saw it" for
-- whoever sent it. Declining also disables the link, which is the platform's only lever a recipient
-- has if an invitation arrives unexpectedly.
--
-- The existing reader in /admin/access filters on status = 'pending', so a new value needs no change
-- there; revoked and expired rows were already invisible to it.

alter type public.platform_invitation_status add value if not exists 'declined';
