-- EarnStationBD prelaunch: 60/40 commission allocation + verified AdGem v3 event inbox.
-- Run only after the previously applied partner_commission_verification.sql.
-- No real conversion or earning is created by this migration.

alter table public.platform_settings
  add column if not exists member_reward_percent integer not null default 60;

alter table public.platform_settings
  drop constraint if exists platform_settings_member_reward_percent_check;
alter table public.platform_settings
  add constraint platform_settings_member_reward_percent_check
  check (member_reward_percent between 1 and 99);

create table if not exists public.partner_commission_allocations (
  conversion_id uuid primary key references public.partner_conversions(id) on delete restrict,
  partner_gross_bdt numeric(12,2) not null check (partner_gross_bdt > 0),
  member_reward_bdt numeric(12,2) not null check (member_reward_bdt > 0),
  owner_share_bdt numeric(12,2) not null check (owner_share_bdt >= 0),
  member_reward_percent integer not null check (member_reward_percent between 1 and 99),
  partner_payment_status text not null default 'awaiting_partner_payment'
    check (partner_payment_status in ('awaiting_partner_payment','received','reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (round(member_reward_bdt + owner_share_bdt, 2) = partner_gross_bdt)
);
alter table public.partner_commission_allocations enable row level security;
revoke all on public.partner_commission_allocations from anon, authenticated;

-- Secure inbox for signed AdGem callbacks. The callback records payout in USD;
-- it does NOT directly credit a member or convert USD to BDT.
create table if not exists public.partner_postback_events (
  id bigint generated always as identity primary key,
  partner_name text not null default 'AdGem',
  request_id text not null,
  external_conversion_id text not null,
  player_id uuid not null references public.profiles(id),
  app_id text not null,
  campaign_id text,
  offer_id text,
  conversion_type text not null check (conversion_type = 'reward'),
  virtual_amount numeric(18,4) not null default 0 check (virtual_amount >= 0),
  payout_usd numeric(12,6) not null check (payout_usd > 0),
  event_timestamp timestamptz not null,
  event_status text not null default 'verified_pending_reconciliation'
    check (event_status in ('verified_pending_reconciliation','reconciled','rejected')),
  received_at timestamptz not null default now(),
  unique(partner_name, request_id),
  unique(partner_name, external_conversion_id)
);
alter table public.partner_postback_events enable row level security;
revoke all on public.partner_postback_events from anon, authenticated;
grant all on public.partner_postback_events to service_role;

create or replace function public.admin_get_commission_split()
returns table(member_reward_percent integer, owner_share_percent integer)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query select s.member_reward_percent, 100-s.member_reward_percent
    from public.platform_settings s where s.id=true;
end;
$$;

create or replace function public.admin_update_commission_split(p_member_reward_percent integer)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_member_reward_percent is null or p_member_reward_percent not between 1 and 99 then
    raise exception 'Member reward percent must be between 1 and 99';
  end if;
  update public.platform_settings
     set member_reward_percent=p_member_reward_percent,
         updated_at=now(), updated_by=auth.uid()
   where id=true;
  insert into public.admin_audit_log(admin_id,action,details)
  values(auth.uid(),'commission_split_updated',
    jsonb_build_object('member_reward_percent',p_member_reward_percent,
                       'owner_share_percent',100-p_member_reward_percent));
end;
$$;

create or replace function public.admin_get_partner_postback_events()
returns table(
  id bigint, partner_name text, external_conversion_id text, player_id uuid,
  payout_usd numeric, virtual_amount numeric, event_status text,
  event_timestamp timestamptz, received_at timestamptz
)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
    select e.id,e.partner_name,e.external_conversion_id,e.player_id,
           e.payout_usd,e.virtual_amount,e.event_status,e.event_timestamp,e.received_at
      from public.partner_postback_events e
     order by e.received_at desc limit 100;
end;
$$;

-- For manually reconciled, confirmed BDT conversion records:
-- commission_amount means partner gross commission, not member reward.
-- The member receives only the configured percentage; remainder is owner share.
create or replace function public.admin_review_conversion(
  p_conversion_id uuid,
  p_decision text,
  p_note text default ''
) returns void
language plpgsql security definer set search_path=public
as $$
declare
  v_conversion public.partner_conversions%rowtype;
  v_member_percent integer;
  v_member_reward numeric(12,2);
  v_owner_share numeric(12,2);
  v_ledger_user uuid;
  v_ledger_amount numeric(12,2);
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_conversion_id is null or p_decision is null
     or p_decision not in ('approved','rejected') then
    raise exception 'Invalid conversion decision';
  end if;

  select * into v_conversion from public.partner_conversions
   where id=p_conversion_id for update;
  if not found then raise exception 'Conversion not found'; end if;
  if v_conversion.status <> 'pending' then raise exception 'Conversion already reviewed'; end if;

  if p_decision='approved' then
    if v_conversion.commission_amount is null or v_conversion.commission_amount<=0
       or v_conversion.currency<>'BDT'
       or nullif(btrim(v_conversion.partner_name),'') is null
       or nullif(btrim(v_conversion.external_conversion_id),'') is null then
      raise exception 'A verified positive BDT gross commission and partner reference are required';
    end if;
    if not exists(select 1 from public.profiles p
      where p.id=v_conversion.user_id and p.role='member'
        and coalesce(p.account_status,'active')='active') then
      raise exception 'Member account is not active';
    end if;

    select s.member_reward_percent into v_member_percent
      from public.platform_settings s where s.id=true;
    if v_member_percent is null then v_member_percent:=60; end if;
    v_member_reward:=round(v_conversion.commission_amount*v_member_percent/100.0,2);
    v_owner_share:=v_conversion.commission_amount-v_member_reward;
    if v_member_reward<=0 then raise exception 'Calculated member reward must be positive'; end if;

    insert into public.ledger_entries
      (user_id,conversion_id,entry_type,amount,description,is_test)
    values(v_conversion.user_id,v_conversion.id,'credit',v_member_reward,
      'পার্টনার কমিশন থেকে সদস্যের রিওয়ার্ড ('||v_member_percent||'%) · '||v_conversion.partner_name,false)
    on conflict do nothing;

    select le.user_id,le.amount into v_ledger_user,v_ledger_amount
      from public.ledger_entries le
     where le.conversion_id=v_conversion.id and le.entry_type='credit' limit 1;
    if not found or v_ledger_user<>v_conversion.user_id
       or v_ledger_amount<>v_member_reward then
      raise exception 'Existing conversion credit does not match split; manual investigation required';
    end if;

    insert into public.partner_commission_allocations
      (conversion_id,partner_gross_bdt,member_reward_bdt,owner_share_bdt,member_reward_percent)
    values(v_conversion.id,v_conversion.commission_amount,v_member_reward,v_owner_share,v_member_percent)
    on conflict(conversion_id) do nothing;

    if not exists(select 1 from public.partner_commission_allocations a
      where a.conversion_id=v_conversion.id
        and a.partner_gross_bdt=v_conversion.commission_amount
        and a.member_reward_bdt=v_member_reward
        and a.owner_share_bdt=v_owner_share
        and a.member_reward_percent=v_member_percent) then
      raise exception 'Existing commission allocation differs; manual investigation required';
    end if;
  end if;

  update public.partner_conversions
     set status=p_decision,reviewed_at=now(),reviewed_by=auth.uid(),
         review_note=left(coalesce(p_note,''),1000)
   where id=v_conversion.id;

  insert into public.admin_audit_log(admin_id,action,details)
  values(auth.uid(),'partner_conversion_'||p_decision,
    jsonb_build_object('conversion_id',v_conversion.id,'partner',v_conversion.partner_name,
      'external_conversion_id',v_conversion.external_conversion_id,'user_id',v_conversion.user_id,
      'partner_gross_bdt',v_conversion.commission_amount,
      'member_reward_bdt',case when p_decision='approved' then v_member_reward else 0 end,
      'owner_share_bdt',case when p_decision='approved' then v_owner_share else 0 end,
      'member_reward_percent',case when p_decision='approved' then v_member_percent else null end,
      'note',left(coalesce(p_note,''),1000)));
end;
$$;

revoke all on function public.admin_get_commission_split() from public,anon;
grant execute on function public.admin_get_commission_split() to authenticated;
revoke all on function public.admin_update_commission_split(integer) from public,anon;
grant execute on function public.admin_update_commission_split(integer) to authenticated;
revoke all on function public.admin_get_partner_postback_events() from public,anon;
grant execute on function public.admin_get_partner_postback_events() to authenticated;
revoke all on function public.admin_review_conversion(uuid,text,text) from public,anon;
grant execute on function public.admin_review_conversion(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
