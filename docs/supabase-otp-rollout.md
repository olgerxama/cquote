# Supabase setup actions required for OTP-first auth

This project now uses:
- **Password login** for normal sign-in.
- **OTP verification** for password reset (including new-user signup handoff).
- Signup handoff URL pattern: `/reset-password?email=user@example.com&flow=signup` (email prefilled).

To make that flow work reliably and avoid magic-link confusion, please complete the actions below in your Supabase project.

## 1) Enable Email provider and OTP-friendly behavior
1. Go to **Supabase Dashboard → Authentication → Providers → Email**.
2. Ensure **Email provider is enabled**.
3. Keep **Confirm email** enabled (recommended for account safety).
4. If your project has a **magic link vs OTP code toggle**, choose **OTP code** behavior (or configure templates to clearly present the OTP token).

## 2) Configure email templates for OTP use
Go to **Authentication → Email Templates** and update at least:
- **Confirm signup** template
- **Magic Link / Sign in** template (used by OTP login)
- **Invite user** template

Recommended template notes:
- Make the code prominent and short-lived wording explicit.
- Include app branding and support contact.
- For invite emails, you can now use these metadata variables passed by the app edge function:
  - `firm_name`
  - `inviter_name`
  - `member_role`

## 3) Set secure redirect URLs
Go to **Authentication → URL Configuration** and make sure these are present:
- **Site URL**: your production app origin (e.g. `https://app.yourdomain.com`)
- **Additional Redirect URLs**: include local + prod admin auth pages as needed, e.g.
  - `http://localhost:5173/admin/*`
  - `https://app.yourdomain.com/admin/*`

## 4) SMTP / sender domain hygiene
Because auth emails come from Supabase Auth templates:
1. Configure your preferred sender domain in **Project Settings → Authentication email settings / SMTP**.
2. Verify SPF/DKIM records (if using custom SMTP) so OTP emails don’t land in spam.
3. Send test signup/login/invite emails to Gmail + Outlook to validate deliverability.

## 5) OTP policy and rate limits
In **Authentication settings**:
- Keep OTP expiry short (commonly 5–10 minutes).
- Enable brute-force protections / rate limiting defaults.
- If you expect high volume, review throttling to avoid accidental lockouts.

## 6) Invite flow note
The app still uses Supabase `inviteUserByEmail` for team membership.
That means invite acceptance is controlled by your Supabase invite template/flow.
If you want code-entry-only invite acceptance (instead of links), set that behavior in Supabase templates/settings and test `/admin/accept-invite`.

## 7) End-to-end test checklist (after config)
1. New signup with OTP code.
2. Existing user login with password.
3. Password reset using OTP + set new password.
4. New signup: email entry → redirected reset page (`flow=signup`) → verify OTP → set password.
5. Team invite as **Admin** and **Read-only**; validate template variables render.
6. Switch browser windows and confirm no apparent app refresh/flicker.

---
If you want, I can also add a second markdown with copy-ready default email template bodies (signup/login/invite/reset) tailored to ConveyQuote tone and branding.
