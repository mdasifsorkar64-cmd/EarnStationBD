-- EarnStationBD: require member full name and Bangladesh mobile number
-- Run once in Supabase SQL Editor. Existing incomplete profiles can save valid
-- details from Dashboard > Profile; all new signups must provide both fields.

create or replace function public.validate_required_member_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.full_name := btrim(coalesce(new.full_name, ''));
  new.phone := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');

  if new.full_name = '' then
    raise exception 'পূর্ণ নাম বাধ্যতামূলক।';
  end if;

  if new.phone !~ '^01[3-9][0-9]{8}$' then
    raise exception 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর বাধ্যতামূলক।';
  end if;

  return new;
end;
$$;

drop trigger if exists require_member_profile_fields on public.profiles;
create trigger require_member_profile_fields
before insert or update of full_name, phone on public.profiles
for each row execute function public.validate_required_member_profile();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(new.raw_user_meta_data->>'full_name', ''));
  v_phone text := regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '\D', '', 'g');
begin
  if v_name = '' then
    raise exception 'পূর্ণ নাম দিয়ে নিবন্ধন করুন।';
  end if;

  if v_phone !~ '^01[3-9][0-9]{8}$' then
    raise exception 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিয়ে নিবন্ধন করুন।';
  end if;

  insert into public.profiles(id, full_name, phone)
  values(new.id, v_name, v_phone);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
