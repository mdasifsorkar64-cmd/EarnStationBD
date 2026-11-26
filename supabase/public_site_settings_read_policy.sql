-- Expose only public site fields through RLS and column-level grants.
-- Public RPCs can run as SECURITY INVOKER; no SECURITY DEFINER is needed.
alter table public.site_settings enable row level security;

drop policy if exists public_read_site_settings on public.site_settings;
create policy public_read_site_settings
on public.site_settings
for select
to anon, authenticated
using (id = true);

revoke all on table public.site_settings from public, anon, authenticated;
grant select (id, site_name, site_tagline, announcement, contact_email,
              facebook_url, telegram_url, whatsapp_url, youtube_url)
on public.site_settings to anon, authenticated;

create or replace function public.public_get_site_settings()
returns table(site_name text, site_tagline text, announcement text, contact_email text)
language sql
stable
security invoker
set search_path = public
as $$
  select s.site_name, s.site_tagline, s.announcement, s.contact_email
  from public.site_settings s where s.id = true limit 1;
$$;

create or replace function public.public_get_community_links()
returns table(facebook_url text, telegram_url text, whatsapp_url text, youtube_url text)
language sql
stable
security invoker
set search_path = public
as $$
  select s.facebook_url, s.telegram_url, s.whatsapp_url, s.youtube_url
  from public.site_settings s where s.id = true limit 1;
$$;

revoke all on function public.public_get_site_settings() from public, anon;
revoke all on function public.public_get_community_links() from public, anon;
grant execute on function public.public_get_site_settings() to anon, authenticated;
grant execute on function public.public_get_community_links() to anon, authenticated;

notify pgrst, 'reload schema';
