-- Explicit default-deny RLS policies for RPC-only/internal tables.
-- SECURITY DEFINER functions remain the sole intended client entry points and
-- perform their own authorization checks. Direct table grants are separately revoked.
do $$
declare t text;
begin
  foreach t in array array[
    'admin_audit_log',
    'member_presence',
    'owner_partner_payment_destinations',
    'partner_commission_allocations',
    'partner_postback_events',
    'platform_settings',
    'referral_rewards',
    'referral_settings'
  ] loop
    execute format('drop policy if exists deny_client_access on public.%I', t);
    execute format(
      'create policy deny_client_access on public.%I for all to anon, authenticated using (false) with check (false)',
      t
    );
  end loop;
end $$;
