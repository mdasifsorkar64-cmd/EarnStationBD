# EarnStationBD Backup Admin Setup (TEST)

## Approved identities
- Primary Admin: mdasifsorkar64@gmail.com
- Backup Admin: mdasifsorkar1414@gmail.com

Only these exact verified Auth email identities are allowlisted. The allowlist table is not readable or writable by anon/authenticated clients.

## Activate the Backup Admin
1. Open the TEST EarnStationBD website.
2. Sign up using mdasifsorkar1414@gmail.com as a normal member. Do not share the Primary Admin password.
3. Open that Gmail inbox and confirm the email address.
4. Sign in to the new account once so its member profile is created.
5. Sign back in as the Primary Admin.
6. Open Admin Panel → Member Management.
7. In “Backup Admin ও জরুরি পুনরুদ্ধার”, verify the Backup Gmail is registered and confirmed.
8. Press “Backup Admin সক্রিয় করুন” and confirm. The action promotes only the exact allowlisted Backup Gmail and writes an audit event.

## Recover the Primary Admin
1. If the Primary Admin is suspended or loses Admin role, sign in with the Backup Admin Gmail.
2. Open the Admin Panel.
3. Open Member Management → “Backup Admin ও জরুরি পুনরুদ্ধার”.
4. Press “Primary Admin পুনরুদ্ধার করুন” and confirm.
5. The Primary profile is restored to role=admin and account_status=active. The Primary Admin must sign in again to obtain a fresh session.

## Important safeguards
- The Backup Admin receives full Admin powers. Keep its Gmail and password secure and enable two-step verification.
- Admin member-management actions cannot suspend or change another Admin; they only update profiles whose role is member.
- Ordinary members cannot read or edit the allowlist or call privileged recovery successfully.
- This setup is applied only to EarnStationBD-Test. Production has not been changed.
- The Backup Gmail must be registered and email-confirmed before activation. No password or OTP is stored in this repository.
