-- EarnStationBD: secure member profile update
-- Run this SQL in Supabase SQL Editor.
-- Members can update only their own name and phone; role and account status cannot be changed.

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'লগইন করে আবার চেষ্টা করুন।';
  end if;

  if length(trim(coalesce(p_full_name, ''))) not between 1 and 100 then
    raise exception 'নাম ১ থেকে ১০০ অক্ষরের মধ্যে লিখুন।';
  end if;

  if p_phone is null or p_phone !~ '^01[3-9][0-9]{8}$' then
    raise exception 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।';
  end if;

  update public.profiles
     set full_name = trim(p_full_name),
         phone = p_phone
   where id = v_user_id;

  if not found then
    raise exception 'আপনার প্রোফাইল পাওয়া যায়নি।';
  end if;

exception
  when unique_violation then
    raise exception 'এই মোবাইল নম্বরটি অন্য একটি অ্যাকাউন্টে ব্যবহৃত হচ্ছে।';
end;
$$;

revoke all on function public.update_my_profile(text, text) from public;
grant execute on function public.update_my_profile(text, text) to authenticated;

notify pgrst, 'reload schema';
