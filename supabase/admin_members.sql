-- EarnStationBD: secure admin-only member directory
-- Run once in Supabase SQL Editor. Never returns passwords, OTPs, or session tokens.
create or replace function public.admin_list_members(p_search text default '')
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(p.full_name, '')::text,
    p.phone::text,
    p.role::text,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where coalesce(p_search, '') = ''
     or coalesce(u.email, '') ilike '%' || p_search || '%'
     or coalesce(p.full_name, '') ilike '%' || p_search || '%'
     or coalesce(p.phone, '') ilike '%' || p_search || '%'
     or u.id::text ilike '%' || p_search || '%'
  order by u.created_at desc
  limit 300;
end;
$$;

revoke all on function public.admin_list_members(text) from public;
grant execute on function public.admin_list_members(text) to authenticated;
