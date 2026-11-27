-- Keep TEST withdrawal refunds in the same ledger class as the original debit.
-- A test debit can only be refunded to a test credit; it must never become real balance.
create or replace function public.refund_expired_withdrawals()
returns integer language plpgsql security definer set search_path = public
as $$
declare v_row public.withdrawal_requests%rowtype; v_count integer := 0;
begin
  for v_row in
    select * from public.withdrawal_requests
    where status in ('pending', 'approved')
      and coalesce(expires_at, created_at + interval '5 hours') <= now()
    order by created_at for update skip locked
  loop
    update public.withdrawal_requests
    set status = 'refunded', refunded_at = coalesce(refunded_at, now()),
        reviewed_at = now(),
        admin_note = case when coalesce(admin_note, '') = ''
          then '৫ ঘণ্টা পার হওয়ায় টাকা স্বয়ংক্রিয়ভাবে ফেরত দেওয়া হয়েছে।'
          else admin_note end
    where id = v_row.id and status in ('pending', 'approved');
    if found then
      insert into public.ledger_entries
        (user_id, withdrawal_id, entry_type, amount, description, is_test)
      select v_row.user_id, v_row.id, 'credit', v_row.amount,
        'উত্তোলন REFUNDED—কর্তিত ব্যালেন্স ফেরত', coalesce(v_row.is_test, false)
      where exists (select 1 from public.ledger_entries l
        where l.withdrawal_id = v_row.id and l.entry_type = 'debit'
          and coalesce(l.is_test, false) = coalesce(v_row.is_test, false))
      on conflict (withdrawal_id, entry_type)
      where withdrawal_id is not null do nothing;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.refund_expired_withdrawals() from public, anon, authenticated;

create or replace function public.admin_complete_withdrawal(p_withdrawal_id uuid, p_transaction_id text)
returns text language plpgsql security definer set search_path = public
as $$
declare v_row public.withdrawal_requests%rowtype; v_txn text := btrim(coalesce(p_transaction_id, ''));
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if length(v_txn) < 4 or length(v_txn) > 100 then raise exception '৪ থেকে ১০০ অক্ষরের সঠিক Transaction ID লিখুন'; end if;
  select * into v_row from public.withdrawal_requests where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if v_row.status = 'paid' then
    if lower(btrim(coalesce(v_row.payment_transaction_id, ''))) = lower(v_txn) then return 'paid'; end if;
    raise exception 'এই উত্তোলন ইতিমধ্যে সম্পন্ন হয়েছে';
  end if;
  if v_row.status = 'refunded' then return 'refunded'; end if;
  if v_row.status not in ('pending', 'approved') then raise exception 'Withdrawal is not payable'; end if;

  if coalesce(v_row.expires_at, v_row.created_at + interval '5 hours') <= now() then
    update public.withdrawal_requests
    set status = 'refunded', refunded_at = coalesce(refunded_at, now()),
        reviewed_at = now(), reviewed_by = auth.uid(),
        admin_note = '৫ ঘণ্টা পার হওয়ায় টাকা ফেরত দেওয়া হয়েছে।'
    where id = v_row.id;
    insert into public.ledger_entries
      (user_id, withdrawal_id, entry_type, amount, description, is_test)
    select v_row.user_id, v_row.id, 'credit', v_row.amount,
      'উত্তোলন REFUNDED—কর্তিত ব্যালেন্স ফেরত', coalesce(v_row.is_test, false)
    where exists (select 1 from public.ledger_entries l
      where l.withdrawal_id = v_row.id and l.entry_type = 'debit'
        and coalesce(l.is_test, false) = coalesce(v_row.is_test, false))
    on conflict (withdrawal_id, entry_type)
    where withdrawal_id is not null do nothing;
    return 'refunded';
  end if;

  if coalesce(v_row.is_test, false) then
    raise exception 'পরীক্ষামূলক উত্তোলনে বাস্তব পেমেন্ট করা যাবে না';
  end if;

  update public.withdrawal_requests
  set status = 'paid', paid_at = now(), reviewed_at = now(),
      reviewed_by = auth.uid(), payment_transaction_id = v_txn,
      admin_note = 'পেমেন্ট সম্পন্ন। Transaction ID: ' || v_txn
  where id = v_row.id and status in ('pending', 'approved');
  return 'paid';
exception when unique_violation then
  raise exception 'এই Transaction ID আগে ব্যবহার করা হয়েছে';
end;
$$;
revoke all on function public.admin_complete_withdrawal(uuid, text) from public, anon;
grant execute on function public.admin_complete_withdrawal(uuid, text) to authenticated;

notify pgrst, 'reload schema';
