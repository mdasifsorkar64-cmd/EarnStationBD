-- Secure EarnStationBD referral programme; run in Supabase SQL Editor.
alter table public.profiles add column if not exists referral_code text, add column if not exists referred_by uuid references public.profiles(id);
alter table public.profiles alter column referral_code set default upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
update public.profiles set referral_code=upper(substr(encode(gen_random_bytes(6),'hex'),1,10)) where referral_code is null or btrim(referral_code)='';
create unique index if not exists profiles_referral_code_uidx on public.profiles(referral_code);

create table if not exists public.referral_settings(id boolean primary key default true check(id=true),bonus_amount numeric(12,2) not null default 5.00 check(bonus_amount between 0 and 10000),updated_at timestamptz not null default now(),updated_by uuid references auth.users(id));
insert into public.referral_settings(id,bonus_amount) values(true,5.00) on conflict(id) do nothing;
alter table public.referral_settings enable row level security;

create table if not exists public.referral_rewards(id uuid primary key default gen_random_uuid(),referrer_id uuid not null references public.profiles(id),referred_user_id uuid not null unique references public.profiles(id),amount numeric(12,2) not null check(amount>0),created_at timestamptz not null default now(),constraint referral_not_self check(referrer_id<>referred_user_id));
create index if not exists referral_rewards_referrer_idx on public.referral_rewards(referrer_id,created_at desc);
alter table public.referral_rewards enable row level security;

-- Referral code and inviter are immutable after signup; prevents client-side attribution tampering.
create or replace function public.protect_referral_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.referral_code is distinct from new.referral_code
     or old.referred_by is distinct from new.referred_by then
    raise exception 'রেফারেল কোড ও আমন্ত্রণকারীর তথ্য পরিবর্তন করা যাবে না।';
  end if;
  return new;
end;
$$
drop trigger if exists protect_referral_attribution on public.profiles;
create trigger protect_referral_attribution
before update on public.profiles
for each row execute function public.protect_referral_attribution();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare
 v_name text:=btrim(coalesce(new.raw_user_meta_data->>'full_name',''));
 v_phone text:=regexp_replace(coalesce(new.raw_user_meta_data->>'phone',''),'\D','','g');
 v_code text:=upper(btrim(coalesce(new.raw_user_meta_data->>'referral_code','')));
 v_referrer uuid;
begin
 if v_name='' then raise exception 'পূর্ণ নাম দিয়ে নিবন্ধন করুন।'; end if;
 if v_phone !~ '^01[3-9][0-9]{8}$' then raise exception 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিয়ে নিবন্ধন করুন।'; end if;
 if v_code<>'' then
  select p.id into v_referrer from public.profiles p where p.referral_code=v_code and p.role='member' and coalesce(p.account_status,'active')='active' limit 1;
  if v_referrer is null then raise exception 'রেফারেল কোডটি সঠিক নয় বা সক্রিয় নেই।'; end if;
 end if;
 insert into public.profiles(id,full_name,phone,referred_by) values(new.id,v_name,v_phone,v_referrer);
 return new;
end; $$;

create or replace function public.claim_referral_bonus() returns boolean language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_referrer uuid; v_amount numeric(12,2); v_confirmed timestamptz; v_reward uuid;
begin
 if v_user is null then raise exception 'লগইন করে আবার চেষ্টা করুন।'; end if;
 select u.email_confirmed_at into v_confirmed from auth.users u where u.id=v_user;
 if v_confirmed is null then return false; end if;
 select p.referred_by into v_referrer from public.profiles p where p.id=v_user and p.role='member' and coalesce(p.account_status,'active')='active';
 if v_referrer is null then return false; end if;
 select s.bonus_amount into v_amount from public.referral_settings s where s.id=true;
 if coalesce(v_amount,0)<=0 then return false; end if;
 if not exists(select 1 from public.profiles p where p.id=v_referrer and p.role='member' and coalesce(p.account_status,'active')='active') then return false; end if;
 insert into public.referral_rewards(referrer_id,referred_user_id,amount) values(v_referrer,v_user,v_amount) on conflict(referred_user_id) do nothing returning id into v_reward;
 if v_reward is null then return false; end if;
 insert into public.ledger_entries(user_id,entry_type,amount,description) values(v_referrer,'credit',v_amount,'সফল রেফারেল বোনাস');
 return true;
end; $$;

create or replace function public.get_my_referral_summary() returns table(referral_code text,successful_referrals bigint,total_bonus numeric,current_bonus numeric) language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 return query select p.referral_code,count(r.id),coalesce(sum(r.amount),0),coalesce((select s.bonus_amount from public.referral_settings s where s.id=true),5.00)
 from public.profiles p left join public.referral_rewards r on r.referrer_id=p.id where p.id=auth.uid() group by p.referral_code;
end; $$;

create or replace function public.admin_get_referral_settings() returns table(bonus_amount numeric,successful_referrals bigint,total_paid numeric) language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 return query select s.bonus_amount,(select count(*) from public.referral_rewards),(select coalesce(sum(amount),0) from public.referral_rewards) from public.referral_settings s where s.id=true;
end; $$;

create or replace function public.admin_update_referral_bonus(p_bonus_amount numeric) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 if p_bonus_amount is null or p_bonus_amount<0 or p_bonus_amount>10000 then raise exception 'রেফারেল বোনাস ০ থেকে ১০,০০০ টাকার মধ্যে হতে হবে।'; end if;
 update public.referral_settings set bonus_amount=p_bonus_amount,updated_at=now(),updated_by=auth.uid() where id=true;
 insert into public.admin_audit_log(admin_id,action,details) values(auth.uid(),'referral_bonus_updated',jsonb_build_object('bonus_amount',p_bonus_amount));
end; $$;
revoke all on function public.claim_referral_bonus() from public; grant execute on function public.claim_referral_bonus() to authenticated;
revoke all on function public.get_my_referral_summary() from public; grant execute on function public.get_my_referral_summary() to authenticated;
revoke all on function public.admin_get_referral_settings() from public; grant execute on function public.admin_get_referral_settings() to authenticated;
revoke all on function public.admin_update_referral_bonus(numeric) from public; grant execute on function public.admin_update_referral_bonus(numeric) to authenticated;
notify pgrst,'reload schema';
