-- Restrict anonymous execution of admin-only SECURITY DEFINER RPCs.
-- Keep authenticated and service_role access unchanged; each function also
-- performs its own public.is_admin() authorization check.
REVOKE EXECUTE ON FUNCTION public.admin_get_audit_log() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_community_links() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_platform_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_referral_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_site_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_members(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_member_status(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_community_links(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_platform_settings(numeric, numeric, integer, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_referral_bonus(numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_site_settings(text, text, text, text) FROM anon;
