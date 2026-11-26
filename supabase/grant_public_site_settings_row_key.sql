-- Ensure the invoker-rights public site settings RPCs can read the row key used in their filter.
grant select (id, site_name, site_tagline, announcement, contact_email,
              facebook_url, telegram_url, whatsapp_url, youtube_url)
on public.site_settings to anon, authenticated;
notify pgrst, 'reload schema';
