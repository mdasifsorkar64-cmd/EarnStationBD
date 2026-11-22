-- EarnStationBD: idempotent, admin-verified partner commission posting.
-- Apply in Supabase SQL Editor after schema.sql, admin_security.sql,
-- admin_control_center.sql, and member_inbox.sql.
-- This does NOT accept partner callbacks or create unverified conversions.
-- A commission is credited only after an authenticated admin approves a pending conversion.

alter table public.partner_conversions
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists review_note text not null default '';

-- A conversion can create at most one credit ledger row.
create unique index if not exists ledger_one_credit_per_conversion
  on public.ledger_entries(conversion_id)
  where conversion_id is not null and entry_type = 'credit';

create or replace function public.admin_review_conversion(
  p_conversion_id uuid,
  p_decision text,
  p_note text default ''
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversion public.partner_conversions%rowtype;
  v_ledger_user uuid;
  v_ledger_amount numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_conversion_id is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid conversion decision';
  end if;

  select *
    into v_conversion
    from public.partner_conversions
   where id = p_conversion_id
   for update;

  if not found then
    raise exception 'Conversion not found';
  end if;

  if v_conversion.status <> 'pending' then
    raise exception 'Conversion already reviewed';
  end if;

  if p_decision = 'approved' then
    if v_conversion.commission_amount is null
       or v_conversion.commission_amount <= 0
       or v_conversion.currency <> 'BDT'
       or nullif(btrim(v_conversion.partner_name), '') is null
       or nullif(btrim(v_conversion.external_conversion_id), '') is null then
      raise exception 'A valid positive BDT commission and partner reference are required';
    end if;

    if not exists (
      select 1
        from public.profiles p
       where p.id = v_conversion.user_id
         and p.role = 'member'
         and coalesce(p.account_status, 'active') = 'active'
    ) then
      raise exception 'Member account is not active';
    end if;

    -- Unique index + transaction lock prevent duplicate commission credits.
    -- The ledger insert trigger creates the member inbox item automatically.
    insert into public.ledger_entries
      (user_id, conversion_id, entry_type, amount, description, is_test)
    values
      (v_conversion.user_id,
       v_conversion.id,
       'credit',
       v_conversion.commission_amount,
       'অনুমোদিত পার্টনার কমিশন · ' || v_conversion.partner_name,
       false)
    on conflict do nothing;

    -- If a credit already existed, it must exactly match this conversion.
    select le.user_id, le.amount
      into v_ledger_user, v_ledger_amount
      from public.ledger_entries le
     where le.conversion_id = v_conversion.id
       and le.entry_type = 'credit'
     limit 1;

    if not found
       or v_ledger_user <> v_conversion.user_id
       or v_ledger_amount <> v_conversion.commission_amount then
      raise exception 'Existing conversion credit does not match; manual investigation required';
    end if;
  end if;

  update public.partner_conversions
     set status = p_decision,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_note = left(coalesce(p_note, ''), 1000)
   where id = v_conversion.id;

  insert into public.admin_audit_log(admin_id, action, details)
  values (
    auth.uid(),
    'partner_conversion_' || p_decision,
    jsonb_build_object(
      'conversion_id', v_conversion.id,
      'partner_name', v_conversion.partner_name,
      'external_conversion_id', v_conversion.external_conversion_id,
      'user_id', v_conversion.user_id,
      'commission_amount', v_conversion.commission_amount,
      'currency', v_conversion.currency,
      'note', left(coalesce(p_note, ''), 1000)
    )
  );
end;
$$;

revoke all on function public.admin_review_conversion(uuid,text,text) from public, anon;
grant execute on function public.admin_review_conversion(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
