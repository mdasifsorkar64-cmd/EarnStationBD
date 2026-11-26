-- Restrict client table privileges to the exact operations used by the web app.
-- RLS remains the row-level boundary; RPCs perform financial and administrative writes.
revoke all privileges on table
  public.profiles,
  public.offers,
  public.partner_conversions,
  public.ledger_entries,
  public.withdrawal_requests
from anon, authenticated;

grant select on table
  public.profiles,
  public.offers,
  public.partner_conversions,
  public.ledger_entries,
  public.withdrawal_requests
to authenticated;

-- Admin offer management is the only direct client-side write workflow.
grant insert, update on table public.offers to authenticated;

notify pgrst, 'reload schema';
