-- EarnStationBD: simple online/offline member presence
-- Run this SQL in Supabase SQL Editor after deploying the frontend files.

create table if not exists public.member_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.member_presence enable row level security;
revoke all on table public.member_presence from anon, authenticated;

create or replace function public.member_presence_heartbeat()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'লগইন করে আবার চেষ্টা করুন।';
  end if;

  insert into public.member_presence(user_id,last_seen_at)
  select p.id,now()
  from public.profiles p
  where p.id=auth.uid()
    and p.role='member'
    and coalesce(p.account_status,'active')='active'
  on conflict(user_id) do update set last_seen_at=excluded.last_seen_at;

  if not found then
    raise exception 'সক্রিয় সদস্য অ্যাকাউন্ট পাওয়া যায়নি।';
  end if;
end;
$$;

revoke all on function public.member_presence_heartbeat() from public, anon;
grant execute on function public.member_presence_heartbeat() to authenticated;

create or replace function public.admin_get_member_presence()
returns table (
  user_id uuid,
  full_name text,
  phone text,
  last_seen_at timestamptz,
  is_online boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'শুধু অ্যাডমিন এই তথ্য দেখতে পারবেন।';
  end if;

  return query
  select p.id,p.full_name,p.phone,mp.last_seen_at,
    coalesce(mp.last_seen_at >= now() - interval '90 seconds',false) as is_online
  from public.profiles p
  left join public.member_presence mp on mp.user_id=p.id
  where p.role='member'
  order by coalesce(mp.last_seen_at,'epoch'::timestamptz) desc,p.created_at desc;
end;
$$;

revoke all on function public.admin_get_member_presence() from public, anon, authenticated;
grant execute on function public.admin_get_member_presence() to authenticated;

notify pgrst, 'reload schema';
