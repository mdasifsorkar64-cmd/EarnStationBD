-- EarnStationBD final withdrawal safety reconciliation.
-- Run AFTER test_balance.sql, withdrawal_lifecycle.sql,
-- withdrawal_transaction_id.sql, withdrawal_balance_deduction.sql,
-- and member_payout_fee.sql.
--
-- Preserves real/test balance separation, immediate gross ledger debit,
-- member-funded fee, one request per Dhaka day, and Transaction ID payment flow.

-- The live database did not yet have the member fee setting column.
alter table public.platform_settings
  add column if not exists member_payout_fee_bdt numeric(8,2) not null default 0;
alter table public.platform_settings
  drop constraint if exists platform_settings_member_payout_fee_bdt_check;
alter table public.platform_settings
  add constraint platform_settings_member_payout_fee_bdt_check
  check (member_payout_fee_bdt between 0 and 100);

alter table public.ledger_entries
  add column if not exists is_test boolean not null default false,
  add column if not exists withdrawal_id uuid references public.withdrawal_requests(id);

alter table public.withdrawal_requests
  add column if not exists is_test boolean not null default false,
  add column if not exists payment_transaction_id text,
  add column if not exists payout_fee_bdt numeric(8,2) not null default 0,
  add column if not exists payout_net_bdt numeric(12,2);

update public.withdrawal_requests
set payout_net_bdt = amount
where payout_net_bdt is null;

create unique index if not exists ledger_withdrawal_entry_once
  on public.ledger_entries(withdrawal_id, entry_type)
  where withdrawal_id is not null;

create unique index if not exists withdrawal_payment_txn_unique
  on public.withdrawal_requests(payout_method, lower(payment_transaction_id))
  where payment_transaction_id is not null;

-- Earlier debit backfills did not copy the TEST marker. Repair those rows.
update public.ledger_entries l
set is_test = true
from public.withdrawal_requests w
where l.withdrawal_id = w.id
  and coalesce(w.is_test, false) = true
  and l.is_test = false;

-- Atomically debit the gross amount once. A request uses either real balance
-- or test balance; test money can never be paid out as real money.
create or replace function public.request_withdrawal(
  p_amount numeric,
  p_method text,
  p_account_ciphertext text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_real_balance numeric(12,2);
  v_test_balance numeric(12,2);
  v_legacy_real_reserved numeric(12,2);
  v_legacy_test_reserved numeric(12,2);
  v_real_available numeric(12,2);
  v_test_available numeric(12,2);
  v_minimum numeric(12,2);
  v_fee numeric(8,2);
  v_net numeric(12,2);
  v_local_now timestamp;
  v_today_count integer;
  v_is_test boolean := false;
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 or round(p_amount,2) <> p_amount then
    raise exception 'Invalid amount';
  end if;
  if p_method not in ('bkash','nagad') then
    raise exception 'Unsupported payout method';
  end if;
  if p_account_ciphertext is null or length(p_account_ciphertext) < 16 then
    raise exception 'Encrypted payout details required';
  end if;

  select coalesce(minimum_withdrawal,100),
         coalesce(member_payout_fee_bdt,0)
    into v_minimum,v_fee
  from public.platform_settings
  where id = true;

  v_minimum := coalesce(v_minimum,100);
  v_fee := coalesce(v_fee,0);
  if p_amount < v_minimum then
    raise exception 'Minimum withdrawal is ৳%', v_minimum;
  end if;
  if v_fee < 0 or v_fee > 100 then
    raise exception 'Invalid payout fee configuration';
  end if;

  v_net := round(p_amount-v_fee,2);
  if v_net <= 0 then
    raise exception 'উত্তোলনের পরিমাণ পেমেন্ট চার্জের চেয়ে বেশি হতে হবে।';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  v_local_now := timezone('Asia/Dhaka',now());
  if v_local_now::time < time '08:00' or v_local_now::time >= time '20:00' then
    raise exception 'উইথড্রের সময় সকাল ৮টা থেকে রাত ৮টা পর্যন্ত। বাংলাদেশ সময় অনুযায়ী এই সময়ের বাইরে উত্তোলন করা যাবে না।';
  end if;

  select count(*) into v_today_count
  from public.withdrawal_requests w
  where w.user_id = v_user
    and (w.created_at at time zone 'Asia/Dhaka')::date = v_local_now::date;

  if v_today_count >= 1 then
    raise exception 'আপনি আজ একবার উইথড্র করেছেন। দিনে মাত্র ১ বার উইথড্র করা যাবে। আগামীকাল সকাল ৮টার পর আবার চেষ্টা করুন।';
  end if;

  select
    coalesce(sum(case when l.entry_type='credit' then l.amount else -l.amount end)
      filter (where coalesce(l.is_test,false)=false
        and coalesce(l.description,'') <> 'পুরোনো পরীক্ষামূলক উত্তোলন কর্তন'),0),
    coalesce(sum(case when l.entry_type='credit' then l.amount else -l.amount end)
      filter (where coalesce(l.is_test,false)=true),0)
  into v_real_balance,v_test_balance
  from public.ledger_entries l
  where l.user_id = v_user;

  -- Compatibility hold for older pending requests which have no debit row yet.
  select
    coalesce(sum(w.amount) filter (where coalesce(w.is_test,false)=false),0),
    coalesce(sum(w.amount) filter (where coalesce(w.is_test,false)=true),0)
  into v_legacy_real_reserved,v_legacy_test_reserved
  from public.withdrawal_requests w
  where w.user_id = v_user
    and w.status in ('pending','approved')
    and not exists (
      select 1 from public.ledger_entries l
      where l.withdrawal_id = w.id and l.entry_type='debit'
    );

  v_real_available := greatest(0,v_real_balance-v_legacy_real_reserved);
  v_test_available := greatest(0,v_test_balance-v_legacy_test_reserved);

  if p_amount <= v_real_available then
    v_is_test := false;
  elsif p_amount <= v_test_available then
    v_is_test := true;
  else
    raise exception 'Insufficient available balance';
  end if;

  insert into public.withdrawal_requests(
    user_id,amount,payout_method,payout_account_ciphertext,
    payout_fee_bdt,payout_net_bdt,is_test
  )
  values(v_user,p_amount,p_method,p_account_ciphertext,v_fee,v_net,v_is_test)
  returning id into v_id;

  insert into public.ledger_entries(
    user_id,withdrawal_id,entry_type,amount,description,is_test
  )
  values(
    v_user,v_id,'debit',p_amount,
    'উত্তোলন কর্তন · পেমেন্ট চার্জ ৳'||to_char(v_fee,'FM999999990.00')||
    ' · সদস্যের নেট পেমেন্ট ৳'||to_char(v_net,'FM999999990.00'),
    v_is_test
  );

  return v_id;
end;
$$;

revoke all on function public.request_withdrawal(numeric,text,text) from public,anon;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;

-- Refund only a request that actually had a debit; restore the same balance class.
create or replace function public.refund_expired_withdrawals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.withdrawal_requests%rowtype;
  v_count integer := 0;
begin
  for v_row in
    select *
    from public.withdrawal_requests
    where status in ('pending','approved')
      and coalesce(expires_at,created_at+interval '5 hours') <= now()
    order by created_at
    for update skip locked
  loop
    update public.withdrawal_requests
    set status='refunded',
        refunded_at=coalesce(refunded_at,now()),
        reviewed_at=now(),
        admin_note=case
          when coalesce(admin_note,'')='' then '৫ ঘণ্টা পার হওয়ায় টাকা স্বয়ংক্রিয়ভাবে ফেরত দেওয়া হয়েছে।'
          else admin_note end
    where id=v_row.id and status in ('pending','approved');

    if found then
      insert into public.ledger_entries(
        user_id,withdrawal_id,entry_type,amount,description,is_test
      )
      select v_row.user_id,v_row.id,'credit',v_row.amount,
        'উত্তোলন REFUNDED—কর্তিত ব্যালেন্স ফেরত',coalesce(v_row.is_test,false)
      where exists(
        select 1 from public.ledger_entries l
        where l.withdrawal_id=v_row.id and l.entry_type='debit'
      )
      on conflict (withdrawal_id,entry_type)
        where withdrawal_id is not null do nothing;
      v_count := v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.refund_expired_withdrawals() from public,anon,authenticated;
grant execute on function public.refund_expired_withdrawals() to service_role;

-- Real payment completion requires a Transaction ID. Test withdrawals are blocked.
create or replace function public.admin_complete_withdrawal(
  p_withdrawal_id uuid,
  p_transaction_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.withdrawal_requests%rowtype;
  v_txn text := btrim(coalesce(p_transaction_id,''));
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if length(v_txn)<4 or length(v_txn)>100 then
    raise exception '৪ থেকে ১০০ অক্ষরের সঠিক Transaction ID লিখুন';
  end if;

  select * into v_row
  from public.withdrawal_requests
  where id=p_withdrawal_id
  for update;

  if not found then raise exception 'Withdrawal not found'; end if;

  if v_row.status='paid' then
    if v_row.payment_transaction_id=v_txn then return 'paid'; end if;
    raise exception 'এই উত্তোলন ইতিমধ্যে সম্পন্ন হয়েছে';
  end if;
  if v_row.status='refunded' then return 'refunded'; end if;
  if v_row.status not in ('pending','approved') then
    raise exception 'Withdrawal is not payable';
  end if;
  if coalesce(v_row.is_test,false) then
    raise exception 'পরীক্ষামূলক উত্তোলনে বাস্তব পেমেন্ট করা যাবে না';
  end if;

  if coalesce(v_row.expires_at,v_row.created_at+interval '5 hours')<=now() then
    update public.withdrawal_requests
    set status='refunded',
        refunded_at=coalesce(refunded_at,now()),
        reviewed_at=now(),
        admin_note='৫ ঘণ্টা পার হওয়ায় টাকা ফেরত দেওয়া হয়েছে।'
    where id=v_row.id;

    insert into public.ledger_entries(
      user_id,withdrawal_id,entry_type,amount,description,is_test
    )
    select v_row.user_id,v_row.id,'credit',v_row.amount,
      'উত্তোলন REFUNDED—কর্তিত ব্যালেন্স ফেরত',coalesce(v_row.is_test,false)
    where exists(
      select 1 from public.ledger_entries l
      where l.withdrawal_id=v_row.id and l.entry_type='debit'
    )
    on conflict (withdrawal_id,entry_type)
      where withdrawal_id is not null do nothing;
    return 'refunded';
  end if;

  update public.withdrawal_requests
  set status='paid',
      paid_at=now(),
      reviewed_at=now(),
      reviewed_by=auth.uid(),
      payment_transaction_id=v_txn,
      admin_note='পেমেন্ট সম্পন্ন। Transaction ID: '||v_txn
  where id=v_row.id and status in ('pending','approved');

  return 'paid';
exception
  when unique_violation then
    raise exception 'এই Transaction ID আগে ব্যবহার করা হয়েছে';
end;
$$;

revoke all on function public.admin_complete_withdrawal(uuid,text) from public,anon;
grant execute on function public.admin_complete_withdrawal(uuid,text) to authenticated;


-- Keep the existing member/admin fee controls working after this migration.
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

notify pgrst,'reload schema';
