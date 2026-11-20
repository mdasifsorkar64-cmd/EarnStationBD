-- Earn Station BD: Supabase schema foundation
-- Run only in a new Supabase project after reviewing the SQL.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text unique,
  role text not null default 'member' check (role in ('member','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  partner_name text not null,
  destination_url text not null,
  status text not null default 'pending' check (status in ('pending','active','paused','rejected')),
  terms text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.partner_conversions (
  id uuid primary key default gen_random_uuid(),
  partner_name text not null,
  external_conversion_id text not null,
  user_id uuid not null references public.profiles(id),
  offer_id uuid references public.offers(id),
  gross_amount numeric(12,2) not null default 0 check (gross_amount >= 0),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  currency text not null default 'BDT' check (currency = 'BDT'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  received_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(partner_name, external_conversion_id)
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  conversion_id uuid references public.partner_conversions(id),
  entry_type text not null check (entry_type in ('credit','debit','adjustment')),
  amount numeric(12,2) not null check (amount > 0),
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  amount numeric(12,2) not null check (amount > 0),
  payout_method text not null check (payout_method in ('bkash','nagad')),
  payout_account_ciphertext text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  paid_at timestamptz
);

create index if not exists conversions_user_status_idx on public.partner_conversions(user_id, status);
create index if not exists ledger_user_created_idx on public.ledger_entries(user_id, created_at desc);
create index if not exists withdrawals_user_created_idx on public.withdrawal_requests(user_id, created_at desc);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'); $$;

alter table public.profiles enable row level security;
alter table public.offers enable row level security;
alter table public.partner_conversions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.withdrawal_requests enable row level security;

drop policy if exists "profile read own or admin" on public.profiles;
create policy "profile read own or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profile update own basic fields" on public.profiles;
create policy "profile update own basic fields" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid() and role = 'member');

drop policy if exists "active offers readable" on public.offers;
create policy "active offers readable" on public.offers for select to authenticated
using (status = 'active' or public.is_admin());

drop policy if exists "conversions read own or admin" on public.partner_conversions;
create policy "conversions read own or admin" on public.partner_conversions for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "ledger read own or admin" on public.ledger_entries;
create policy "ledger read own or admin" on public.ledger_entries for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "withdrawals read own or admin" on public.withdrawal_requests;
create policy "withdrawals read own or admin" on public.withdrawal_requests for select to authenticated
using (user_id = auth.uid() or public.is_admin());

-- No client-side insert/update/delete policies for conversions or ledger entries.
-- Trusted server/webhook (service role) must verify partner signatures and write these rows.
-- Never expose the Supabase service-role key in browser code.

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
  v_earned numeric(12,2);
  v_reserved numeric(12,2);
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid amount'; end if;
  if p_method not in ('bkash','nagad') then raise exception 'Unsupported payout method'; end if;
  if p_account_ciphertext is null or length(p_account_ciphertext) < 16 then raise exception 'Encrypted payout details required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select coalesce(sum(case when entry_type = 'credit' then amount else -amount end),0)
    into v_earned from public.ledger_entries where user_id = v_user;

  select coalesce(sum(amount),0) into v_reserved
    from public.withdrawal_requests
    where user_id = v_user and status in ('pending','approved','paid');

  if p_amount > v_earned - v_reserved then raise exception 'Insufficient available balance'; end if;

  insert into public.withdrawal_requests(user_id, amount, payout_method, payout_account_ciphertext)
  values(v_user, p_amount, p_method, p_account_ciphertext)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.request_withdrawal(numeric,text,text) from public;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;

-- Create the first admin manually from a trusted SQL editor after the owner account is registered:
-- update public.profiles set role = 'admin' where id = '<AUTH_USER_UUID>';


-- Automatically create a member profile after a successful Supabase Auth signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
