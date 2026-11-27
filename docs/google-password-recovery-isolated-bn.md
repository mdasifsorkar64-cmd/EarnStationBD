# Google Password Recovery — Isolated Implementation (বাংলা)

এই branch `fix/financial-accounting` থেকে তৈরি। এটি production code বা database পরিবর্তন করে না।

## উদ্দেশ্য
সদস্যের নিজের Google account-এর email ও EarnStationBD profile-এর registered phone মিলিয়ে authenticated Supabase session-এর মাধ্যমে password reset; তারপর session sign-out।

## নিরাপত্তা নিয়ম
- Google OAuth শুধুমাত্র আলাদা `EarnStationBD-Test` Supabase project-এ enable ও test করতে হবে।
- Google email অবশ্যই member-এর entered registered email-এর সঙ্গে exact normalized match হতে হবে।
- ফোনটি authenticated user-এর নিজের `profiles.id = auth user.id` row থেকে যাচাই করতে হবে; অন্য user-এর profile lookup করা যাবে না।
- ব্যবহারকারী স্পষ্টভাবে SMS/ফোন OTP চান না। নিবন্ধিত ফোন নম্বর শুধু authenticated user's own profile-এর সঙ্গে মিলিয়ে দেখা হবে; এটি ফোনের মালিকানা প্রমাণ নয়। মূল identity proof Google OAuth।
- Frontend-এ service-role key, secrets, recovery tokens বা passwords store/log করা যাবে না।
- OAuth state/PKCE Supabase client-এর managed flow ব্যবহার করতে হবে; callback error/cancel, expired session, duplicate callback, wrong account, stale session নিরাপদে handle করতে হবে।
- Reset সফল হলে session data clear ও sign-out; user-কে login screen-এ ফেরত দিতে হবে।
- Existing password accounts-এ automatic identity linking বা account merge করা যাবে না।
- কোনো production migration, production OAuth setting বা deployment এই branch-এ করা হবে না।

## Acceptance checklist
- [ ] Registered Google email + profile phone match → reset allowed
- [ ] Different Google email → denied
- [ ] Incorrect phone → denied, no password change
- [ ] Google cancellation / OAuth error → clear Bengali message
- [ ] Direct callback without expected recovery state → denied
- [ ] Repeated callback cannot run reset twice
- [ ] Weak/mismatched new password → denied
- [ ] Password update success → sign out and clear recovery state
- [ ] Existing email/password login and registration still work
- [ ] Syntax checks + focused browser flow tests pass
- [ ] Preview tested only against isolated Test Supabase project

## Status
Planning/security baseline only. Feature implementation is not yet merged or deployed. See issue #17 for follow-up.
