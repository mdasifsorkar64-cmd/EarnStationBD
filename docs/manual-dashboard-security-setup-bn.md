# EarnStationBD — শেষ ধাপের Dashboard নিরাপত্তা সেটআপ

এই নথি কেবল সেই সেটিংসের জন্য, যেগুলো GitHub/Supabase SQL সংযোগ থেকে নিরাপদে পরিবর্তন করা যায় না। Production-এ কোনো পরিবর্তন করবেন না।

## ১. Cloudflare Pages Preview variables

Cloudflare Dashboard → Workers & Pages → earnstationbd → Settings → Variables and Secrets

Preview environment-এর জন্য যাচাই করুন:

- `SUPABASE_URL` — Test Supabase API URL
- `SUPABASE_PUBLISHABLE_KEY` — Test project-এর Publishable Key (না থাকলে `SUPABASE_ANON_KEY`)
- `PAYOUT_ENCRYPTION_KEY` — Secret; ৩২-বাইট AES key-এর Base64 মান

গুরুত্বপূর্ণ:
- Secret value কখনো GitHub বা chat-এ লিখবেন না।
- `PAYOUT_ENCRYPTION_KEY` পুরোনো encrypted payout account পড়ার একই key হতে হবে।
- key হারিয়ে গেলে আগের encrypted payout নম্বর আর পড়া যাবে না।
- Production environment-এর variables আলাদা রাখুন; Test key কখনো Production-এ বসাবেন না।

## ২. Supabase Auth — leaked password protection

Supabase Dashboard → EarnStationBD-Test project → Authentication → Settings → Password Security

সেখানে “Leaked password protection” / “Prevent use of compromised passwords” অপশনটি চালু করুন, যদি আপনার project plan-এ এটি উপলব্ধ থাকে।

এতে পরিচিত compromised password ব্যবহার করে নতুন পাসওয়ার্ড সেট করার ঝুঁকি কমে।

## ৩. Preview API পরীক্ষা

Preview deployment সম্পন্ন হলে:

- `/api/withdrawal` — লগইন ছাড়া 401 এবং ভুল Origin-এ 403 দিতে হবে।
- `/api/admin/withdrawals` — সাধারণ সদস্যকে 403 দিতে হবে।
- Admin লগইন করলে খালি withdrawal list স্বাভাবিক; Test DB-তে বর্তমানে কোনো withdrawal record নেই।
- `withdrawals_enabled=false` থাকায় নতুন আবেদন জমা হওয়া উচিত নয়।

## ৪. নিরাপদ অবস্থার শর্ত

- Test-এর সব পরীক্ষা শেষ না হওয়া পর্যন্ত withdrawal switch OFF রাখুন।
- কোনো real payout পাঠানো হবে না।
- Test key, Supabase URL, বা test user Production-এ ব্যবহার করবেন না।
- PR #14 Draft অবস্থায় থাকবে; review/merge-এর আগে পরিবর্তনগুলো GitHub-এ দেখে নিন।
