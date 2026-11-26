# EarnStationBD — Primary ও Backup Admin Recovery

এই ব্যবস্থা কেবল নির্ধারিত দুটি Gmail-এর জন্য:

- Primary Admin: `mdasifsorkar64@gmail.com`
- Backup Admin: `mdasifsorkar1414@gmail.com`

## Backup Admin সক্রিয় করার ধাপ

1. Backup Gmail মালিক নিজে ব্যবহার করে EarnStationBD-তে স্বাভাবিক সদস্য হিসেবে নিবন্ধন করবেন।
2. ওই Gmail-এর ইমেইল যাচাই সম্পন্ন করবেন এবং একবার লগইন করে প্রোফাইল তৈরি করবেন।
3. Primary Admin লগইন করে Admin Panel → আয় ও সীমা নিয়ন্ত্রণ → জরুরি Admin Recovery খুলবেন।
4. **নির্ধারিত Backup Admin চালু করুন** চাপবেন।
5. সার্ভার নিশ্চিত করবে যে কলকারী নির্দিষ্ট Primary Gmail, Backup Gmail নিবন্ধিত ও verified, এবং allowlist-এ অনুমোদিত। এরপরই role `admin` হবে।

## Primary Admin পুনরুদ্ধার

Primary Admin-এর `account_status` suspended হলে Backup Admin লগইন করে একই প্যানেলে **Primary Admin পুনরুদ্ধার করুন** চাপবে। সার্ভার শুধু নির্দিষ্ট Primary Gmail-কে `role=admin` ও `account_status=active` করবে এবং Audit Log লিখবে।

## নিরাপত্তা সীমা

- Allowlist-এ ঠিক এই দুটি Gmail আছে; অন্য ইমেইল Admin হতে পারবে না।
- Allowlist টেবিলের সরাসরি client privileges `anon` ও `authenticated`-এর জন্য revoke করা।
- `is_admin()` allowlist, role এবং active account status—তিনটিই যাচাই করে।
- `admin_activate_backup_admin()` শুধু Primary Admin-এর জন্য।
- `admin_recover_primary_admin()` শুধু Backup Admin-এর জন্য।
- Recovery RPC-গুলো `anon` থেকে revoke করা; authenticated কল হলেও ফাংশনের ভিতরে পরিচয় ও Admin status যাচাই বাধ্যতামূলক।
- Admin action audit log-এ সংরক্ষিত হয়।
- এটি Auth account deletion, email compromise, বা Supabase Project Owner হারানোর বিকল্প recovery নয়। Primary ও Backup Gmail দুটিতেই 2-step verification চালু রাখুন।
- Production-এ migration প্রয়োগ করা হয়নি এবং করা যাবে না যতক্ষণ না আলাদা স্পষ্ট অনুমোদন পাওয়া যায়।

## বর্তমান Test অবস্থার নোট

Test project-এ Primary Admin সক্রিয়। Backup Gmail এখনো নিবন্ধিত নয়; তাই promotion ইচ্ছাকৃতভাবে ব্যর্থ হবে যতক্ষণ না সেটি স্বাভাবিক signup, email verification এবং প্রথম login সম্পন্ন করে।

মূল database migration: `supabase/two_admin_allowlist_recovery.sql`
