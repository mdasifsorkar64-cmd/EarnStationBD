-- Defense in depth: allowlist is readable only by trusted SECURITY DEFINER functions.
alter table public.admin_email_allowlist enable row level security;
drop policy if exists admin_email_allowlist_deny_client_all on public.admin_email_allowlist;
create policy admin_email_allowlist_deny_client_all
on public.admin_email_allowlist
for all to anon, authenticated
using (false)
with check (false);
revoke all on table public.admin_email_allowlist from public, anon, authenticated;
