-- EarnStationBD: immutable member profiles after account activation
-- Run this migration in Supabase SQL Editor.
-- New signup requires full_name + phone; members cannot update profiles after signup.
-- Trusted admins and service-role operations remain able to manage profiles.

-- Preserve referral attribution while requiring both registration fields.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_name text := btrim(coalesce(new.raw_user_meta_data->>'full_name', ''));
  v_phone text := regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '\D', '', 'g');
  v_code text := upper(btrim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
  v_referrer uuid;
begin
  if v_name = '' then raise exception 'পূর্ণ নাম দিয়ে নিবন্ধন করুন।'; end if;
  if v_phone !~ '^01[3-9][0-9]{8}$' then
    raise exception 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিয়ে নিবন্ধন করুন।';
  end if;
  if v_code <> '' then
    select p.id into v_referrer from public.profiles p
    where p.referral_code = v_code and p.role = 'member'
      and coalesce(p.account_status, 'active') = 'active' limit 1;
    if v_referrer is null then raise exception 'রেফারেল কোডটি সঠিক নয় বা সক্রিয় নেই।'; end if;
  end if;
  insert into public.profiles(id, full_name, phone, referred_by)
  values(new.id, v_name, v_phone, v_referrer);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Members cannot update any profile column through the API.
-- Trusted SQL-editor/service-role operations have auth.uid() = NULL and remain available.
create or replace function public.prevent_member_profile_updates()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if public.is_admin() then return new; end if;
  if auth.uid() <> old.id then
    raise exception 'অন্য সদস্যের তথ্য পরিবর্তন করার অনুমতি নেই।';
  end if;
  raise exception 'অ্যাকাউন্ট সক্রিয় হওয়ার পর নাম, ফোন নম্বরসহ কোনো প্রোফাইল তথ্য পরিবর্তন করা যাবে না।';
end;
$$;

drop trigger if exists prevent_member_profile_updates on public.profiles;
create trigger prevent_member_profile_updates before update on public.profiles
for each row execute function public.prevent_member_profile_updates();

-- Remove member self-update policy; retain admin-only updates.
drop policy if exists "profile update own basic fields" on public.profiles;
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Remove direct API writes, including any column-level grants.
revoke all privileges on table public.profiles from anon;
revoke insert, update, delete, references, trigger, truncate
on table public.profiles from anon, authenticated;
revoke insert (id, full_name, phone, role, created_at, account_status, referral_code, referred_by),
       update (id, full_name, phone, role, created_at, account_status, referral_code, referred_by),
       references (id, full_name, phone, role, created_at, account_status, referral_code, referred_by)
on table public.profiles from anon, authenticated;
revoke select (id, full_name, phone, role, created_at, account_status, referral_code, referred_by)
on table public.profiles from anon;
grant select on table public.profiles to authenticated;

-- Keep legacy browser tabs from using the old profile-edit RPC.
create or replace function public.update_my_profile(p_full_name text, p_phone text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'লগইন করে আবার চেষ্টা করুন।'; end if;
  if public.is_admin() then
    raise exception 'অ্যাডমিন অ্যাকাউন্টের তথ্য অনুমোদিত অ্যাডমিন ব্যবস্থাপনার মাধ্যমে পরিবর্তন করুন।';
  end if;
  raise exception 'অ্যাকাউন্ট সক্রিয় হওয়ার পর নাম বা ফোন নম্বর পরিবর্তন করা যাবে না।';
end;
$$;
revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

notify pgrst, 'reload schema';
