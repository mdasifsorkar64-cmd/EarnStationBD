create or replace function public.admin_review_conversion(p_conversion_id uuid,p_decision text,p_note text default '')
returns void language plpgsql security definer set search_path=public as $$
declare
 v_conversion public.partner_conversions%rowtype;
 v_member_percent integer;
 v_member_reward numeric(12,2);
 v_owner_share numeric(12,2);
 v_ledger_user uuid;
 v_ledger_amount numeric(12,2);
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if p_conversion_id is null or p_decision not in ('approved','rejected') then raise exception 'Invalid conversion decision'; end if;
 select * into v_conversion from public.partner_conversions where id=p_conversion_id for update;
 if not found then raise exception 'Conversion not found'; end if;
 if v_conversion.status<>'pending' then raise exception 'Conversion already reviewed'; end if;
 if p_decision='approved' then
  if v_conversion.commission_amount is null or v_conversion.commission_amount<=0 or v_conversion.currency<>'BDT'
   or nullif(btrim(v_conversion.partner_name),'') is null or nullif(btrim(v_conversion.external_conversion_id),'') is null then
   raise exception 'A verified positive BDT gross commission and partner reference are required';
  end if;
  if not exists(select 1 from public.profiles p where p.id=v_conversion.user_id and p.role='member' and coalesce(p.account_status,'active')='active') then
   raise exception 'Member account is not active';
  end if;
  select s.member_reward_percent into v_member_percent from public.platform_settings s where s.id=true;
  if v_member_percent is null then v_member_percent:=60; end if;
  v_member_reward:=round(v_conversion.commission_amount*v_member_percent/100.0,2);
  v_owner_share:=v_conversion.commission_amount-v_member_reward;
  if v_member_reward<=0 then raise exception 'Calculated member reward must be positive'; end if;
  insert into public.ledger_entries(user_id,conversion_id,entry_type,amount,description,is_test)
  values(v_conversion.user_id,v_conversion.id,'credit',v_member_reward,'পার্টনার কমিশন থেকে সদস্যের রিওয়ার্ড ('||v_member_percent||'%) · '||v_conversion.partner_name,false)
  on conflict do nothing;
  select le.user_id,le.amount into v_ledger_user,v_ledger_amount from public.ledger_entries le where le.conversion_id=v_conversion.id and le.entry_type='credit' limit 1;
  if not found or v_ledger_user<>v_conversion.user_id or v_ledger_amount<>v_member_reward then
   raise exception 'Existing conversion credit does not match split; manual investigation required';
  end if;
  insert into public.partner_commission_allocations(conversion_id,partner_gross_bdt,member_reward_bdt,owner_share_bdt,member_reward_percent)
  values(v_conversion.id,v_conversion.commission_amount,v_member_reward,v_owner_share,v_member_percent)
  on conflict(conversion_id) do nothing;
  if not exists(select 1 from public.partner_commission_allocations a where a.conversion_id=v_conversion.id and a.partner_gross_bdt=v_conversion.commission_amount and a.member_reward_bdt=v_member_reward and a.owner_share_bdt=v_owner_share and a.member_reward_percent=v_member_percent) then
   raise exception 'Existing commission allocation differs; manual investigation required';
  end if;
 end if;
 update public.partner_conversions set status=p_decision,reviewed_at=now(),reviewed_by=auth.uid(),review_note=left(coalesce(p_note,''),1000) where id=v_conversion.id;
 insert into public.admin_audit_log(admin_id,action,details)
 values(auth.uid(),'partner_conversion_'||p_decision,jsonb_build_object('conversion_id',v_conversion.id,'partner',v_conversion.partner_name,'external_conversion_id',v_conversion.external_conversion_id,'user_id',v_conversion.user_id,'partner_gross_bdt',v_conversion.commission_amount,'member_reward_bdt',case when p_decision='approved' then v_member_reward else 0 end,'owner_share_bdt',case when p_decision='approved' then v_owner_share else 0 end,'member_reward_percent',case when p_decision='approved' then v_member_percent else null end,'note',left(coalesce(p_note,''),1000)));
end; $$;
revoke all on function public.admin_review_conversion(uuid,text,text) from public,anon;
grant execute on function public.admin_review_conversion(uuid,text,text) to authenticated;