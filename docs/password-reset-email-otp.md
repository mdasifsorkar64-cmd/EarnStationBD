# Google-based password recovery (Test Project)

This branch replaces email OTP recovery with Google OAuth identity verification. It does not send email or SMS OTP.

## How it works

1. Member enters their registered Gmail and Bangladesh mobile number.
2. The app stores these two values only in the current browser tab's session storage, then starts Supabase Google OAuth.
3. Google authenticates the account. The Google email must exactly match the entered registered email.
4. The authenticated Supabase user must have a `public.profiles` row whose phone matches the entered number.
5. Only then does the app show the new-password form. The password is changed through the authenticated Supabase session (`auth.updateUser`), never through a browser-exposed service-role key.
6. The app signs the user out after changing the password.

The phone number is a database match, not proof that the user currently owns the SIM. Google account authentication is the actual identity proof.

## Test-project setup (manual, no secrets in GitHub/chat)

Use **EarnStationBD-Test** only. Do not configure or change production while testing.

### A. Google OAuth client

1. Open Google Cloud Console and create/select a project.
2. Configure Google Auth Platform / OAuth consent screen. While testing, choose the testing audience and add the test Gmail as a test user if Google requires it.
3. Create an OAuth Client ID of type **Web application**.
4. Add the branch preview origin as an Authorized JavaScript origin:
   `https://feature-password-email.earnstationbd.pages.dev`
5. Add the Test Supabase project's OAuth callback as an Authorized redirect URI:
   `https://rxfgozophvsriaslifab.supabase.co/auth/v1/callback`
6. Copy the Client ID and Client Secret directly into Supabase Dashboard. Never commit or paste the Client Secret into chat.

### B. Supabase Test Project

1. Open EarnStationBD-Test → Authentication → Providers → Google.
2. Enable Google and enter the Web Client ID and Client Secret from Google Cloud.
3. In Authentication → URL Configuration, add the branch preview recovery URL to the Redirect URLs allow list:
   `https://feature-password-email.earnstationbd.pages.dev/auth.html?recover=google`
   If Supabase rejects the query-specific URL, allow the exact preview origin/path according to the dashboard's URL pattern guidance; do not add production URLs for this test.
4. Confirm the Test Project has the existing `profiles` phone-read policy for an authenticated user to read their own profile.

## Test checklist

- Use an existing, email-confirmed test account with a profile phone.
- Request recovery and enter its registered Gmail + phone.
- Choose the same Gmail in Google OAuth.
- Wrong Google Gmail must not proceed.
- Correct Gmail but wrong phone must not proceed.
- Correct Gmail + matching profile phone should show new-password fields.
- Set password, verify sign-out, then log in using the new password.
- Confirm no OTP email or SMS is sent.
- Do not merge this branch or change production until testing is approved.

## Limitations and safeguards

- Google OAuth must be enabled/configured in the Test Project before this feature works.
- A Google account with no access to its Gmail cannot use this recovery path.
- Phone matching does not prove SIM possession.
- Do not add a Supabase service-role/secret key to frontend files.
