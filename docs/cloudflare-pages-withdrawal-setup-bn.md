# Cloudflare Pages — EarnStationBD উত্তোলন API সেটআপ

এই নির্দেশনা শুধু Preview/Test পরিবেশের জন্য। Production পরিবেশে কোনো সেটিংস পরিবর্তন করবেন না, যতক্ষণ না আলাদা অনুমোদন পাওয়া যায়।

## প্রয়োজনীয় Environment Variables

Cloudflare Dashboard → Workers & Pages → earnstationbd → Settings → Variables and Secrets

Preview environment-এ নিচের তিনটি binding যোগ করতে হবে:

| নাম | ধরন | মান |
|---|---|---|
| `SUPABASE_URL` | Text | EarnStationBD-Test প্রকল্পের API URL |
| `SUPABASE_PUBLISHABLE_KEY` | Text | Test প্রকল্পের Publishable Key |
| `PAYOUT_ENCRYPTION_KEY` | Secret | সার্ভারের বিদ্যমান ৩২-বাইট Base64 AES key |

`PAYOUT_ENCRYPTION_KEY` কখনো GitHub, HTML/JavaScript, বা চ্যাটে লিখবেন না। এটি অবশ্যই আগে এনক্রিপ্ট করা payout account পড়ার জন্য ব্যবহৃত একই key হতে হবে।

Production environment-এর binding আলাদা রাখতে হবে। Test URL বা Test key Production-এ বসাবেন না।

## যুক্ত API Routes

- সদস্যের নতুন আবেদন: `POST /api/withdrawal`
- অ্যাডমিনের আবেদন তালিকা: `GET /api/admin/withdrawals`
- বাস্তবে পেমেন্ট পাঠানোর পর রেকর্ড: `POST /api/admin/withdrawals`

## নিরাপত্তা নিয়ম

- সব route Supabase session যাচাই করে।
- Admin route-এ role এবং active account দুটোই যাচাই হয়।
- payout নম্বর AES-256-GCM দিয়ে সার্ভারে এনক্রিপ্ট/ডিক্রিপ্ট হয়।
- বাস্তব পেমেন্ট পাঠায় না; Admin শুধু বাস্তবে পাঠানো পেমেন্টের Transaction ID রেকর্ড করে।
- TEST আবেদন বাস্তবে পরিশোধ করা যায় না।
- Database-এ উত্তোলন বন্ধ থাকলে API অনুরোধও প্রত্যাখ্যান হয়।
- binding না থাকলে API 503 দিয়ে নিরাপদে বন্ধ থাকে।

## Preview যাচাইয়ের তালিকা

1. Preview environment-এ তিনটি binding যোগ করুন।
2. Branch preview deployment সম্পন্ন হওয়া নিশ্চিত করুন।
3. লগইন করা Admin দিয়ে `/api/admin/withdrawals` তালিকা পরীক্ষা করুন।
4. কোনো বাস্তব আবেদন না থাকলে খালি তালিকা দেখা স্বাভাবিক।
5. Test database-এ `withdrawals_enabled=false` থাকায় সদস্যের আবেদন বন্ধ থাকার বার্তা আসতে হবে।
6. কোনো বাস্তব পেমেন্ট বা Production পরিবর্তন করবেন না।
