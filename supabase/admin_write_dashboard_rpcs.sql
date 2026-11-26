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

-- Additional write RPCs used by the Admin dashboard.
create or replace function public.admin_set_member_status(p_user_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if p_status not in ('active','suspended') then raise exception 'Invalid member status'; end if;
 if p_user_id=auth.uid() then raise exception 'নিজের অ্যাকাউন্ট Suspend করা যাবে না'; end if;
 update public.profiles set account_status=p_status where id=p_user_id and role='member';
 if not found then raise exception 'Member not found or cannot be changed'; end if;
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'member_status_changed',jsonb_build_object('user_id',p_user_id,'status',p_status));
end; $$;
create or replace function public.admin_add_test_balance(p_user_id uuid,p_amount numeric)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if p_user_id is null then raise exception 'সদস্য নির্বাচন করুন'; end if;
 if p_amount is null or p_amount<=0 or p_amount>500 or round(p_amount,2)<>p_amount then raise exception 'পরীক্ষামূলক ব্যালেন্স ১ থেকে ৫০০ টাকার মধ্যে হতে হবে'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and role='member') then raise exception 'সদস্য অ্যাকাউন্ট পাওয়া যায়নি'; end if;
 insert into public.ledger_entries(user_id,entry_type,amount,description,is_test) values(p_user_id,'credit',p_amount,'পরীক্ষামূলক ব্যালেন্স — উত্তোলন পরীক্ষা (বাস্তব অর্থ নয়)',true);
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'test_balance_added',jsonb_build_object('user_id',p_user_id,'amount',p_amount));
end; $$;
create or replace function public.admin_update_referral_bonus(p_bonus_amount numeric)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if p_bonus_amount is null or p_bonus_amount<0 or p_bonus_amount>10000 then raise exception 'Bonus must be between 0 and 10000.'; end if;
 update public.referral_settings set bonus_amount=p_bonus_amount,updated_at=now(),updated_by=auth.uid() where id=true;
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'referral_bonus_updated',jsonb_build_object('bonus_amount',p_bonus_amount));
end; $$;
create or replace function public.admin_update_community_links(p_facebook_url text,p_telegram_url text,p_whatsapp_url text,p_youtube_url text)
returns void language plpgsql security definer set search_path=public as $$
declare v text;
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 foreach v in array array[p_facebook_url,p_telegram_url,p_whatsapp_url,p_youtube_url] loop
  if v is not null and (length(v)>500 or v !~ '^https://[^[:space:]]+$') then raise exception 'প্রতিটি লিংক অবশ্যই HTTPS URL হতে হবে'; end if;
 end loop;
 update public.site_settings set facebook_url=p_facebook_url,telegram_url=p_telegram_url,whatsapp_url=p_whatsapp_url,youtube_url=p_youtube_url,updated_at=now(),updated_by=auth.uid() where id=true;
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'community_links_updated',jsonb_build_object('facebook',p_facebook_url is not null,'telegram',p_telegram_url is not null,'whatsapp',p_whatsapp_url is not null,'youtube',p_youtube_url is not null));
end; $$;
create or replace function public.admin_update_site_settings(p_site_name text,p_site_tagline text,p_announcement text,p_contact_email text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if length(trim(coalesce(p_site_name,''))) not between 2 and 80 then raise exception 'সাইটের নাম ২-৮০ অক্ষরের হতে হবে'; end if;
 if length(coalesce(p_site_tagline,''))>180 or length(coalesce(p_announcement,''))>1000 then raise exception 'লেখার সীমা অতিক্রম করেছে'; end if;
 if p_contact_email is not null and p_contact_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'সঠিক ইমেইল ঠিকানা দিন'; end if;
 update public.site_settings set site_name=trim(p_site_name),site_tagline=coalesce(p_site_tagline,''),announcement=coalesce(p_announcement,''),contact_email=p_contact_email,updated_at=now(),updated_by=auth.uid() where id=true;
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'site_settings_updated',jsonb_build_object('site_name',p_site_name,'announcement_changed',p_announcement is not null));
end; $$;
create or replace function public.admin_set_partner_payment_status(p_conversion_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare v_status text; v_received numeric; v_withdrawn numeric;
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if p_conversion_id is null or p_status not in ('awaiting_partner_payment','received','reversed') then raise exception 'Invalid partner payment status'; end if;
 perform pg_advisory_xact_lock(hashtext('earnstationbd-owner-wallet')::bigint);
 select a.partner_payment_status into v_status from public.partner_commission_allocations a where a.conversion_id=p_conversion_id for update;
 if not found then raise exception 'Commission allocation not found'; end if;
 update public.partner_commission_allocations set partner_payment_status=p_status,updated_at=now() where conversion_id=p_conversion_id;
 select coalesce(sum(a.owner_share_bdt),0) into v_received from public.partner_commission_allocations a where a.partner_payment_status='received';
 select coalesce(sum(w.amount),0) into v_withdrawn from public.owner_wallet_withdrawals w;
 if v_withdrawn>v_received then raise exception 'Cannot change received funds: owner withdrawals already use this balance'; end if;
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'owner_wallet_partner_payment_status',jsonb_build_object('conversion_id',p_conversion_id,'old_status',v_status,'new_status',p_status));
end; $$;
create or replace function public.admin_record_owner_withdrawal(p_amount numeric,p_method text,p_transaction_id text,p_note text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_received numeric; v_withdrawn numeric; v_amount numeric(12,2); v_id uuid;
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if p_amount is null then raise exception 'Withdrawal amount must be positive'; end if;
 v_amount:=round(p_amount,2);
 if v_amount<=0 then raise exception 'Withdrawal amount must be positive'; end if;
 if p_method not in ('bkash','nagad','bank','cash','other') then raise exception 'Unsupported payout method'; end if;
 if p_transaction_id is null or length(btrim(p_transaction_id)) not between 4 and 100 then raise exception 'A valid transaction/reference ID is required'; end if;
 perform pg_advisory_xact_lock(hashtext('earnstationbd-owner-wallet')::bigint);
 select coalesce(sum(a.owner_share_bdt),0) into v_received from public.partner_commission_allocations a where a.partner_payment_status='received';
 select coalesce(sum(w.amount),0) into v_withdrawn from public.owner_wallet_withdrawals w;
 if v_amount>v_received-v_withdrawn then raise exception 'Insufficient owner wallet balance'; end if;
 insert into public.owner_wallet_withdrawals(amount,payout_method,payment_transaction_id,note,created_by) values(v_amount,p_method,btrim(p_transaction_id),left(coalesce(p_note,''),1000),auth.uid()) returning id into v_id;
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'owner_wallet_withdrawal_recorded',jsonb_build_object('withdrawal_id',v_id,'amount_bdt',v_amount,'method',p_method,'transaction_id',btrim(p_transaction_id),'note',left(coalesce(p_note,''),1000)));
 return v_id;
end; $$;
