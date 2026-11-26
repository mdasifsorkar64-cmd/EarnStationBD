-- EarnStationBD: fixed Primary + Backup Admin recovery
-- Test first. Production must remain untouched until separately approved.

create or replace function public.admin_promote_backup_admin()
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_caller_email text; v_backup_id uuid; v_backup_confirmed_at timestamptz; v_backup_status text;
begin
  if not public.is_admin() then raise exception 'Active Admin access required'; end if;
  select lower(u.email) into v_caller_email from auth.users u where u.id=auth.uid();
  if v_caller_email is distinct from 'mdasifsorkar64@gmail.com' then
    raise exception 'Only the Primary Admin can activate the fixed Backup Admin';
  end if;
  select u.id,u.email_confirmed_at,p.account_status into v_backup_id,v_backup_confirmed_at,v_backup_status
  from auth.users u join public.profiles p on p.id=u.id
  where lower(u.email)='mdasifsorkar1414@gmail.com' limit 1;
  if v_backup_id is null then raise exception 'Backup Admin must register first using the approved Gmail'; end if;
  if v_backup_confirmed_at is null then raise exception 'Backup Admin email must be confirmed first'; end if;
  if coalesce(v_backup_status,'active')<>'active' then raise exception 'Backup Admin account must be active before promotion'; end if;
  update public.profiles set role='admin' where id=v_backup_id and role='member';
  if not found and not exists(select 1 from public.profiles where id=v_backup_id and role='admin') then
    raise exception 'Backup Admin profile could not be promoted';
  end if;
  insert into public.admin_audit_log(admin_id,action,details)
  values(auth.uid(),'backup_admin_activated',jsonb_build_object('backup_admin_email','mdasifsorkar1414@gmail.com','backup_admin_id',v_backup_id));
end; $$;

create or replace function public.backup_admin_recover_primary()
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_caller_email text; v_primary_id uuid;
begin
  if not public.is_admin() then raise exception 'Active Backup Admin access required'; end if;
  select lower(u.email) into v_caller_email from auth.users u where u.id=auth.uid();
  if v_caller_email is distinct from 'mdasifsorkar1414@gmail.com' then
    raise exception 'Only the fixed Backup Admin can recover the Primary Admin';
  end if;
  select u.id into v_primary_id from auth.users u where lower(u.email)='mdasifsorkar64@gmail.com' limit 1;
  if v_primary_id is null then raise exception 'Primary Admin Auth account was not found; use Supabase Project Owner recovery'; end if;
  update public.profiles set role='admin',account_status='active' where id=v_primary_id;
  if not found then raise exception 'Primary Admin profile was not found; use Supabase Project Owner recovery'; end if;
  insert into public.admin_audit_log(admin_id,action,details)
  values(auth.uid(),'primary_admin_recovered',jsonb_build_object('primary_admin_email','mdasifsorkar64@gmail.com','primary_admin_id',v_primary_id));
end; $$;

revoke all on function public.admin_promote_backup_admin() from public,anon;
grant execute on function public.admin_promote_backup_admin() to authenticated;
revoke all on function public.backup_admin_recover_primary() from public,anon;
grant execute on function public.backup_admin_recover_primary() to authenticated;
