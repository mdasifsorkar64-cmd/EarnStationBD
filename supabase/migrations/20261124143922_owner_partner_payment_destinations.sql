-- Store owner-only partner commission receiving details for bKash and Nagad.
create table if not exists public.owner_partner_payment_destinations (
  id smallint primary key default 1 check (id = 1),
  bkash_number text,
  bkash_account_name text,
  nagad_number text,
  nagad_account_name text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.owner_partner_payment_destinations enable row level security;
revoke all on public.owner_partner_payment_destinations from public, anon, authenticated;

create or replace function public.admin_get_owner_partner_payment_destinations()
returns table (
  bkash_number text,
  bkash_account_name text,
  nagad_number text,
  nagad_account_name text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  return query
    select d.bkash_number,d.bkash_account_name,d.nagad_number,d.nagad_account_name,d.updated_at
    from public.owner_partner_payment_destinations d
    where d.id=1;
end;
$function$;

create or replace function public.admin_save_owner_partner_payment_destinations(
  p_bkash_number text,
  p_bkash_account_name text,
  p_nagad_number text,
  p_nagad_account_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_bkash text := nullif(regexp_replace(coalesce(p_bkash_number,''),'[[:space:]-]','','g'),'');
  v_nagad text := nullif(regexp_replace(coalesce(p_nagad_number,''),'[[:space:]-]','','g'),'');
  v_bkash_name text := nullif(btrim(coalesce(p_bkash_account_name,'')),'');
  v_nagad_name text := nullif(btrim(coalesce(p_nagad_account_name,'')),'');
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if v_bkash is null and v_nagad is null then
    raise exception 'At least one bKash or Nagad receiving number is required';
  end if;
  if v_bkash is not null and v_bkash !~ '^01[3-9][0-9]{8}$' then
    raise exception 'Enter a valid 11-digit Bangladesh bKash number';
  end if;
  if v_nagad is not null and v_nagad !~ '^01[3-9][0-9]{8}$' then
    raise exception 'Enter a valid 11-digit Bangladesh Nagad number';
  end if;
  if v_bkash is not null and (v_bkash_name is null or length(v_bkash_name) not between 2 and 80) then
    raise exception 'Enter the bKash account holder name';
  end if;
  if v_nagad is not null and (v_nagad_name is null or length(v_nagad_name) not between 2 and 80) then
    raise exception 'Enter the Nagad account holder name';
  end if;

  insert into public.owner_partner_payment_destinations
    (id,bkash_number,bkash_account_name,nagad_number,nagad_account_name,updated_at,updated_by)
  values (1,v_bkash,v_bkash_name,v_nagad,v_nagad_name,now(),auth.uid())
  on conflict (id) do update set
    bkash_number=excluded.bkash_number,
    bkash_account_name=excluded.bkash_account_name,
    nagad_number=excluded.nagad_number,
    nagad_account_name=excluded.nagad_account_name,
    updated_at=excluded.updated_at,
    updated_by=excluded.updated_by;

  insert into public.admin_audit_log(admin_id,action,details)
  values(auth.uid(),'owner_partner_payment_destinations_updated',
    jsonb_build_object('bkash_enabled',v_bkash is not null,'nagad_enabled',v_nagad is not null));
end;
$function$;

revoke all on function public.admin_get_owner_partner_payment_destinations() from public, anon;
revoke all on function public.admin_save_owner_partner_payment_destinations(text,text,text,text) from public, anon;
grant execute on function public.admin_get_owner_partner_payment_destinations() to authenticated;
grant execute on function public.admin_save_owner_partner_payment_destinations(text,text,text,text) to authenticated;
