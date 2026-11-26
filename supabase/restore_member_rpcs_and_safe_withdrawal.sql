-- Restore member dashboard RPCs and safe withdrawal lifecycle functions in TEST.
-- This migration does not create financial activity. Withdrawal intake remains OFF.

create or replace function private.handle_test_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  v_phone text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g');
  v_code text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
  v_referrer uuid;
begin
  if v_name = '' then raise exception 'পূর্ণ নাম দিয়ে নিবন্ধন করুন।'; end if;
  if v_phone !~ '^01[3-9][0-9]{8}$' then raise exception 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিয়ে নিবন্ধন করুন।'; end if;
  if v_code <> '' then
    select p.id into v_referrer from public.profiles p
    where p.referral_code = v_code and p.role = 'member'
      and coalesce(p.account_status, 'active') = 'active' limit 1;
    if v_referrer is null then raise exception 'রেফারেল কোডটি সঠিক নয় বা সক্রিয় নেই।'; end if;
  end if;
  insert into public.profiles(id, full_name, phone, referred_by)
  values(new.id, v_name, v_phone, v_referrer)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_test_auth_user() from public, anon, authenticated;

create or replace function public.protect_referral_attribution()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.referral_code is distinct from new.referral_code
     or old.referred_by is distinct from new.referred_by then
    raise exception 'রেফারেল কোড ও আমন্ত্রণকারীর তথ্য পরিবর্তন করা যাবে না।';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_referral_attribution() from public, anon, authenticated;
drop trigger if exists protect_referral_attribution on public.profiles;
create trigger protect_referral_attribution
before update on public.profiles for each row
execute function public.protect_referral_attribution();

create or replace function public.prevent_member_profile_updates()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if public.is_admin() then return new; end if;
  if auth.uid() <> old.id then raise exception 'অন্য সদস্যের তথ্য পরিবর্তন করার অনুমতি নেই।'; end if;
  raise exception 'নিবন্ধনের পর নাম বা ফোন নম্বর পরিবর্তন করা যাবে না।';
end;
$$;
revoke all on function public.prevent_member_profile_updates() from public, anon, authenticated;
drop trigger if exists prevent_member_profile_updates on public.profiles;
create trigger prevent_member_profile_updates
before update on public.profiles for each row
execute function public.prevent_member_profile_updates();

drop policy if exists "profile update own pending or admin" on public.profiles;
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles
for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create or replace function public.update_my_profile(p_full_name text, p_phone text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'লগইন করে আবার চেষ্টা করুন।'; end if;
  if public.is_admin() then raise exception 'অ্যাডমিন অ্যাকাউন্টের তথ্য অনুমোদিত অ্যাডমিন ব্যবস্থাপনার মাধ্যমে পরিবর্তন করুন।'; end if;
  raise exception 'নিবন্ধনের পর নাম বা ফোন নম্বর পরিবর্তন করা যাবে না।';
end;
$$;
revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

create or replace function public.claim_referral_bonus()
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_referrer uuid;
  v_amount numeric(12,2);
  v_confirmed timestamptz;
  v_reward uuid;
begin
  if v_user is null then raise exception 'লগইন করে আবার চেষ্টা করুন।'; end if;
  select u.email_confirmed_at into v_confirmed from auth.users u where u.id = v_user;
  if v_confirmed is null then return false; end if;
  select p.referred_by into v_referrer from public.profiles p
  where p.id = v_user and p.role = 'member'
    and coalesce(p.account_status, 'active') = 'active';
  if v_referrer is null then return false; end if;
  select s.bonus_amount into v_amount from public.referral_settings s where s.id = true;
  if coalesce(v_amount, 0) <= 0 then return false; end if;
  if not exists (select 1 from public.profiles p where p.id = v_referrer
    and p.role = 'member' and coalesce(p.account_status, 'active') = 'active') then return false; end if;
  insert into public.referral_rewards(referrer_id, referred_user_id, amount)
  values(v_referrer, v_user, v_amount)
  on conflict(referred_user_id) do nothing returning id into v_reward;
  if v_reward is null then return false; end if;
  insert into public.ledger_entries(user_id, entry_type, amount, description, is_test)
  values(v_referrer, 'credit', v_amount, 'সফল রেফারেল বোনাস', false);
  return true;
end;
$$;
revoke all on function public.claim_referral_bonus() from public, anon;
grant execute on function public.claim_referral_bonus() to authenticated;

create or replace function public.mark_my_inbox_item_read(p_inbox_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare changed_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.member_inbox set read_at = coalesce(read_at, now())
  where id = p_inbox_id and user_id = auth.uid();
  get diagnostics changed_count = row_count;
  return changed_count > 0;
end;
$$;
revoke all on function public.mark_my_inbox_item_read(uuid) from public, anon;
grant execute on function public.mark_my_inbox_item_read(uuid) to authenticated;

create or replace function public.create_income_inbox_item()
returns trigger language plpgsql security definer set search_path = public
as $$
declare item_title text; item_type text;
begin
  if lower(coalesce(new.entry_type, '')) <> 'credit'
     or coalesce(new.is_test, false)
     or new.withdrawal_id is not null
     or coalesce(new.description, '') ilike 'উত্তোলন REFUNDED%'
     or new.user_id is null then return new; end if;
  if new.description ilike '%referral%' or new.description ilike '%রেফারেল%' then
    item_title := 'রেফারেল বোনাস যোগ হয়েছে'; item_type := 'referral';
  elsif new.description ilike '%advert%' or new.description ilike '%বিজ্ঞাপন%' then
    item_title := 'বিজ্ঞাপন থেকে আয় যোগ হয়েছে'; item_type := 'ad';
  elsif new.description ilike '%offer%' or new.description ilike '%অফার%'
     or new.description ilike '%commission%' or new.description ilike '%কমিশন%' then
    item_title := 'অফার/কমিশন আয় যোগ হয়েছে'; item_type := 'offer';
  else item_title := 'নতুন আয় যোগ হয়েছে'; item_type := 'earning'; end if;
  insert into public.member_inbox
    (user_id, ledger_entry_id, notification_type, title, message, amount, created_at)
  values (new.user_id, new.id, item_type, item_title,
    coalesce(nullif(new.description, ''), 'আপনার হিসাবে প্রকৃত আয় যোগ হয়েছে।'),
    new.amount, new.created_at)
  on conflict (ledger_entry_id) do nothing;
  return new;
end;
$$;
revoke all on function public.create_income_inbox_item() from public, anon, authenticated;
drop trigger if exists trg_create_income_inbox_item on public.ledger_entries;
create trigger trg_create_income_inbox_item after insert on public.ledger_entries
for each row execute function public.create_income_inbox_item();
revoke all on table public.member_inbox from anon, authenticated;
grant select on table public.member_inbox to authenticated;

create or replace function public.public_get_site_settings()
returns table(site_name text, site_tagline text, announcement text, contact_email text)
language sql stable security definer set search_path = public
as $$
  select s.site_name, s.site_tagline, s.announcement, s.contact_email
  from public.site_settings s where s.id = true limit 1;
$$;
create or replace function public.public_get_community_links()
returns table(facebook_url text, telegram_url text, whatsapp_url text, youtube_url text)
language sql stable security definer set search_path = public
as $$
  select s.facebook_url, s.telegram_url, s.whatsapp_url, s.youtube_url
  from public.site_settings s where s.id = true limit 1;
$$;
revoke all on function public.public_get_site_settings() from public, anon;
revoke all on function public.public_get_community_links() from public, anon;
grant execute on function public.public_get_site_settings() to anon, authenticated;
grant execute on function public.public_get_community_links() to anon, authenticated;

create unique index if not exists ledger_withdrawal_entry_once
on public.ledger_entries(withdrawal_id, entry_type) where withdrawal_id is not null;
create unique index if not exists withdrawal_payment_txn_unique
on public.withdrawal_requests(payout_method, lower(payment_transaction_id))
where payment_transaction_id is not null;

create or replace function public.request_withdrawal(p_amount numeric, p_method text, p_account_ciphertext text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_balance numeric(12,2);
  v_legacy_reserved numeric(12,2);
  v_local_now timestamp;
  v_today_count integer;
  v_minimum numeric(12,2);
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user
    and p.role = 'member' and coalesce(p.account_status, 'active') = 'active') then
    raise exception 'সক্রিয় সদস্য অ্যাকাউন্ট পাওয়া যায়নি.';
  end if;
  if p_amount is null or p_amount <= 0 or round(p_amount, 2) <> p_amount then raise exception 'Invalid amount'; end if;
  if p_method not in ('bkash', 'nagad') then raise exception 'Unsupported payout method'; end if;
  if p_account_ciphertext is null or length(p_account_ciphertext) < 16 then raise exception 'Encrypted payout details required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  v_local_now := timezone('Asia/Dhaka', now());
  if v_local_now::time < time '08:00' or v_local_now::time >= time '20:00' then
    raise exception 'উইথড্রের সময় সকাল ৮টা থেকে রাত ৮টা পর্যন্ত। বাংলাদেশ সময় অনুযায়ী এই সময়ের বাইরে উত্তোলন করা যাবে না।';
  end if;

  select count(*) into v_today_count from public.withdrawal_requests w
  where w.user_id = v_user and (w.created_at at time zone 'Asia/Dhaka')::date = v_local_now::date;
  if v_today_count >= 1 then raise exception 'আপনি আজ একবার উইথড্র করেছেন। দিনে মাত্র ১ বার উইথড্র করা যাবে। আগামীকাল সকাল ৮টার পর আবার চেষ্টা করুন।'; end if;

  select s.minimum_withdrawal into v_minimum from public.platform_settings s where s.id = true;
  if p_amount < coalesce(v_minimum, 100) then
    raise exception 'সর্বনিম্ন উত্তোলনের পরিমাণ ৳%', coalesce(v_minimum, 100);
  end if;

  select coalesce(sum(case
    when l.entry_type = 'credit' then l.amount
    when l.entry_type in ('debit', 'adjustment') then -l.amount
    else 0 end), 0)
  into v_balance
  from public.ledger_entries l
  where l.user_id = v_user and coalesce(l.is_test, false) = false
    and l.description <> 'পুরোনো পরীক্ষামূলক উত্তোলন কর্তন'
    and not exists (select 1 from public.withdrawal_requests tw
      where tw.id = l.withdrawal_id and coalesce(tw.is_test, false) = true);

  select coalesce(sum(w.amount), 0) into v_legacy_reserved
  from public.withdrawal_requests w
  where w.user_id = v_user and coalesce(w.is_test, false) = false
    and w.status in ('pending', 'approved')
    and not exists (select 1 from public.ledger_entries l
      where l.withdrawal_id = w.id and l.entry_type = 'debit');

  if p_amount > v_balance - v_legacy_reserved then raise exception 'Insufficient available balance'; end if;

  insert into public.withdrawal_requests
    (user_id, amount, payout_method, payout_account_ciphertext, is_test)
  values (v_user, p_amount, p_method, p_account_ciphertext, false)
  returning id into v_id;

  insert into public.ledger_entries
    (user_id, withdrawal_id, entry_type, amount, description, is_test)
  values (v_user, v_id, 'debit', p_amount, 'উত্তোলনের অনুরোধে ব্যালেন্স কর্তন', false);
  return v_id;
end;
$$;
revoke all on function public.request_withdrawal(numeric, text, text) from public, anon;
grant execute on function public.request_withdrawal(numeric, text, text) to authenticated;

create or replace function public.refund_expired_withdrawals()
returns integer language plpgsql security definer set search_path = public
as $$
declare v_row public.withdrawal_requests%rowtype; v_count integer := 0;
begin
  for v_row in
    select * from public.withdrawal_requests
    where status in ('pending', 'approved')
      and coalesce(expires_at, created_at + interval '5 hours') <= now()
    order by created_at for update skip locked
  loop
    update public.withdrawal_requests
    set status = 'refunded', refunded_at = coalesce(refunded_at, now()),
        reviewed_at = now(),
        admin_note = case when coalesce(admin_note, '') = ''
          then '৫ ঘণ্টা পার হওয়ায় টাকা স্বয়ংক্রিয়ভাবে ফেরত দেওয়া হয়েছে।'
          else admin_note end
    where id = v_row.id and status in ('pending', 'approved');
    if found then
      insert into public.ledger_entries
        (user_id, withdrawal_id, entry_type, amount, description, is_test)
      select v_row.user_id, v_row.id, 'credit', v_row.amount,
        'উত্তোলন REFUNDED—কর্তিত ব্যালেন্স ফেরত', false
      where exists (select 1 from public.ledger_entries l
        where l.withdrawal_id = v_row.id and l.entry_type = 'debit'
          and coalesce(l.is_test, false) = false)
      on conflict (withdrawal_id, entry_type)
      where withdrawal_id is not null do nothing;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.refund_expired_withdrawals() from public, anon, authenticated;

create or replace function public.admin_complete_withdrawal(p_withdrawal_id uuid, p_transaction_id text)
returns text language plpgsql security definer set search_path = public
as $$
declare v_row public.withdrawal_requests%rowtype; v_txn text := btrim(coalesce(p_transaction_id, ''));
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if length(v_txn) < 4 or length(v_txn) > 100 then raise exception '৪ থেকে ১০০ অক্ষরের সঠিক Transaction ID লিখুন'; end if;
  select * into v_row from public.withdrawal_requests where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if v_row.status = 'paid' then
    if lower(btrim(coalesce(v_row.payment_transaction_id, ''))) = lower(v_txn) then return 'paid'; end if;
    raise exception 'এই উত্তোলন ইতিমধ্যে সম্পন্ন হয়েছে';
  end if;
  if v_row.status = 'refunded' then return 'refunded'; end if;
  if v_row.status not in ('pending', 'approved') then raise exception 'Withdrawal is not payable'; end if;
  if coalesce(v_row.is_test, false) then raise exception 'পরীক্ষামূলক উত্তোলনে বাস্তব পেমেন্ট করা যাবে না'; end if;

  if coalesce(v_row.expires_at, v_row.created_at + interval '5 hours') <= now() then
    update public.withdrawal_requests
    set status = 'refunded', refunded_at = coalesce(refunded_at, now()),
        reviewed_at = now(), reviewed_by = auth.uid(),
        admin_note = '৫ ঘণ্টা পার হওয়ায় টাকা ফেরত দেওয়া হয়েছে।'
    where id = v_row.id;
    insert into public.ledger_entries
      (user_id, withdrawal_id, entry_type, amount, description, is_test)
    select v_row.user_id, v_row.id, 'credit', v_row.amount,
      'উত্তোলন REFUNDED—কর্তিত ব্যালেন্স ফেরত', false
    where exists (select 1 from public.ledger_entries l
      where l.withdrawal_id = v_row.id and l.entry_type = 'debit'
        and coalesce(l.is_test, false) = false)
    on conflict (withdrawal_id, entry_type)
    where withdrawal_id is not null do nothing;
    return 'refunded';
  end if;

  update public.withdrawal_requests
  set status = 'paid', paid_at = now(), reviewed_at = now(),
      reviewed_by = auth.uid(), payment_transaction_id = v_txn,
      admin_note = 'পেমেন্ট সম্পন্ন। Transaction ID: ' || v_txn
  where id = v_row.id and status in ('pending', 'approved');
  return 'paid';
exception when unique_violation then
  raise exception 'এই Transaction ID আগে ব্যবহার করা হয়েছে';
end;
$$;
revoke all on function public.admin_complete_withdrawal(uuid, text) from public, anon;
grant execute on function public.admin_complete_withdrawal(uuid, text) to authenticated;

notify pgrst, 'reload schema';
