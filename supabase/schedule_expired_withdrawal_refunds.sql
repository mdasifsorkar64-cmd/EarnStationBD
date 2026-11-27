-- Schedule automatic refunds for expired pending/approved withdrawal requests.
-- Apply to TEST first; the function only touches expired requests and is idempotent.
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (
    select 1 from cron.job
    where jobname = 'earnstation-refund-expired-withdrawals'
  ) then
    perform cron.schedule(
      'earnstation-refund-expired-withdrawals',
      '* * * * *',
      'select public.refund_expired_withdrawals();'
    );
  end if;
end $$;

revoke all on function public.refund_expired_withdrawals() from public, anon, authenticated;
grant execute on function public.refund_expired_withdrawals() to service_role;

notify pgrst, 'reload schema';
