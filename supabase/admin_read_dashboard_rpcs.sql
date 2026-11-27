-- Test-only Admin read APIs. Each endpoint verifies the signed-in admin role.
create or replace function public.admin_get_owner_wallet_summary()
returns table(owner_share_total_bdt numeric,awaiting_partner_payment_bdt numeric,partner_payment_received_bdt numeric,reversed_owner_share_bdt numeric,owner_withdrawn_bdt numeric,owner_available_bdt numeric)
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 return query
 with allocation_totals as (
  select coalesce(sum(a.owner_share_bdt),0)::numeric(14,2) total_share,
   coalesce(sum(a.owner_share_bdt) filter(where a.partner_payment_status='awaiting_partner_payment'),0)::numeric(14,2) awaiting,
   coalesce(sum(a.owner_share_bdt) filter(where a.partner_payment_status='received'),0)::numeric(14,2) received,
   coalesce(sum(a.owner_share_bdt) filter(where a.partner_payment_status='reversed'),0)::numeric(14,2) reversed
  from public.partner_commission_allocations a
 ), withdrawal_total as (select coalesce(sum(w.amount),0)::numeric(14,2) withdrawn from public.owner_wallet_withdrawals w)
 select t.total_share,t.awaiting,t.received,t.reversed,w.withdrawn,(t.received-w.withdrawn)::numeric(14,2)
 from allocation_totals t cross join withdrawal_total w;
end; $$;
create or replace function public.admin_list_owner_allocations()
returns table(conversion_id uuid,partner_name text,external_conversion_id text,partner_gross_bdt numeric,owner_share_bdt numeric,partner_payment_status text,received_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 return query select a.conversion_id,c.partner_name,c.external_conversion_id,a.partner_gross_bdt,a.owner_share_bdt,a.partner_payment_status,c.received_at,a.updated_at
 from public.partner_commission_allocations a join public.partner_conversions c on c.id=a.conversion_id order by c.received_at desc limit 200;
end; $$;
create or replace function public.admin_get_referral_settings()
returns table(bonus_amount numeric,successful_referrals bigint,total_paid numeric)
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 return query select s.bonus_amount,(select count(*) from public.referral_rewards),(select coalesce(sum(amount),0) from public.referral_rewards)
 from public.referral_settings s where s.id=true;
end; $$;
create or replace function public.admin_get_site_settings()
returns table(site_name text,site_tagline text,announcement text,contact_email text)
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 return query select s.site_name,s.site_tagline,s.announcement,s.contact_email from public.site_settings s where s.id=true;
end; $$;
create or replace function public.admin_get_community_links()
returns table(facebook_url text,telegram_url text,whatsapp_url text,youtube_url text)
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 return query select s.facebook_url,s.telegram_url,s.whatsapp_url,s.youtube_url from public.site_settings s where s.id=true;
end; $$;
create or replace function public.admin_get_audit_log()
returns table(action text,details jsonb,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required'; end if;
 return query select l.action,l.details,l.created_at from public.admin_audit_log l order by l.created_at desc limit 50;
end; $$;
revoke all on function public.admin_get_owner_wallet_summary() from public,anon;
revoke all on function public.admin_list_owner_allocations() from public,anon;
revoke all on function public.admin_get_referral_settings() from public,anon;
revoke all on function public.admin_get_site_settings() from public,anon;
revoke all on function public.admin_get_community_links() from public,anon;
revoke all on function public.admin_get_audit_log() from public,anon;
grant execute on function public.admin_get_owner_wallet_summary() to authenticated;
grant execute on function public.admin_list_owner_allocations() to authenticated;
grant execute on function public.admin_get_referral_settings() to authenticated;
grant execute on function public.admin_get_site_settings() to authenticated;
grant execute on function public.admin_get_community_links() to authenticated;
grant execute on function public.admin_get_audit_log() to authenticated;
revoke all on function public.admin_get_owner_wallet_summary() from public,anon;
revoke all on function public.admin_list_owner_allocations() from public,anon;
revoke all on function public.admin_get_referral_settings() from public,anon;
revoke all on function public.admin_get_site_settings() from public,anon;
revoke all on function public.admin_get_community_links() from public,anon;
revoke all on function public.admin_get_audit_log() from public,anon;
grant execute on function public.admin_get_owner_wallet_summary() to authenticated;
grant execute on function public.admin_list_owner_allocations() to authenticated;
grant execute on function public.admin_get_referral_settings() to authenticated;
grant execute on function public.admin_get_site_settings() to authenticated;
grant execute on function public.admin_get_community_links() to authenticated;
grant execute on function public.admin_get_audit_log() to authenticated;

create or replace function public.admin_list_owner_withdrawals()
returns table(id uuid,amount numeric,payout_method text,payment_transaction_id text,note text,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 return query
 select w.id,w.amount,w.payout_method,w.payment_transaction_id,w.note,w.created_at
 from public.owner_wallet_withdrawals w
 order by w.created_at desc
 limit 100;
end;
$$;
revoke all on function public.admin_list_owner_withdrawals() from public,anon;
grant execute on function public.admin_list_owner_withdrawals() to authenticated;
