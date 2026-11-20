-- Run this migration in Supabase SQL Editor after schema.sql.
-- Admin privileges are checked inside the database, never trusted from the browser.

create policy "admins insert offers" on public.offers
for insert to authenticated with check (public.is_admin());

create policy "admins update offers" on public.offers
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins delete offers" on public.offers
for delete to authenticated using (public.is_admin());

create unique index if not exists ledger_one_credit_per_conversion
on public.ledger_entries(conversion_id)
where conversion_id is not null and entry_type = 'credit';

create or replace function public.admin_review_conversion(
  p_conversion_id uuid,
  p_decision text,
  p_note text default ''
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversion public.partner_conversions%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;

  select * into v_conversion
  from public.partner_conversions
  where id = p_conversion_id
  for update;

  if not found then raise exception 'Conversion not found'; end if;
  if v_conversion.status <> 'pending' then raise exception 'Conversion already reviewed'; end if;

  if p_decision = 'approved' then
    if v_conversion.commission_amount <= 0 then
      raise exception 'A positive verified commission is required';
    end if;
    insert into public.ledger_entries(user_id, conversion_id, entry_type, amount, description)
    values (
      v_conversion.user_id,
      v_conversion.id,
      'credit',
      v_conversion.commission_amount,
      'অনুমোদিত পার্টনার কমিশন · ' || v_conversion.partner_name
    );
  end if;

  update public.partner_conversions
  set status = p_decision, reviewed_at = now()
  where id = p_conversion_id;
end;
$$;

revoke all on function public.admin_review_conversion(uuid,text,text) from public;
grant execute on function public.admin_review_conversion(uuid,text,text) to authenticated;

-- Important:
-- Do not activate an offer until the partner has approved the publisher account,
-- the destination/tracking URL and its terms have been verified.
-- No browser client may insert conversions or ledger entries.
-- Payout-account encryption and a trusted server-side partner postback verifier
-- are still required before real withdrawals or automatic commissions can go live.
