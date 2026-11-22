-- Admin reconciliation: member 60% allocation pool minus completed gross withdrawals.
-- SUCCESS is recorded as status='paid' by admin_complete_withdrawal.
-- This is a reporting balance only; it does not debit the member ledger again.
create or replace function public.admin_get_member_commission_balance()
returns table(
  member_commission_allocated_bdt numeric(14,2),
  withdrawals_paid_bdt numeric(14,2),
  withdrawals_pending_bdt numeric(14,2),
  member_commission_remaining_bdt numeric(14,2)
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_allocated numeric(14,2);
  v_paid numeric(14,2);
  v_pending numeric(14,2);
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  select coalesce(sum(a.member_reward_bdt),0)
    into v_allocated
    from public.partner_commission_allocations a;

  select
    coalesce(sum(w.amount) filter (where w.status='paid' and coalesce(w.is_test,false)=false),0),
    coalesce(sum(w.amount) filter (where w.status in ('pending','approved') and coalesce(w.is_test,false)=false),0)
    into v_paid,v_pending
    from public.withdrawal_requests w;

  return query select
    v_allocated,
    v_paid,
    v_pending,
    v_allocated-v_paid;
end;
$$;

revoke all on function public.admin_get_member_commission_balance() from public,anon;
grant execute on function public.admin_get_member_commission_balance() to authenticated;
notify pgrst,'reload schema';
