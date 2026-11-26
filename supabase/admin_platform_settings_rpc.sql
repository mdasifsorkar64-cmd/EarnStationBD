-- Admin-only platform settings RPCs for the TEST project preview.
-- Advertising stays disabled until a verified provider callback is implemented.
CREATE OR REPLACE FUNCTION public.admin_get_platform_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.platform_settings%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settings
  FROM public.platform_settings
  WHERE id = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_settings_missing';
  END IF;

  RETURN jsonb_build_object(
    'minimum_withdrawal', v_settings.minimum_withdrawal,
    'ad_reward', v_settings.ad_reward,
    'daily_ad_limit', v_settings.daily_ad_limit,
    'ads_enabled', v_settings.ads_enabled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_platform_settings(
  p_minimum_withdrawal numeric,
  p_ad_reward numeric,
  p_daily_ad_limit integer,
  p_ads_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;

  IF p_minimum_withdrawal IS NULL OR p_minimum_withdrawal < 1
     OR p_ad_reward IS NULL OR p_ad_reward < 0 OR p_ad_reward > 10000
     OR p_daily_ad_limit IS NULL OR p_daily_ad_limit < 0 OR p_daily_ad_limit > 200 THEN
    RAISE EXCEPTION 'invalid_platform_settings' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_ads_enabled, false) THEN
    RAISE EXCEPTION 'verified_ad_provider_callback_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.platform_settings
  SET minimum_withdrawal = p_minimum_withdrawal,
      ad_reward = p_ad_reward,
      daily_ad_limit = p_daily_ad_limit,
      ads_enabled = false,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_settings_missing';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_platform_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_platform_settings(numeric, numeric, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_platform_settings(numeric, numeric, integer, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
