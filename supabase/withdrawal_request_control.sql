-- Admin-controlled member withdrawal request intake.
-- Apply to TEST first. Default remains OFF until a verified payout workflow is ready.
alter table public.platform_settings
  add column if not exists withdrawals_enabled boolean not null default false;

create or replace function public.enforce_withdrawals_enabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  select coalesce(s.withdrawals_enabled, false)
    into v_enabled
  from public.platform_settings s
  where s.id = true;

  if not coalesce(v_enabled, false) then
    raise exception 'withdrawals_paused'
      using errcode = '55000',
            detail = 'নতুন উত্তোলনের আবেদন বর্তমানে বন্ধ আছে। পরে আবার চেষ্টা করুন।';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_withdrawals_enabled() from public, anon, authenticated;
drop trigger if exists trg_enforce_withdrawals_enabled on public.withdrawal_requests;
create trigger trg_enforce_withdrawals_enabled
before insert on public.withdrawal_requests
for each row execute function public.enforce_withdrawals_enabled();

create or replace function public.admin_get_withdrawal_control()
returns table(withdrawals_enabled boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query
  select coalesce(s.withdrawals_enabled, false), s.updated_at
  from public.platform_settings s
  where s.id = true;
end;
$$;

create or replace function public.admin_set_withdrawals_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'A valid on/off value is required';
  end if;
  update public.platform_settings
  set withdrawals_enabled = p_enabled,
      updated_at = now(),
      updated_by = auth.uid()
  where id = true;
  if not found then
    raise exception 'platform_settings_missing';
  end if;
  insert into public.admin_audit_log(admin_id, action, details)
  values (auth.uid(), 'withdrawal_requests_toggled', jsonb_build_object('enabled', p_enabled));
end;
$$;

revoke all on function public.admin_get_withdrawal_control() from public, anon;
revoke all on function public.admin_set_withdrawals_enabled(boolean) from public, anon;
grant execute on function public.admin_get_withdrawal_control() to authenticated;
grant execute on function public.admin_set_withdrawals_enabled(boolean) to authenticated;

notify pgrst, 'reload schema';
