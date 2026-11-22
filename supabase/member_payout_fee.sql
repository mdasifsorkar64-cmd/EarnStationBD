-- EarnStationBD: transparent member-funded payout fee.
-- Member reward is credited gross; the actual payout fee is deducted only when
-- the member withdraws. Owner's 40% commission allocation is not affected.
-- Default fee is 0 until admin sets the verified bKash/Nagad sending cost.

alter table public.platform_settings
  add column if not exists member_payout_fee_bdt numeric(8,2) not null default 0;
alter table public.platform_settings
  drop constraint if exists platform_settings_member_payout_fee_bdt_check;
alter table public.platform_settings
  add constraint platform_settings_member_payout_fee_bdt_check
  check (member_payout_fee_bdt between 0 and 100);

alter table public.withdrawal_requests
  add column if not exists payout_fee_bdt numeric(8,2) not null default 0,
  add column if not exists payout_net_bdt numeric(12,2);

-- Existing records keep their original requested/paid amount as net.
update public.withdrawal_requests
   set payout_net_bdt=amount
 where payout_net_bdt is null;

create or replace function public.get_member_payout_fee()
returns numeric
language sql
security definer
set search_path=public
as $$
  select coalesce(s.member_payout_fee_bdt,0)
  from public.platform_settings s
  where s.id=true and auth.uid() is not null;
$$;
revoke all on function public.get_member_payout_fee() from public,anon;
grant execute on function public.get_member_payout_fee() to authenticated;

create or replace function public.admin_update_member_payout_fee(p_fee_bdt numeric)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_fee_bdt is null or p_fee_bdt<0 or p_fee_bdt>100
     or round(p_fee_bdt,2)<>p_fee_bdt then
    raise exception 'Payout fee must be between 0 and 100 BDT, up to 2 decimals';
  end if;
  update public.platform_settings
     set member_payout_fee_bdt=p_fee_bdt,updated_at=now(),updated_by=auth.uid()
   where id=true;
  insert into public.admin_audit_log(admin_id,action,details)
  values(auth.uid(),'member_payout_fee_updated',
    jsonb_build_object('fee_bdt',p_fee_bdt,
      'note','Fixed payout processing charge; member deduction at withdrawal only'));
end;
$$;
revoke all on function public.admin_update_member_payout_fee(numeric) from public,anon;
grant execute on function public.admin_update_member_payout_fee(numeric) to authenticated;

-- Amount requested is the gross balance debit. The stored net is what admin
-- actually sends to the member. Fee is deducted once, from member's own reward.
create or replace function public.request_withdrawal(
  p_amount numeric,
  p_method text,
  p_account_ciphertext text
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_balance numeric(12,2);
  v_legacy_reserved numeric(12,2);
  v_local_now timestamp;
  v_today_count integer;
  v_id uuid;
  v_fee numeric(8,2);
  v_net numeric(12,2);
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount<=0 or round(p_amount,2)<>p_amount then raise exception 'Invalid amount'; end if;
  if p_method not in ('bkash','nagad') then raise exception 'Unsupported payout method'; end if;
  if p_account_ciphertext is null or length(p_account_ciphertext)<16 then raise exception 'Encrypted payout details required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  v_local_now := timezone('Asia/Dhaka', now());
  if v_local_now::time < time '08:00' or v_local_now::time >= time '20:00' then
    raise exception 'উইথড্রের সময় সকাল ৮টা থেকে রাত ৮টা পর্যন্ত। বাংলাদেশ সময় অনুযায়ী এই সময়ের বাইরে উত্তোলন করা যাবে না।';
  end if;

  select count(*) into v_today_count
  from public.withdrawal_requests w
  where w.user_id=v_user
    and (w.created_at at time zone 'Asia/Dhaka')::date=v_local_now::date;
  if v_today_count>=1 then
    raise exception 'আপনি আজ একবার উইথড্র করেছেন। দিনে মাত্র ১ বার উইথড্র করা যাবে। আগামীকাল সকাল ৮টার পর আবার চেষ্টা করুন।';
  end if;

  select coalesce(sum(case when entry_type='credit' then amount else -amount end),0)
    into v_balance from public.ledger_entries where user_id=v_user;

  select coalesce(sum(w.amount),0) into v_legacy_reserved
  from public.withdrawal_requests w
  where w.user_id=v_user and w.status in ('pending','approved')
    and not exists(select 1 from public.ledger_entries l where l.withdrawal_id=w.id and l.entry_type='debit');

  if p_amount>v_balance-v_legacy_reserved then raise exception 'Insufficient available balance'; end if;

  select coalesce(member_payout_fee_bdt,0) into v_fee
  from public.platform_settings where id=true;
  v_fee:=coalesce(v_fee,0);
  v_net:=round(p_amount-v_fee,2);
  if v_net<=0 then
    raise exception 'উত্তোলনের পরিমাণ পেমেন্ট চার্জের চেয়ে বেশি হতে হবে।';
  end if;

  insert into public.withdrawal_requests
    (user_id,amount,payout_method,payout_account_ciphertext,payout_fee_bdt,payout_net_bdt)
  values(v_user,p_amount,p_method,p_account_ciphertext,v_fee,v_net)
  returning id into v_id;

  insert into public.ledger_entries(user_id,withdrawal_id,entry_type,amount,description)
  values(v_user,v_id,'debit',p_amount,
    'উত্তোলন কর্তন · পেমেন্ট চার্জ ৳'||to_char(v_fee,'FM999999990.00')||
    ' · সদস্যের নেট পেমেন্ট ৳'||to_char(v_net,'FM999999990.00'));

  return v_id;
end;
$$;
revoke all on function public.request_withdrawal(numeric,text,text) from public;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;

notify pgrst,'reload schema';

-- Admin-only read RPC for the payout-fee control in the dashboard.
create or replace function public.admin_get_member_payout_fee()
returns numeric
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return (select coalesce(s.member_payout_fee_bdt,0)
    from public.platform_settings s where s.id=true);
end;
$$;
revoke all on function public.admin_get_member_payout_fee() from public,anon;
grant execute on function public.admin_get_member_payout_fee() to authenticated;
notify pgrst,'reload schema';
