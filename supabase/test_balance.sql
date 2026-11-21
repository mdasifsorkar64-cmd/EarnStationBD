-- EarnStationBD: safe admin-issued test balance for withdrawal-flow testing.
-- Run this migration once in Supabase SQL Editor.

alter table public.ledger_entries
  add column if not exists is_test boolean not null default false;

alter table public.withdrawal_requests
  add column if not exists is_test boolean not null default false;

create or replace function public.admin_add_test_balance(
  p_user_id uuid,
  p_amount numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_user_id is null then
    raise exception 'সদস্য নির্বাচন করুন';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 500
     or round(p_amount, 2) <> p_amount then
    raise exception 'পরীক্ষামূলক ব্যালেন্স ১ থেকে ৫০০ টাকার মধ্যে হতে হবে';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'member'
  ) then
    raise exception 'সদস্য অ্যাকাউন্ট পাওয়া যায়নি';
  end if;

  insert into public.ledger_entries(user_id, entry_type, amount, description, is_test)
  values (
    p_user_id,
    'credit',
    p_amount,
    'পরীক্ষামূলক ব্যালেন্স — উত্তোলন পরীক্ষা (বাস্তব অর্থ নয়)',
    true
  );

  insert into public.admin_audit_log(admin_id, action, details)
  values (
    auth.uid(),
    'test_balance_added',
    jsonb_build_object('user_id', p_user_id, 'amount', p_amount)
  );
end;
$$;

revoke all on function public.admin_add_test_balance(uuid, numeric) from public, anon;
grant execute on function public.admin_add_test_balance(uuid, numeric) to authenticated;

-- A withdrawal is classified as TEST when it uses test balance.
-- Test withdrawals are visible to admins but can never be marked paid.
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
  v_real_earned numeric(12,2);
  v_test_earned numeric(12,2);
  v_real_reserved numeric(12,2);
  v_test_reserved numeric(12,2);
  v_real_available numeric(12,2);
  v_test_available numeric(12,2);
  v_minimum numeric(12,2);
  v_is_test boolean := false;
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 or round(p_amount,2) <> p_amount then
    raise exception 'Invalid amount';
  end if;

  select minimum_withdrawal into v_minimum
  from public.platform_settings where id=true;
  if v_minimum is null then v_minimum := 100; end if;
  if p_amount < v_minimum then
    raise exception 'Minimum withdrawal is ৳' || v_minimum::text;
  end if;
  if p_method not in ('bkash','nagad') then raise exception 'Unsupported payout method'; end if;
  if p_account_ciphertext is null or length(p_account_ciphertext) < 16 then
    raise exception 'Encrypted payout details required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select
    coalesce(sum(case when entry_type='credit' then amount else -amount end)
      filter (where is_test=false),0),
    coalesce(sum(case when entry_type='credit' then amount else -amount end)
      filter (where is_test=true),0)
  into v_real_earned, v_test_earned
  from public.ledger_entries
  where user_id=v_user;

  select
    coalesce(sum(amount) filter (where is_test=false),0),
    coalesce(sum(amount) filter (where is_test=true),0)
  into v_real_reserved, v_test_reserved
  from public.withdrawal_requests
  where user_id=v_user and status in ('pending','approved','paid');

  v_real_available := greatest(0, v_real_earned-v_real_reserved);
  v_test_available := greatest(0, v_test_earned-v_test_reserved);

  if p_amount <= v_real_available then
    v_is_test := false;
  elsif p_amount <= v_test_available then
    v_is_test := true;
  else
    raise exception 'Insufficient available balance';
  end if;

  insert into public.withdrawal_requests(
    user_id, amount, payout_method, payout_account_ciphertext, is_test
  )
  values(v_user, p_amount, p_method, p_account_ciphertext, v_is_test)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.request_withdrawal(numeric,text,text) from public, anon;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;

create or replace function public.admin_complete_withdrawal(p_withdrawal_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.withdrawal_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  select * into v_row
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;

  if not found then raise exception 'Withdrawal not found'; end if;
  if v_row.status = 'paid' then return 'paid'; end if;
  if v_row.status = 'refunded' then return 'refunded'; end if;
  if v_row.status not in ('pending','approved') then
    raise exception 'Withdrawal is not payable';
  end if;
  if coalesce(v_row.is_test,false) then
    raise exception 'পরীক্ষামূলক উত্তোলনে বাস্তব পেমেন্ট করা যাবে না';
  end if;

  if coalesce(v_row.expires_at, v_row.created_at + interval '5 hours') <= now() then
    update public.withdrawal_requests
    set status='refunded', refunded_at=coalesce(refunded_at,now()),
        reviewed_at=now(),
        admin_note='৫ ঘণ্টা পার হওয়ায় টাকা স্বয়ংক্রিয়ভাবে ফেরত দেওয়া হয়েছে।'
    where id=v_row.id;
    return 'refunded';
  end if;

  update public.withdrawal_requests
  set status='paid', paid_at=now(), reviewed_at=now(), reviewed_by=auth.uid(),
      admin_note='প্রশাসক পেমেন্ট সম্পন্ন করেছেন।'
  where id=v_row.id and status in ('pending','approved');

  return 'paid';
end;
$$;

revoke all on function public.admin_complete_withdrawal(uuid) from public, anon;
grant execute on function public.admin_complete_withdrawal(uuid) to authenticated;

notify pgrst, 'reload schema';
