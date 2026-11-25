-- Document and reassert the existing admin-only payout fee controls.
-- The fixed fee is snapshotted by request_withdrawal() into each new withdrawal.

create or replace function public.admin_get_member_payout_fee()
returns numeric
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  return (
    select coalesce(s.member_payout_fee_bdt, 0)
    from public.platform_settings s
    where s.id = true
  );
end;
$function$;

create or replace function public.admin_update_member_payout_fee(p_fee_bdt numeric)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;
  if p_fee_bdt is null or p_fee_bdt < 0 or p_fee_bdt > 100
     or round(p_fee_bdt, 2) <> p_fee_bdt then
    raise exception 'উত্তোলন চার্জ ০ থেকে ১০০ টাকার মধ্যে হতে হবে (সর্বোচ্চ ২ দশমিক)।';
  end if;

  update public.platform_settings
  set member_payout_fee_bdt = p_fee_bdt,
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
    jsonb_build_object(
      'fee_bdt', p_fee_bdt,
      'note', 'Fixed payout processing charge; member deduction at withdrawal only'
    )
  );
end;
$function$;

revoke all on function public.admin_get_member_payout_fee() from public, anon;
revoke all on function public.admin_update_member_payout_fee(numeric) from public, anon;
grant execute on function public.admin_get_member_payout_fee() to authenticated;
grant execute on function public.admin_update_member_payout_fee(numeric) to authenticated;
