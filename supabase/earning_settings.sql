-- EarnStationBD: admin-controlled earning rules and minimum withdrawal
create table if not exists public.platform_settings (
  id boolean primary key default true check (id = true),
  minimum_withdrawal numeric(12,2) not null default 100 check (minimum_withdrawal >= 1),
  ad_reward numeric(12,2) not null default 0.10 check (ad_reward >= 0),
  daily_ad_limit integer not null default 5 check (daily_ad_limit between 0 and 200),
  ads_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.platform_settings(id) values(true) on conflict(id) do nothing;
alter table public.platform_settings enable row level security;

create or replace function public.admin_get_platform_settings()
returns table(minimum_withdrawal numeric, ad_reward numeric, daily_ad_limit integer, ads_enabled boolean)
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query select s.minimum_withdrawal,s.ad_reward,s.daily_ad_limit,s.ads_enabled
  from public.platform_settings s where s.id=true;
end;
$$;

create or replace function public.admin_update_platform_settings(
  p_minimum_withdrawal numeric,
  p_ad_reward numeric,
  p_daily_ad_limit integer,
  p_ads_enabled boolean default false
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_minimum_withdrawal is null or p_minimum_withdrawal < 1 then raise exception 'Minimum withdrawal must be at least 1'; end if;
  if p_ad_reward is null or p_ad_reward < 0 then raise exception 'Invalid ad reward'; end if;
  if p_daily_ad_limit is null or p_daily_ad_limit < 0 or p_daily_ad_limit > 200 then raise exception 'Daily ad limit must be between 0 and 200'; end if;
  if coalesce(p_ads_enabled,false) then raise exception 'A verified rewarded-ad provider callback is required before enabling ads'; end if;
  update public.platform_settings
  set minimum_withdrawal=p_minimum_withdrawal, ad_reward=p_ad_reward,
      daily_ad_limit=p_daily_ad_limit, ads_enabled=false,
      updated_at=now(), updated_by=auth.uid()
  where id=true;
end;
$$;

create or replace function public.request_withdrawal(
  p_amount numeric,
  p_method text,
  p_account_ciphertext text
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_earned numeric(12,2);
  v_reserved numeric(12,2);
  v_minimum numeric(12,2);
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid amount'; end if;
  select minimum_withdrawal into v_minimum from public.platform_settings where id=true;
  if v_minimum is null then v_minimum := 100; end if;
  if p_amount < v_minimum then raise exception 'Minimum withdrawal is ৳' || v_minimum::text; end if;
  if p_method not in ('bkash','nagad') then raise exception 'Unsupported payout method'; end if;
  if p_account_ciphertext is null or length(p_account_ciphertext) < 16 then raise exception 'Encrypted payout details required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
  select coalesce(sum(case when entry_type='credit' then amount else -amount end),0)
    into v_earned from public.ledger_entries where user_id=v_user;
  select coalesce(sum(amount),0) into v_reserved
    from public.withdrawal_requests
    where user_id=v_user and status in ('pending','approved','paid');
  if p_amount > v_earned-v_reserved then raise exception 'Insufficient available balance'; end if;
  insert into public.withdrawal_requests(user_id,amount,payout_method,payout_account_ciphertext)
  values(v_user,p_amount,p_method,p_account_ciphertext) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_get_platform_settings() from public;
grant execute on function public.admin_get_platform_settings() to authenticated;
revoke all on function public.admin_update_platform_settings(numeric,numeric,integer,boolean) from public;
grant execute on function public.admin_update_platform_settings(numeric,numeric,integer,boolean) to authenticated;
revoke all on function public.request_withdrawal(numeric,text,text) from public;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;
