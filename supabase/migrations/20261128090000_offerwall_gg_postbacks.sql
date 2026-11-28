-- Offerwall.GG signed conversion callbacks.
-- Apply only after reviewing this migration; it is not executed by this branch deployment.

create schema if not exists private;

create table if not exists private.offerwall_gg_postback_events (
  id bigint generated always as identity primary key,
  transaction_id text not null,
  event_status text not null check (event_status in ('credited','reversed','test')),
  user_id uuid,
  amount numeric(14,4) not null,
  currency_name text not null,
  offer_id text not null default '',
  offer_name text not null default '',
  payout_usd numeric(14,6) not null default 0,
  conversion_id uuid references public.partner_conversions(id) on delete restrict,
  processing_status text not null,
  received_at timestamptz not null default now(),
  constraint offerwall_gg_postback_events_transaction_status_key unique (transaction_id,event_status)
);

alter table private.offerwall_gg_postback_events enable row level security;
revoke all on table private.offerwall_gg_postback_events from anon, authenticated, public;

create or replace function public.offerwall_gg_process_postback(
  p_user_id uuid,
  p_transaction_id text,
  p_amount numeric,
  p_status text,
  p_offer_id text default '',
  p_offer_name text default '',
  p_currency_name text default 'BDT',
  p_payout_usd numeric default 0,
  p_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  v_event_status text;
  v_event_id bigint;
  v_conversion public.partner_conversions%rowtype;
  v_allocation public.partner_commission_allocations%rowtype;
  v_credit public.ledger_entries%rowtype;
begin
  if p_user_id is null
     or p_transaction_id is null
     or length(p_transaction_id) not between 1 and 64
     or p_amount is null
     or p_currency_name <> 'BDT'
     or p_status not in ('credited','reversed') then
    raise exception 'Invalid Offerwall.GG callback payload';
  end if;

  v_event_status := case when coalesce(p_test,false) then 'test' else p_status end;

  insert into private.offerwall_gg_postback_events
    (transaction_id,event_status,user_id,amount,currency_name,offer_id,offer_name,payout_usd,processing_status)
  values
    (p_transaction_id,v_event_status,p_user_id,p_amount,p_currency_name,
     left(coalesce(p_offer_id,''),120),left(coalesce(p_offer_name,''),240),
     coalesce(p_payout_usd,0),case when p_test then 'test_ignored' else 'received' end)
  on conflict (transaction_id,event_status) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('ok',true,'duplicate',true,'credited',false);
  end if;

  if p_test then
    return jsonb_build_object('ok',true,'test',true,'credited',false);
  end if;

  if p_status='credited' then
    if p_amount <= 0 or round(p_amount,2) <= 0 then raise exception 'Credited amount must be positive after BDT rounding'; end if;

    if exists (
      select 1 from private.offerwall_gg_postback_events
      where transaction_id=p_transaction_id and event_status='reversed'
    ) then
      update private.offerwall_gg_postback_events
        set processing_status='reversal_received_before_credit'
      where id=v_event_id;
      return jsonb_build_object('ok',true,'credited',false,'reason','reversed_before_credit');
    end if;

    if not exists (
      select 1 from public.profiles
      where id=p_user_id and role='member' and account_status='active'
    ) then
      update private.offerwall_gg_postback_events
        set processing_status='unknown_or_inactive_member'
      where id=v_event_id;
      return jsonb_build_object('ok',true,'credited',false,'reason','unknown_or_inactive_member');
    end if;

    insert into public.partner_conversions
      (partner_name,external_conversion_id,user_id,gross_amount,commission_amount,currency,status,review_note)
    values
      ('Offerwall.GG',p_transaction_id,p_user_id,round(p_amount,2),round(p_amount,2),'BDT','pending','Signed Offerwall.GG callback; admin review required.')
    on conflict (partner_name,external_conversion_id) do nothing
    returning * into v_conversion;

    if v_conversion.id is null then
      update private.offerwall_gg_postback_events
        set processing_status='conversion_already_exists'
      where id=v_event_id;
      return jsonb_build_object('ok',true,'duplicate',true,'credited',false);
    end if;

    update private.offerwall_gg_postback_events
      set conversion_id=v_conversion.id,processing_status='pending_admin_review'
    where id=v_event_id;

    return jsonb_build_object('ok',true,'credited',false,'pending_admin_review',true);
  end if;

  if p_status='reversed' then
    if p_amount >= 0 then raise exception 'Reversal amount must be negative'; end if;

    select * into v_conversion
      from public.partner_conversions
     where partner_name='Offerwall.GG' and external_conversion_id=p_transaction_id
     for update;

    if not found then
      update private.offerwall_gg_postback_events
        set processing_status='reversal_without_original_conversion'
      where id=v_event_id;
      return jsonb_build_object('ok',true,'credited',false,'reason','original_conversion_not_found');
    end if;

    if round(abs(p_amount),2) <> round(v_conversion.commission_amount,2) then
      update private.offerwall_gg_postback_events
        set conversion_id=v_conversion.id,processing_status='amount_mismatch_manual_review'
      where id=v_event_id;
      return jsonb_build_object('ok',true,'credited',false,'reason','amount_mismatch_manual_review');
    end if;

    if v_conversion.status='approved' then
      select * into v_allocation
        from public.partner_commission_allocations
       where conversion_id=v_conversion.id
       for update;
      if not found then raise exception 'Approved conversion allocation missing; manual review required'; end if;

      select * into v_credit
        from public.ledger_entries
       where conversion_id=v_conversion.id and entry_type='credit' and is_test=false
       order by created_at asc limit 1
       for update;
      if not found or v_credit.user_id<>v_conversion.user_id
         or v_credit.amount<>v_allocation.member_reward_bdt then
        raise exception 'Approved conversion credit mismatch; manual review required';
      end if;

      insert into public.ledger_entries
        (user_id,conversion_id,entry_type,amount,description,is_test)
      values
        (v_conversion.user_id,v_conversion.id,'debit',v_allocation.member_reward_bdt,
         'Offerwall.GG reversal · '||p_transaction_id,false);

      update public.partner_commission_allocations
         set partner_payment_status='reversed',updated_at=now()
       where conversion_id=v_conversion.id;
    end if;

    update public.partner_conversions
       set status='rejected',reviewed_at=now(),reviewed_by=null,
           review_note=left('Offerwall.GG reversal received for transaction '||p_transaction_id,1000)
     where id=v_conversion.id;

    update private.offerwall_gg_postback_events
       set conversion_id=v_conversion.id,processing_status='reversal_applied'
     where id=v_event_id;

    return jsonb_build_object('ok',true,'reversal_applied',true);
  end if;

  raise exception 'Unsupported Offerwall.GG callback status';
end;
$function$;

revoke all on function public.offerwall_gg_process_postback(uuid,text,numeric,text,text,text,text,numeric,boolean) from public, anon, authenticated;
grant execute on function public.offerwall_gg_process_postback(uuid,text,numeric,text,text,text,text,numeric,boolean) to service_role;
