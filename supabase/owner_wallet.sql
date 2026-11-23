-- EarnStationBD: separate owner wallet and manual withdrawal ledger.
-- Apply this migration in Supabase SQL Editor after reviewing it.
-- Member ledger and member withdrawal tables are not modified.

create table if not exists public.owner_wallet_withdrawals (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12,2) not null check (amount > 0),
  payout_method text not null check (payout_method in ('bkash','nagad','bank','cash','other')),
  payment_transaction_id text not null check (length(btrim(payment_transaction_id)) between 4 and 100),
  note text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists owner_wallet_withdrawals_txid_uidx
  on public.owner_wallet_withdrawals (lower(btrim(payment_transaction_id)));

alter table public.owner_wallet_withdrawals enable row level security;
drop policy if exists owner_wallet_withdrawals_admin_read on public.owner_wallet_withdrawals;
create policy owner_wallet_withdrawals_admin_read
  on public.owner_wallet_withdrawals for select to authenticated
  using (public.is_admin());

revoke all on public.owner_wallet_withdrawals from anon, authenticated;
grant select on public.owner_wallet_withdrawals to authenticated;

create or replace function public.admin_get_owner_wallet_summary()
returns table (
  owner_share_total_bdt numeric(14,2),
  awaiting_partner_payment_bdt numeric(14,2),
  partner_payment_received_bdt numeric(14,2),
  reversed_owner_share_bdt numeric(14,2),
  owner_withdrawn_bdt numeric(14,2),
  owner_available_bdt numeric(14,2)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  return query
  with allocation_totals as (
    select
      coalesce(sum(a.owner_share_bdt),0)::numeric(14,2) as total_share,
      coalesce(sum(a.owner_share_bdt) filter (where a.partner_payment_status = 'awaiting_partner_payment'),0)::numeric(14,2) as awaiting,
      coalesce(sum(a.owner_share_bdt) filter (where a.partner_payment_status = 'received'),0)::numeric(14,2) as received,
      coalesce(sum(a.owner_share_bdt) filter (where a.partner_payment_status = 'reversed'),0)::numeric(14,2) as reversed
    from public.partner_commission_allocations a
  ), withdrawal_total as (
    select coalesce(sum(w.amount),0)::numeric(14,2) as withdrawn
    from public.owner_wallet_withdrawals w
  )
  select t.total_share,t.awaiting,t.received,t.reversed,w.withdrawn,
         (t.received-w.withdrawn)::numeric(14,2)
    from allocation_totals t cross join withdrawal_total w;
end;
$$;

create or replace function public.admin_list_owner_allocations()
returns table (
  conversion_id uuid,
  partner_name text,
  external_conversion_id text,
  partner_gross_bdt numeric(12,2),
  owner_share_bdt numeric(12,2),
  partner_payment_status text,
  received_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
    select a.conversion_id,c.partner_name,c.external_conversion_id,
           a.partner_gross_bdt,a.owner_share_bdt,a.partner_payment_status,
           c.received_at,a.updated_at
      from public.partner_commission_allocations a
      join public.partner_conversions c on c.id=a.conversion_id
     order by c.received_at desc
     limit 200;
end;
$$;

create or replace function public.admin_set_partner_payment_status(
  p_conversion_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_received numeric(14,2);
  v_withdrawn numeric(14,2);
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_conversion_id is null or p_status is null or p_status not in ('awaiting_partner_payment','received','reversed') then
    raise exception 'Invalid partner payment status';
  end if;

  perform pg_advisory_xact_lock(hashtext('earnstationbd-owner-wallet')::bigint);
  select a.partner_payment_status into v_status
    from public.partner_commission_allocations a
   where a.conversion_id=p_conversion_id for update;
  if not found then raise exception 'Commission allocation not found'; end if;

  update public.partner_commission_allocations
     set partner_payment_status=p_status, updated_at=now()
   where conversion_id=p_conversion_id;

  insert into public.admin_audit_log(admin_id,action,details)
  values(auth.uid(),'owner_wallet_partner_payment_status',
    jsonb_build_object('conversion_id',p_conversion_id,'old_status',v_status,
                       'new_status',p_status));

  select coalesce(sum(a.owner_share_bdt),0) into v_received
    from public.partner_commission_allocations a
   where a.partner_payment_status='received';
  select coalesce(sum(w.amount),0) into v_withdrawn
    from public.owner_wallet_withdrawals w;

  if v_withdrawn > v_received then
    raise exception 'Cannot reverse or change received funds: owner withdrawals already use this balance';
  end if;
end;
$$;

create or replace function public.admin_record_owner_withdrawal(
  p_amount numeric,
  p_method text,
  p_transaction_id text,
  p_note text default ''
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received numeric(14,2);
  v_withdrawn numeric(14,2);
  v_amount numeric(12,2);
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_amount is null then raise exception 'Withdrawal amount must be positive'; end if;
  v_amount := round(p_amount,2);
  if v_amount <= 0 then raise exception 'Withdrawal amount must be positive'; end if;
  if p_method not in ('bkash','nagad','bank','cash','other') then raise exception 'Unsupported payout method'; end if;
  if p_transaction_id is null or length(btrim(p_transaction_id)) not between 4 and 100 then
    raise exception 'A valid transaction/reference ID is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('earnstationbd-owner-wallet')::bigint);
  select coalesce(sum(a.owner_share_bdt),0) into v_received
    from public.partner_commission_allocations a
   where a.partner_payment_status='received';
  select coalesce(sum(w.amount),0) into v_withdrawn
    from public.owner_wallet_withdrawals w;

  if v_amount > v_received-v_withdrawn then
    raise exception 'Insufficient owner wallet balance';
  end if;

  insert into public.owner_wallet_withdrawals
    (amount,payout_method,payment_transaction_id,note,created_by)
  values
    (v_amount,p_method,btrim(p_transaction_id),left(coalesce(p_note,''),1000),auth.uid())
  returning id into v_id;

  insert into public.admin_audit_log(admin_id,action,details)
  values(auth.uid(),'owner_wallet_withdrawal_recorded',
    jsonb_build_object('withdrawal_id',v_id,'amount_bdt',v_amount,
                       'method',p_method,'transaction_id',btrim(p_transaction_id),
                       'note',left(coalesce(p_note,''),1000)));

  return v_id;
end;
$$;

revoke all on function public.admin_get_owner_wallet_summary() from public, anon;
revoke all on function public.admin_list_owner_allocations() from public, anon;
revoke all on function public.admin_set_partner_payment_status(uuid,text) from public, anon;
revoke all on function public.admin_record_owner_withdrawal(numeric,text,text,text) from public, anon;
grant execute on function public.admin_get_owner_wallet_summary() to authenticated;
grant execute on function public.admin_list_owner_allocations() to authenticated;
grant execute on function public.admin_set_partner_payment_status(uuid,text) to authenticated;
grant execute on function public.admin_record_owner_withdrawal(numeric,text,text,text) to authenticated;

notify pgrst, 'reload schema';
