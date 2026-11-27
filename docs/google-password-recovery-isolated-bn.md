# ইমেইল OTP দিয়ে পাসওয়ার্ড পুনরুদ্ধার (বাংলা)

- সদস্য নিবন্ধিত ইমেইল ও অ্যাকাউন্টে সংরক্ষিত ফোন নম্বর দেবেন।
- Supabase Auth `resetPasswordForEmail(email)` দিয়ে ইমেইলে ৬ সংখ্যার OTP পাঠাবে।
- Supabase Reset Password email template-এ `{{ .Token }}` থাকতে হবে; `{{ .ConfirmationURL }}` নয়।
- সদস্য `verifyOtp({ email, token, type: "recovery" })` দিয়ে OTP যাচাই করবেন।
- OTP সফল হলে কেবল authenticated user-এর নিজের `profiles.id = auth user.id` row থেকে ফোন নম্বর মিলিয়ে দেখা হবে।
- SMS বা ফোন OTP পাঠানো হবে না।
- ইমেইল OTP ও ফোন নম্বর—দুটোই মিললে authenticated Supabase session দিয়ে নতুন পাসওয়ার্ড সংরক্ষণ হবে; শেষে session clear/sign out হবে।
- SMTP এবং Reset Password template আলাদা EarnStationBD-Test project-এ যাচাই করতে হবে। SMTP password কখনো repository-তে রাখা যাবে না।
- Production OAuth, database, secrets বা deployment পরিবর্তন করা হবে না।

## Test checklist
- [ ] সঠিক ইমেইলে OTP পৌঁছায়
- [ ] ভুল/মেয়াদোত্তীর্ণ OTP প্রত্যাখ্যাত
- [ ] সঠিক OTP + সঠিক profile phone → password reset
- [ ] সঠিক OTP + ভুল phone → password অপরিবর্তিত
- [ ] ভুল ইমেইল/অ্যাকাউন্টে reset সুবিধা প্রকাশ না করা
- [ ] reset সফল হলে sign out
- [ ] login/registration আগের মতো কাজ করে
- [ ] কেবল EarnStationBD-Test project-এ end-to-end পরীক্ষা
