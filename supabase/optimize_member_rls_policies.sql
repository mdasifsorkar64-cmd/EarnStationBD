-- Preserve existing row access while avoiding per-row auth function evaluation.
-- Merge duplicate profiles policies so each command has one permissive policy.

drop policy if exists "ledger read own or admin" on public.ledger_entries;
create policy "ledger read own or admin"
on public.ledger_entries for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Members read own inbox" on public.member_inbox;
create policy "Members read own inbox"
on public.member_inbox for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "conversions read own or admin" on public.partner_conversions;
create policy "conversions read own or admin"
on public.partner_conversions for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "withdrawals read own or admin" on public.withdrawal_requests;
create policy "withdrawals read own or admin"
on public.withdrawal_requests for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profile read own or admin" on public.profiles;
drop policy if exists "test_user_can_read_own_profile" on public.profiles;
create policy "profile read own or admin"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "admins update profiles" on public.profiles;
drop policy if exists "members update own pending profile" on public.profiles;
create policy "profile update own pending or admin"
on public.profiles for update to authenticated
using (
  (select public.is_admin())
  or (id = (select auth.uid()) and coalesce(account_status,'active') <> 'active')
)
with check (
  (select public.is_admin())
  or (id = (select auth.uid()) and coalesce(account_status,'active') <> 'active')
);

notify pgrst, 'reload schema';
