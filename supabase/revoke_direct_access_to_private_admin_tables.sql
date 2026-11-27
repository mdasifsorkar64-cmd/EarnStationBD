-- Defense in depth: these tables are accessed only through narrowly scoped RPCs.
-- RLS is enabled without direct client policies; remove inherited/default table grants too.
revoke all privileges on table
  public.admin_audit_log,
  public.member_presence,
  public.owner_partner_payment_destinations,
  public.partner_commission_allocations,
  public.partner_postback_events,
  public.platform_settings,
  public.referral_rewards,
  public.referral_settings,
  public.owner_wallet_withdrawals
from public, anon, authenticated;
