-- EarnStationBD: allow withdrawals only from real, non-test balance.
-- Real withdrawal requests may use only real, non-test ledger balance.
-- Preserve the existing encrypted-account and atomic-lock protections.
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
  v_balance numeric(12,2);
  v_legacy_reserved numeric(12,2);
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_amount is null
     or p_amount <= 0
     or round(p_amount, 2) <> p_amount then
    raise exception 'Invalid amount';
  end if;

  if p_method not in ('bkash', 'nagad') then
    raise exception 'Unsupported payout method';
  end if;

  if p_account_ciphertext is null
     or length(p_account_ciphertext) < 16 then
    raise exception 'Encrypted payout details required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text, 0)
  );

  select coalesce(
    sum(case
      when l.entry_type = 'credit' then l.amount
      else -l.amount
    end),
    0
  )
  into v_balance
  from public.ledger_entries l
  where l.user_id = v_user
    and coalesce(l.is_test, false) = false
    and l.description <> 'পুরোনো পরীক্ষামূলক উত্তোলন কর্তন'
    and not exists (
      select 1
      from public.withdrawal_requests tw
      where tw.id = l.withdrawal_id
        and coalesce(tw.is_test, false) = true
    );

  -- Reserve legacy real requests that have not yet received a ledger debit.
  select coalesce(sum(w.amount), 0)
  into v_legacy_reserved
  from public.withdrawal_requests w
  where w.user_id = v_user
    and coalesce(w.is_test, false) = false
    and w.status in ('pending', 'approved')
    and not exists (
      select 1
      from public.ledger_entries l
      where l.withdrawal_id = w.id
        and l.entry_type = 'debit'
    );

  if p_amount > v_balance - v_legacy_reserved then
    raise exception 'Insufficient available balance';
  end if;

  insert into public.withdrawal_requests (
    user_id, amount, payout_method, payout_account_ciphertext
  )
  values (
    v_user, p_amount, p_method, p_account_ciphertext
  )
  returning id into v_id;

  insert into public.ledger_entries (
    user_id, withdrawal_id, entry_type, amount, description
  )
  values (
    v_user, v_id, 'debit', p_amount,
    'উত্তোলনের অনুরোধে ব্যালেন্স কর্তন'
  );

  return v_id;
end;
$$;

revoke all on function public.request_withdrawal(numeric,text,text) from public, anon;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;

notify pgrst, 'reload schema';
