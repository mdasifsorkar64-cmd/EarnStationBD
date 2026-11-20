-- EarnStationBD withdrawal lifecycle: 5-hour payment window and one-time refund.
-- Run once in Supabase SQL Editor after schema.sql and earning_settings.sql.

alter table public.withdrawal_requests
  add column if not exists expires_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id);

update public.withdrawal_requests
set expires_at = created_at + interval '5 hours'
where expires_at is null;

alter table public.withdrawal_requests
  alter column expires_at set default (now() + interval '5 hours');

alter table public.withdrawal_requests
  drop constraint if exists withdrawal_requests_status_check;
alter table public.withdrawal_requests
  add constraint withdrawal_requests_status_check
  check (status in ('pending','approved','rejected','paid','refunded'));

-- Refunds release the reserved withdrawal amount; they must not create a second ledger credit.

create index if not exists withdrawals_pending_expiry_idx
  on public.withdrawal_requests(expires_at)
  where status in ('pending','approved');

-- Atomically refund every expired request. Row locks + unique index make this idempotent.
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
      and coalesce(expires_at, created_at + interval '5 hours') <= now()
    order by created_at
    for update skip locked
  loop
    update public.withdrawal_requests
    set status = 'refunded', refunded_at = coalesce(refunded_at, now()),
        reviewed_at = now(),
        admin_note = case when admin_note = '' then '৫ ঘণ্টা পার হওয়ায় টাকা স্বয়ংক্রিয়ভাবে ফেরত দেওয়া হয়েছে।' else admin_note end
    where id = v_row.id and status in ('pending','approved');

    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

-- Admin marks paid only while the request is still within its 5-hour window.
-- If the deadline has passed, the function refunds instead of marking success.
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

revoke all on function public.refund_expired_withdrawals() from public, anon, authenticated;
grant execute on function public.refund_expired_withdrawals() to service_role;

revoke all on function public.admin_complete_withdrawal(uuid) from public, anon;
grant execute on function public.admin_complete_withdrawal(uuid) to authenticated;

-- Supabase pg_cron runs the refund job even when the member's browser is closed.
create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'earnstation-refund-expired-withdrawals') then
    perform cron.schedule(
      'earnstation-refund-expired-withdrawals',
      '* * * * *',
      $job$select public.refund_expired_withdrawals();$job$
    );
  end if;
end;
$$;
