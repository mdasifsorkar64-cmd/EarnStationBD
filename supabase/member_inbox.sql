-- EarnStationBD: secure member inbox for genuine income events
-- Apply after financial accounting migrations. Safe to run more than once.

create table if not exists public.member_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_entry_id uuid not null unique references public.ledger_entries(id) on delete cascade,
  notification_type text not null default 'earning',
  title text not null,
  message text not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null,
  read_at timestamptz
);

create index if not exists member_inbox_user_created_idx
  on public.member_inbox (user_id, created_at desc);

alter table public.member_inbox enable row level security;

drop policy if exists "Members read own inbox" on public.member_inbox;
create policy "Members read own inbox"
  on public.member_inbox
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.member_inbox from anon, authenticated;
grant select on table public.member_inbox to authenticated;

create or replace function public.mark_my_inbox_item_read(p_inbox_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.member_inbox
     set read_at = coalesce(read_at, now())
   where id = p_inbox_id
     and user_id = auth.uid();

  get diagnostics changed_count = row_count;
  return changed_count > 0;
end;
$$;

revoke all on function public.mark_my_inbox_item_read(uuid) from public, anon;
grant execute on function public.mark_my_inbox_item_read(uuid) to authenticated;

create or replace function public.create_income_inbox_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_title text;
  item_type text;
begin
  -- Only genuine, non-test income credits become income notifications.
  -- Refunds restore balance; they are not new earnings.
  if lower(coalesce(new.entry_type, '')) <> 'credit'
     or coalesce(new.is_test, false)
     or new.withdrawal_id is not null
     or coalesce(new.description, '') ilike 'উত্তোলন REFUNDED%'
     or new.user_id is null then
    return new;
  end if;

  if new.description ilike '%referral%' or new.description ilike '%রেফারেল%' then
    item_title := 'রেফারেল বোনাস যোগ হয়েছে';
    item_type := 'referral';
  elsif new.description ilike '%ad%' or new.description ilike '%বিজ্ঞাপন%' then
    item_title := 'বিজ্ঞাপন থেকে আয় যোগ হয়েছে';
    item_type := 'ad';
  elsif new.description ilike '%offer%' or new.description ilike '%অফার%' or new.description ilike '%commission%' or new.description ilike '%কমিশন%' then
    item_title := 'অফার/কমিশন আয় যোগ হয়েছে';
    item_type := 'offer';
  else
    item_title := 'নতুন আয় যোগ হয়েছে';
    item_type := 'earning';
  end if;

  insert into public.member_inbox
    (user_id, ledger_entry_id, notification_type, title, message, amount, created_at)
  values
    (new.user_id, new.id, item_type, item_title,
     coalesce(nullif(new.description, ''), 'আপনার হিসাবে প্রকৃত আয় যোগ হয়েছে।'),
     new.amount, new.created_at)
  on conflict (ledger_entry_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_create_income_inbox_item on public.ledger_entries;
create trigger trg_create_income_inbox_item
after insert on public.ledger_entries
for each row execute function public.create_income_inbox_item();

-- Backfill existing eligible income entries without creating duplicates.
insert into public.member_inbox
  (user_id, ledger_entry_id, notification_type, title, message, amount, created_at)
select
  le.user_id,
  le.id,
  case
    when le.description ilike '%referral%' or le.description ilike '%রেফারেল%' then 'referral'
    when le.description ilike '%ad%' or le.description ilike '%বিজ্ঞাপন%' then 'ad'
    when le.description ilike '%offer%' or le.description ilike '%অফার%' or le.description ilike '%commission%' or le.description ilike '%কমিশন%' then 'offer'
    else 'earning'
  end,
  case
    when le.description ilike '%referral%' or le.description ilike '%রেফারেল%' then 'রেফারেল বোনাস যোগ হয়েছে'
    when le.description ilike '%ad%' or le.description ilike '%বিজ্ঞাপন%' then 'বিজ্ঞাপন থেকে আয় যোগ হয়েছে'
    when le.description ilike '%offer%' or le.description ilike '%অফার%' or le.description ilike '%commission%' or le.description ilike '%কমিশন%' then 'অফার/কমিশন আয় যোগ হয়েছে'
    else 'নতুন আয় যোগ হয়েছে'
  end,
  coalesce(nullif(le.description, ''), 'আপনার হিসাবে প্রকৃত আয় যোগ হয়েছে।'),
  le.amount,
  le.created_at
from public.ledger_entries le
where lower(coalesce(le.entry_type, '')) = 'credit'
  and not coalesce(le.is_test, false)
  and le.withdrawal_id is null
  and coalesce(le.description, '') not ilike 'উত্তোলন REFUNDED%'
  and le.user_id is not null
on conflict (ledger_entry_id) do nothing;

notify pgrst, 'reload schema';
