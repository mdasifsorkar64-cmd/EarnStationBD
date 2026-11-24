-- Restrict client invocation of internal and member-authenticated SECURITY DEFINER functions.
-- Trigger/event-trigger functions continue to run when their registered triggers fire;
-- PostgreSQL does not require callers to have EXECUTE on a trigger function.

REVOKE EXECUTE ON FUNCTION public.claim_referral_bonus() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_referral_summary() FROM anon;

-- is_admin is used by authenticated application flows, but should not be callable anonymously.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;

-- These functions are invoked by database triggers/event triggers only.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_member_profile_updates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_referral_attribution() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Intentionally public read-only configuration endpoints remain callable by anon/authenticated.
-- public_get_site_settings() and public_get_community_links() are deliberately unchanged.
