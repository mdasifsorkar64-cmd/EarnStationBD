-- EarnStationBD: correct real earnings and withdrawal-eligible balance.
-- Apply in Supabase SQL Editor only after reviewing the live schema.
-- This migration does not alter existing ledger rows or fabricate earnings.

create or replace function public.get_my_financial_summary()
returns table (
  total_earned numeric(12,2),
  current_balance numeric(12,2),
  available_balance numeric(12,2)
)
language sql
stable
security invoker
set search_path = public
as $$
  with ledger_totals as (
    select
      coalesce(sum(
        case
          when l.entry_type = 'credit'
            and l.is_test = false
            and l.withdrawal_id is null
            and l.description not ilike 'উত্তোলন REFUNDED%'
          then l.amount
          else 0
        end
      ), 0)::numeric(12,2) as earned,
      coalesce(sum(
        case
          when l.entry_type = 'credit' then l.amount
          when l.entry_type in ('debit','adjustment') then -l.amount
          else 0
        end
      ) filter (
        where coalesce(l.is_test, false) = false
          and l.description <> 'পুরোনো পরীক্ষামূলক উত্তোলন কর্তন'
          and not exists (
            select 1
            from public.withdrawal_requests tw
            where tw.id = l.withdrawal_id
              and coalesce(tw.is_test, false) = true
          )
      ), 0)::numeric(12,2) as balance
    from public.ledger_entries l
    where l.user_id = auth.uid()
  ),
  legacy_reserved as (
    select coalesce(sum(w.amount), 0)::numeric(12,2) as reserved
    from public.withdrawal_requests w
    where w.user_id = auth.uid()
      and coalesce(w.is_test, false) = false
      and w.status in ('pending','approved')
      and not exists (
        select 1
        from public.ledger_entries l
        where l.withdrawal_id = w.id
          and l.entry_type = 'debit'
      )
  )
  select
    t.earned,
    t.balance,
    greatest(0, t.balance - r.reserved)
  from ledger_totals t
  cross join legacy_reserved r
  where auth.uid() is not null;
$$;

revoke all on function public.get_my_financial_summary() from public, anon;
grant execute on function public.get_my_financial_summary() to authenticated;
