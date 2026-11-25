# Password reset by email OTP

The recovery UI now expects a manually entered six-digit email code. It deliberately does not use a clickable recovery URL, which prevents email link scanners from consuming the one-time token.

## Required Supabase configuration before testing

**Do not merge or deploy this change until the recovery email template is configured.** The current default Supabase recovery template uses `{{ .ConfirmationURL }}`, so it will continue sending a link and the OTP form will not receive a visible code.

Supabase currently requires Custom SMTP to be configured before editing hosted email templates in the Dashboard. Configure a trusted SMTP provider first, then open Authentication → Email Templates → Reset Password.

Suggested subject:

```
Your EarnStationBD password reset code
```

Suggested HTML body:

```html
<h2>Reset your EarnStationBD password</h2>
<p>We received a request to reset the password for {{ .Email }}.</p>
<p>Enter this six-digit code on the EarnStationBD password recovery page:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>
<p>This code can only be used once and expires according to your Supabase Email OTP expiration setting.</p>
<p>If you did not request this change, you can ignore this email.</p>
```

Important:
- Use `{{ .Token }}` in the body.
- Do not include `{{ .ConfirmationURL }}` or any clickable verification link in this recovery template.
- Keep the Supabase Email OTP expiration at a short, reasonable duration (the platform default is one hour; a shorter period may be selected).
- Do not paste SMTP passwords or API keys into GitHub, chat, or the website source.

## Test plan

1. Configure Custom SMTP and the Reset Password template above.
2. Deploy this branch to a Cloudflare Pages Preview.
3. Request a reset for an existing test account.
4. Confirm the email contains a six-digit code, not a reset link.
5. Enter the code on the preview page.
6. Confirm the registered phone check appears, then set a new password.
7. Sign out and verify login works with the new password; verify the old password fails.

Production remains unchanged until the pull request is reviewed and explicitly merged.
