-- Admin-controlled withdrawal intake and member-facing announcement.
-- Apply to TEST first. Withdrawal intake defaults to OFF until a verified payout workflow is ready.
alter table public.platform_settings
  add column if not exists withdrawals_enabled boolean not null default false,
  add column if not exists withdrawal_announcement text not null default '';

alter table public.platform_settings
  drop constraint if exists platform_settings_withdrawal_announcement_length;
alter table public.platform_settings
  add constraint platform_settings_withdrawal_announcement_length
  check (char_length(withdrawal_announcement) <= 500);

create or replace function public.enforce_withdrawals_enabled()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_enabled boolean;
begin
  select coalesce(s.withdrawals_enabled,false) into v_enabled
  from public.platform_settings s where s.id=true;
  if not coalesce(v_enabled,false) then
    raise exception 'withdrawals_paused'
      using errcode='55000',
            detail='নতুন উত্তোলনের আবেদন বর্তমানে বন্ধ আছে। পরে আবার চেষ্টা করুন।';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_withdrawals_enabled() from public,anon,authenticated;
drop trigger if exists trg_enforce_withdrawals_enabled on public.withdrawal_requests;
create trigger trg_enforce_withdrawals_enabled
before insert on public.withdrawal_requests
for each row execute function public.enforce_withdrawals_enabled();

drop function if exists public.admin_set_withdrawals_enabled(boolean);
drop function if exists public.admin_get_withdrawal_control();
create function public.admin_get_withdrawal_control()
returns table(withdrawals_enabled boolean,withdrawal_announcement text,updated_at timestamptz)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  return query select coalesce(s.withdrawals_enabled,false),coalesce(s.withdrawal_announcement,''),s.updated_at
  from public.platform_settings s where s.id=true;
end;
$$;

create function public.admin_set_withdrawals_enabled(p_enabled boolean,p_announcement text)
returns void language plpgsql security definer set search_path=public
as $$
declare v_announcement text:=coalesce(btrim(p_announcement),'');
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'A valid on/off value is required'; end if;
  if char_length(v_announcement)>500 then raise exception 'ঘোষণা সর্বোচ্চ ৫০০ অক্ষরের হতে পারবে।'; end if;
  update public.platform_settings
  set withdrawals_enabled=p_enabled,withdrawal_announcement=v_announcement,updated_at=now(),updated_by=auth.uid()
  where id=true;
  if not found then raise exception 'platform_settings_missing'; end if;
  insert into public.admin_audit_log(admin_id,action,details)
  values(auth.uid(),'withdrawal_requests_toggled',jsonb_build_object('enabled',p_enabled,'announcement',v_announcement));
end;
$$;

create or replace function public.get_withdrawal_notice()
returns table(withdrawals_enabled boolean,withdrawal_announcement text)
language sql stable security definer set search_path=public
as $$
  select coalesce(s.withdrawals_enabled,false),coalesce(s.withdrawal_announcement,'')
  from public.platform_settings s where s.id=true;
$$;

revoke all on function public.admin_get_withdrawal_control() from public,anon;
revoke all on function public.admin_set_withdrawals_enabled(boolean,text) from public,anon;
revoke all on function public.get_withdrawal_notice() from public,anon;
grant execute on function public.admin_get_withdrawal_control() to authenticated;
grant execute on function public.admin_set_withdrawals_enabled(boolean,text) to authenticated;
grant execute on function public.get_withdrawal_notice() to authenticated;

notify pgrst,'reload schema';
