-- EarnStationBD: allow exactly two owner-controlled Admin identities in TEST.
-- Backup Admin must first sign up and verify email.
create table if not exists public.admin_email_allowlist (
 email text primary key,
 admin_kind text not null check (admin_kind in ('primary','backup')),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 constraint admin_email_allowlist_exact_emails check (email in ('mdasifsorkar64@gmail.com','mdasifsorkar1414@gmail.com')),
 constraint admin_email_allowlist_kind_email check (
  (email='mdasifsorkar64@gmail.com' and admin_kind='primary') or
  (email='mdasifsorkar1414@gmail.com' and admin_kind='backup')
 )
);
alter table public.admin_email_allowlist enable row level security;
revoke all on table public.admin_email_allowlist from public,anon,authenticated;
insert into public.admin_email_allowlist(email,admin_kind,enabled)
values ('mdasifsorkar64@gmail.com','primary',true),('mdasifsorkar1414@gmail.com','backup',true)
on conflict(email) do update set admin_kind=excluded.admin_kind,enabled=true;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public,auth
as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
 join public.admin_email_allowlist a on a.email=lower(u.email)
 where p.id=auth.uid() and a.enabled and p.role='admin' and coalesce(p.account_status,'active')='active');
$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_get_backup_admin_status()
returns table(backup_email text,registered boolean,email_confirmed boolean,profile_role text,account_status text,can_activate boolean,can_recover_primary boolean)
language plpgsql security definer set search_path=public,auth
as $$
declare v_caller_email text; v_user_id uuid; v_confirmed boolean; v_role text; v_status text;
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 select lower(u.email) into v_caller_email from auth.users u where u.id=auth.uid();
 select u.id,(u.email_confirmed_at is not null),p.role,p.account_status into v_user_id,v_confirmed,v_role,v_status
 from auth.users u left join public.profiles p on p.id=u.id where lower(u.email)='mdasifsorkar1414@gmail.com' limit 1;
 return query select 'mdasifsorkar1414@gmail.com'::text,v_user_id is not null,coalesce(v_confirmed,false),v_role,v_status,
 v_caller_email='mdasifsorkar64@gmail.com' and v_user_id is not null and coalesce(v_confirmed,false),
 v_caller_email='mdasifsorkar1414@gmail.com';
end; $$;
revoke all on function public.admin_get_backup_admin_status() from public,anon;
grant execute on function public.admin_get_backup_admin_status() to authenticated;

create or replace function public.admin_activate_backup_admin()
returns void language plpgsql security definer set search_path=public,auth
as $$
declare v_caller_email text; v_backup_id uuid;
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 select lower(u.email) into v_caller_email from auth.users u where u.id=auth.uid();
 if v_caller_email<>'mdasifsorkar64@gmail.com' then raise exception 'শুধু Primary Admin Backup Admin সক্রিয় করতে পারবেন' using errcode='42501'; end if;
 select u.id into v_backup_id from auth.users u where lower(u.email)='mdasifsorkar1414@gmail.com' and u.email_confirmed_at is not null limit 1;
 if v_backup_id is null then raise exception 'Backup Gmail দিয়ে আগে নিবন্ধন ও ইমেইল যাচাই সম্পন্ন করুন'; end if;
 update public.profiles set role='admin',account_status='active' where id=v_backup_id;
 if not found then raise exception 'Backup profile তৈরি হয়নি; আগে অ্যাকাউন্টে একবার লগইন করুন'; end if;
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'backup_admin_activated',jsonb_build_object('backup_email','mdasifsorkar1414@gmail.com','backup_user_id',v_backup_id));
end; $$;
revoke all on function public.admin_activate_backup_admin() from public,anon;
grant execute on function public.admin_activate_backup_admin() to authenticated;

create or replace function public.admin_recover_primary_admin()
returns void language plpgsql security definer set search_path=public,auth
as $$
declare v_caller_email text; v_primary_id uuid;
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 select lower(u.email) into v_caller_email from auth.users u where u.id=auth.uid();
 if v_caller_email<>'mdasifsorkar1414@gmail.com' then raise exception 'শুধু Backup Admin এই জরুরি পুনরুদ্ধার করতে পারবেন' using errcode='42501'; end if;
 select u.id into v_primary_id from auth.users u where lower(u.email)='mdasifsorkar64@gmail.com' limit 1;
 if v_primary_id is null then raise exception 'Primary Admin Auth account not found'; end if;
 update public.profiles set role='admin',account_status='active' where id=v_primary_id;
 if not found then raise exception 'Primary Admin profile not found'; end if;
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'primary_admin_recovered',jsonb_build_object('primary_email','mdasifsorkar64@gmail.com','primary_user_id',v_primary_id));
end; $$;
revoke all on function public.admin_recover_primary_admin() from public,anon;
grant execute on function public.admin_recover_primary_admin() to authenticated;
