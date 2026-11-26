# EarnStationBD — Primary ও Backup Admin Recovery

এই ব্যবস্থা কেবল নির্ধারিত দুটি ঠিকানার জন্য:

- Primary Admin: `mdasifsorkar64@gmail.com`
- Backup Admin: `mdasifsorkar1414@gmail.com`

## Backup Admin সক্রিয় করার ধাপ

1. Backup Gmail মালিক নিজে ব্যবহার করে EarnStationBD-তে স্বাভাবিক সদস্য হিসেবে নিবন্ধন করবেন।
2. ওই Gmail-এর ইমেইল যাচাই সম্পন্ন করবেন এবং অ্যাকাউন্ট Active রাখবেন।
3. Primary Admin লগইন করে Admin Panel → আয় ও সীমা নিয়ন্ত্রণ → জরুরি Admin Recovery খুলবেন।
4. **নির্ধারিত Backup Admin চালু করুন** চাপবেন।
5. সার্ভার নিশ্চিত করবে যে কলকারী Primary Gmail, Backup Gmail ঠিকভাবে নিবন্ধিত ও verified, এবং অ্যাকাউন্ট Active। এরপরই role `admin` হবে।

## Primary Admin পুনরুদ্ধার

Primary Admin-এর `account_status` suspended হলে Backup Admin লগইন করে একই প্যানেলে **Primary Admin পুনরুদ্ধার করুন** চাপবে। সার্ভার শুধু নির্দিষ্ট Primary Gmail-কে `role=admin` ও `account_status=active` করবে এবং Audit Log লিখবে।

## নিরাপত্তা সীমা

- কোনো ইমেইল/UUID ইনপুট নেওয়া হয় না; নির্দিষ্ট দুই Gmail কোডে allowlisted।
- Primary promotion RPC শুধু সক্রিয় Primary Admin-এর জন্য।
- Recovery RPC শুধু সক্রিয় Backup Admin-এর জন্য।
- RPC-গুলো `anon` ও `public` থেকে revoke করা; `authenticated`-এর জন্য grant থাকলেও ফাংশনের ভিতরে পরিচয় ও Admin status যাচাই বাধ্যতামূলক।
- Admin action audit log-এ সংরক্ষিত হয়।
- এটি Auth account deletion, email compromise, বা Supabase Project Owner হারানোর বিকল্প recovery নয়। Primary Gmail ও Backup Gmail উভয়ের 2-step verification চালু রাখুন।
- Production-এ migration প্রয়োগ করা যাবে না যতক্ষণ না আলাদা স্পষ্ট অনুমোদন পাওয়া যায়।

## বর্তমান Test অবস্থার নোট

Test project-এ Primary Admin সক্রিয়। Backup Gmail এখনো নিবন্ধিত নয়; তাই promotion ইচ্ছাকৃতভাবে ব্যর্থ হবে যতক্ষণ না সেটি স্বাভাবিক signup ও email verification সম্পন্ন করে।
