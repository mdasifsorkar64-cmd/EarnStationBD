-- EarnStationBD admin control center extension
-- Run in Supabase SQL Editor after existing admin and earning migrations.

alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check check (account_status in ('active','suspended'));

create table if not exists public.site_settings (
 id boolean primary key default true check(id=true),
 site_name text not null default 'EarnStationBD',
 site_tagline text not null default 'বাংলা-প্রথম আয়ের প্ল্যাটফর্ম',
 announcement text not null default '',
 contact_email text,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
insert into public.site_settings(id) values(true) on conflict(id) do nothing;
alter table public.site_settings enable row level security;

create table if not exists public.admin_audit_log (
 id bigint generated always as identity primary key,
 admin_id uuid references auth.users(id),
 action text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;

create or replace function public.admin_set_member_status(p_user_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public
as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if p_status not in ('active','suspended') then raise exception 'Invalid member status'; end if;
 if p_user_id=auth.uid() then raise exception 'নিজের অ্যাকাউন্ট Suspend করা যাবে না'; end if;
 update public.profiles set account_status=p_status where id=p_user_id and role='member';
 if not found then raise exception 'Member not found or cannot be changed'; end if;
 insert into public.admin_audit_log(admin_id,action,details)
 values(auth.uid(),'member_status_changed',jsonb_build_object('user_id',p_user_id,'status',p_status));
end; $$;

create or replace function public.admin_get_site_settings()
returns table(site_name text,site_tagline text,announcement text,contact_email text)
language plpgsql security definer set search_path=public
as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 return query select s.site_name,s.site_tagline,s.announcement,s.contact_email from public.site_settings s where s.id=true;
end; $$;

create or replace function public.admin_update_site_settings(p_site_name text,p_site_tagline text,p_announcement text,p_contact_email text)
returns void language plpgsql security definer set search_path=public
as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if length(trim(coalesce(p_site_name,''))) not between 2 and 80 then raise exception 'সাইটের নাম ২-৮০ অক্ষরের হতে হবে'; end if;
 if length(coalesce(p_site_tagline,''))>180 or length(coalesce(p_announcement,''))>1000 then raise exception 'লেখার সীমা অতিক্রম করেছে'; end if;
 update public.site_settings set site_name=trim(p_site_name),site_tagline=coalesce(p_site_tagline,''),announcement=coalesce(p_announcement,''),contact_email=p_contact_email,updated_at=now(),updated_by=auth.uid() where id=true;
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'site_settings_updated',jsonb_build_object('site_name',p_site_name,'announcement_changed',p_announcement is not null));
end; $$;

create or replace function public.admin_get_audit_log()
returns table(action text,details jsonb,created_at timestamptz)
language plpgsql security definer set search_path=public
as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 return query select l.action,l.details,l.created_at from public.admin_audit_log l order by l.created_at desc limit 50;
end; $$;

revoke all on function public.admin_set_member_status(uuid,text) from public;
grant execute on function public.admin_set_member_status(uuid,text) to authenticated;
revoke all on function public.admin_get_site_settings() from public;
grant execute on function public.admin_get_site_settings() to authenticated;
revoke all on function public.admin_update_site_settings(text,text,text,text) from public;
grant execute on function public.admin_update_site_settings(text,text,text,text) to authenticated;
revoke all on function public.admin_get_audit_log() from public;
grant execute on function public.admin_get_audit_log() to authenticated;

notify pgrst,'reload schema';
