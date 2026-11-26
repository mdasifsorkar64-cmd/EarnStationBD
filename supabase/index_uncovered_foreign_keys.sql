-- Cover foreign-key columns that currently lack an index.
-- These indexes improve parent-row updates/deletes and common joins/filters.
create index if not exists idx_admin_audit_log_admin_id on public.admin_audit_log(admin_id);
create index if not exists idx_ledger_entries_conversion_id on public.ledger_entries(conversion_id);
create index if not exists idx_ledger_entries_user_id on public.ledger_entries(user_id);
create index if not exists idx_ledger_entries_withdrawal_id on public.ledger_entries(withdrawal_id);
create index if not exists idx_member_inbox_user_id on public.member_inbox(user_id);
create index if not exists idx_owner_partner_payment_destinations_updated_by on public.owner_partner_payment_destinations(updated_by);
create index if not exists idx_owner_wallet_withdrawals_created_by on public.owner_wallet_withdrawals(created_by);
create index if not exists idx_partner_conversions_offer_id on public.partner_conversions(offer_id);
create index if not exists idx_partner_conversions_reviewed_by on public.partner_conversions(reviewed_by);
create index if not exists idx_partner_conversions_user_id on public.partner_conversions(user_id);
create index if not exists idx_partner_postback_events_player_id on public.partner_postback_events(player_id);
create index if not exists idx_platform_settings_updated_by on public.platform_settings(updated_by);
create index if not exists idx_profiles_referred_by on public.profiles(referred_by);
create index if not exists idx_referral_rewards_referrer_id on public.referral_rewards(referrer_id);
create index if not exists idx_referral_settings_updated_by on public.referral_settings(updated_by);
create index if not exists idx_site_settings_updated_by on public.site_settings(updated_by);
create index if not exists idx_withdrawal_requests_reviewed_by on public.withdrawal_requests(reviewed_by);
create index if not exists idx_withdrawal_requests_user_id on public.withdrawal_requests(user_id);
