-- Add a dedicated admin control for the fixed member withdrawal fee.
-- The existing request_withdrawal() already reads platform_settings.member_payout_fee_bdt
-- and snapshots the fee/net amount into each new withdrawal request.

create or replace function public.admin_get_member_payout_fee()
returns numeric
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_fee numeric;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select coalesce(s.member_payout_fee_bdt, 0)
    into v_fee
  from public.platform_settings s
  where s.id = true;

  return coalesce(v_fee, 0);
end;
$function$;

create or replace function public.admin_update_member_payout_fee(p_fee numeric)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_fee is null or p_fee < 0 or p_fee > 100 then
    raise exception 'উত্তোলন চার্জ ০ থেকে ১০০ টাকার মধ্যে হতে হবে।';
  end if;

  update public.platform_settings
  set member_payout_fee_bdt = round(p_fee, 2),
      updated_at = now(),
      updated_by = auth.uid()
  where id = true;

  if not found then
    raise exception 'Platform settings row not found';
  end if;

  insert into public.admin_audit_log(admin_id, action, details)
  values (
    auth.uid(),
    'member_payout_fee_updated',
    jsonb_build_object('member_payout_fee_bdt', round(p_fee, 2))
  );
end;
$function$;

revoke all on function public.admin_get_member_payout_fee() from public, anon;
revoke all on function public.admin_update_member_payout_fee(numeric) from public, anon;
grant execute on function public.admin_get_member_payout_fee() to authenticated;
grant execute on function public.admin_update_member_payout_fee(numeric) to authenticated;
