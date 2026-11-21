-- EarnStationBD: withdraw immediately reduces ledger balance; refund restores it once.
-- Run in Supabase SQL Editor on design/premium-ui after withdrawal_lifecycle.sql
-- and withdrawal_transaction_id.sql.

alter table public.ledger_entries
  add column if not exists withdrawal_id uuid references public.withdrawal_requests(id);

create unique index if not exists ledger_withdrawal_entry_once
  on public.ledger_entries(withdrawal_id, entry_type)
  where withdrawal_id is not null;

-- Backfill withdrawals created by the old reservation-only model.
-- Paid and still-active requests get a permanent debit. Previously refunded requests
-- had never been debited, so they are intentionally not credited again.
insert into public.ledger_entries(user_id, withdrawal_id, entry_type, amount, description)
select w.user_id, w.id, 'debit', w.amount,
       case when w.is_test then 'পুরোনো পরীক্ষামূলক উত্তোলন কর্তন' else 'পুরোনো উত্তোলন কর্তন' end
from public.withdrawal_requests w
where w.status in ('pending','approved','paid')
  and not exists (
    select 1 from public.ledger_entries l
    where l.withdrawal_id=w.id and l.entry_type='debit'
  )
on conflict (withdrawal_id, entry_type) where withdrawal_id is not null do nothing;

-- Request: atomically reserve and debit immediately, including TEST withdrawals.
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
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount<=0 or round(p_amount,2)<>p_amount then raise exception 'Invalid amount'; end if;
  if p_method not in ('bkash','nagad') then raise exception 'Unsupported payout method'; end if;
  if p_account_ciphertext is null or length(p_account_ciphertext)<16 then raise exception 'Encrypted payout details required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));

  -- Bangladesh Standard Time (Asia/Dhaka): allow from 08:00 up to 19:59.
  v_local_now := timezone('Asia/Dhaka', now());
  if v_local_now::time < time '08:00'
     or v_local_now::time >= time '20:00' then
    raise exception 'উইথড্রের সময় সকাল ৮টা থেকে রাত ৮টা পর্যন্ত। বাংলাদেশ সময় অনুযায়ী এই সময়ের বাইরে উত্তোলন করা যাবে না।';
  end if;

  -- One withdrawal request per Bangladesh calendar day, regardless of request status.
  select count(*) into v_today_count
  from public.withdrawal_requests w
  where w.user_id = v_user
    and (w.created_at at time zone 'Asia/Dhaka')::date = v_local_now::date;

  if v_today_count >= 1 then
    raise exception 'আপনি আজ একবার উইথড্র করেছেন। দিনে মাত্র ১ বার উইথড্র করা যাবে। আগামীকাল সকাল ৮টার পর আবার চেষ্টা করুন।';
  end if;

  select coalesce(sum(case when entry_type='credit' then amount else -amount end),0)
    into v_balance from public.ledger_entries where user_id=v_user;

  -- Temporary safety hold for old pending requests which do not yet have a ledger debit.
  select coalesce(sum(w.amount),0) into v_legacy_reserved
  from public.withdrawal_requests w
  where w.user_id=v_user and w.status in ('pending','approved')
    and not exists(select 1 from public.ledger_entries l where l.withdrawal_id=w.id and l.entry_type='debit');

  if p_amount > v_balance-v_legacy_reserved then raise exception 'Insufficient available balance'; end if;

  insert into public.withdrawal_requests(user_id,amount,payout_method,payout_account_ciphertext)
  values(v_user,p_amount,p_method,p_account_ciphertext) returning id into v_id;

  insert into public.ledger_entries(user_id,withdrawal_id,entry_type,amount,description)
  values(v_user,v_id,'debit',p_amount,'উত্তোলনের অনুরোধে ব্যালেন্স কর্তন');

  return v_id;
end;
$$;
revoke all on function public.request_withdrawal(numeric,text,text) from public;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;

-- Expiry refund adds a matching ledger credit exactly once, only if a debit exists.
create or replace function public.refund_expired_withdrawals()
returns integer language plpgsql security definer set search_path=public
as $$
declare v_row public.withdrawal_requests%rowtype; v_count integer:=0;
begin
  for v_row in
    select * from public.withdrawal_requests
    where status in ('pending','approved')
      and coalesce(expires_at,created_at+interval '5 hours')<=now()
    order by created_at for update skip locked
  loop
    update public.withdrawal_requests
      set status='refunded',refunded_at=coalesce(refunded_at,now()),reviewed_at=now(),
          admin_note=case when coalesce(admin_note,'')='' then '৫ ঘণ্টা পার হওয়ায় টাকা স্বয়ংক্রিয়ভাবে ফেরত দেওয়া হয়েছে।' else admin_note end
      where id=v_row.id and status in ('pending','approved');
    if found then
      insert into public.ledger_entries(user_id,withdrawal_id,entry_type,amount,description)
      select v_row.user_id,v_row.id,'credit',v_row.amount,'উত্তোলন REFUNDED—কর্তিত ব্যালেন্স ফেরত'
      where exists(select 1 from public.ledger_entries l where l.withdrawal_id=v_row.id and l.entry_type='debit')
      on conflict (withdrawal_id,entry_type) where withdrawal_id is not null do nothing;
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.refund_expired_withdrawals() from public,anon,authenticated;
grant execute on function public.refund_expired_withdrawals() to service_role;

-- Keep the existing admin RPC contract (UUID + transaction ID); expired requests refund.
create or replace function public.admin_complete_withdrawal(
  p_withdrawal_id uuid,p_transaction_id text
) returns text language plpgsql security definer set search_path=public
as $$
declare v_row public.withdrawal_requests%rowtype; v_txn text:=btrim(coalesce(p_transaction_id,''));
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if length(v_txn)<4 or length(v_txn)>100 then raise exception '৪ থেকে ১০০ অক্ষরের সঠিক Transaction ID লিখুন'; end if;
  select * into v_row from public.withdrawal_requests where id=p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if v_row.status='paid' then
    if v_row.payment_transaction_id=v_txn then return 'paid'; end if;
    raise exception 'এই উত্তোলন ইতিমধ্যে সম্পন্ন হয়েছে';
  end if;
  if v_row.status='refunded' then return 'refunded'; end if;
  if v_row.status not in ('pending','approved') then raise exception 'Withdrawal is not payable'; end if;
  if coalesce(v_row.is_test,false) then raise exception 'পরীক্ষামূলক উত্তোলনে বাস্তব পেমেন্ট করা যাবে না'; end if;

  if coalesce(v_row.expires_at,v_row.created_at+interval '5 hours')<=now() then
    update public.withdrawal_requests set status='refunded',refunded_at=coalesce(refunded_at,now()),
      reviewed_at=now(),admin_note='৫ ঘণ্টা পার হওয়ায় টাকা ফেরত দেওয়া হয়েছে।'
      where id=v_row.id;
    insert into public.ledger_entries(user_id,withdrawal_id,entry_type,amount,description)
      select v_row.user_id,v_row.id,'credit',v_row.amount,'উত্তোলন REFUNDED—কর্তিত ব্যালেন্স ফেরত'
      where exists(select 1 from public.ledger_entries l where l.withdrawal_id=v_row.id and l.entry_type='debit')
      on conflict (withdrawal_id,entry_type) where withdrawal_id is not null do nothing;
    return 'refunded';
  end if;

  update public.withdrawal_requests set status='paid',paid_at=now(),reviewed_at=now(),
    reviewed_by=auth.uid(),payment_transaction_id=v_txn,
    admin_note='পেমেন্ট সম্পন্ন। Transaction ID: '||v_txn
    where id=v_row.id and status in ('pending','approved');
  return 'paid';
exception when unique_violation then raise exception 'এই Transaction ID আগে ব্যবহার করা হয়েছে';
end;
$$;
revoke all on function public.admin_complete_withdrawal(uuid,text) from public,anon;
grant execute on function public.admin_complete_withdrawal(uuid,text) to authenticated;

notify pgrst,'reload schema';
