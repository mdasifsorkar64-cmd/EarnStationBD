# EarnStationBD — Test Security Audit

পরীক্ষার পরিবেশ: EarnStationBD-Test (`rxfgozophvsriaslifab`)
তারিখ: ২৬ নভেম্বর ২০২৬

## সম্পন্ন নিরাপত্তা ব্যবস্থা

- আটটি internal/RPC-only টেবিলে `anon` ও `authenticated`-এর জন্য explicit deny-all RLS policy যোগ করা হয়েছে।
- একই আটটি টেবিলে direct table grants প্রত্যাহার করা হয়েছে।
- `profiles`, `offers`, `partner_conversions`, `ledger_entries`, `withdrawal_requests`-এ anon-এর direct access বন্ধ; authenticated-এর কেবল প্রয়োজনীয় SELECT এবং offers-এ Admin RLS-সুরক্ষিত INSERT/UPDATE রাখা হয়েছে।
- সদস্যরা সরাসরি ledger বা withdrawal row তৈরি/পরিবর্তন করতে পারে না; অর্থসংক্রান্ত পরিবর্তন guarded RPC-তে সীমাবদ্ধ।
- `is_admin()` এখন role='admin' এবং account_status='active'—দুটিই যাচাই করে।
- Admin RPC-গুলো Admin check করে; member-facing SECURITY DEFINER RPC-গুলো auth.uid() দিয়ে নিজের ডেটা সীমাবদ্ধ করে; trigger-only functions-এর EXECUTE client roles থেকে প্রত্যাহার করা হয়েছে।
- SECURITY DEFINER functions-এ fixed search_path আছে।

## যাচাইয়ের ফল

- সক্রিয় Test Admin Admin check পাস করেছে।
- সাধারণ সদস্য Admin check পাস করতে পারেনি এবং Admin RPC প্রত্যাখ্যান করেছে।
- anon `is_admin()`, withdrawal request বা Admin RPC execute করতে পারে না।
- authenticated সরাসরি withdrawal insert করতে পারে না।
- উত্তোলন switch OFF; Test-এ withdrawal record শূন্য।
- Supabase Health Advisor: কোনো finding নেই।
- RLS enabled/no policy-এর আগের ৮টি informational finding দূর হয়েছে; explicit deny policies এখন আছে।

## অবশিষ্ট Advisor সতর্কতা

1. **৩০টি SECURITY DEFINER function:** Supabase Advisor সতর্কতা দেয় কারণ authenticated role এগুলো execute করতে পারে। এগুলো intentional API entry points: Admin RPC-তে `is_admin()` যাচাই, member RPC-তে `auth.uid()`-ভিত্তিক ownership যাচাই, trigger-only function-এ client EXECUTE revoked। এগুলো অন্ধভাবে revoke করলে Dashboard ও member workflows নষ্ট হবে।
2. **Leaked password protection disabled:** এটি Supabase Authentication Dashboard-এর Password Security setting; উপলব্ধ সংযোগে Auth project settings পরিবর্তনের tool নেই। `docs/manual-dashboard-security-setup-bn.md`-এ চালুর ধাপ আছে।
3. **১৮টি unused-index INFO:** Test database-এ ডেটা/ট্রাফিক কম থাকায় index ব্যবহার হয়নি। বাস্তব query workload পর্যবেক্ষণ না করে এগুলো drop করা নিরাপদ নয়।

## Production

Production project-এ কোনো SQL migration, data change, auth change বা deployment করা হয়নি।
