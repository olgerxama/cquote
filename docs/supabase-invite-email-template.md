# Supabase Invite Email Templates (copy-ready)

Use these in **Supabase → Authentication → Email Templates → Invite user**.

The app now passes these metadata keys in invite payloads:
- `firm_name`
- `inviter_name`
- `member_role`

> Supabase templates use Go template syntax, so you can reference values like `{{ .Data.firm_name }}`.

---

## Subject line template

```txt
You're invited to {{ .Data.firm_name }} on ConveyQuote ({{ .Data.member_role }})
```

---

## HTML body template

```html
<h2 style="margin:0 0 12px;font-family:Arial,sans-serif;color:#1e3a5f;">You’re invited to join {{ .Data.firm_name }}</h2>

<p style="font-family:Arial,sans-serif;color:#333;line-height:1.5;">
  Hi there,
</p>

<p style="font-family:Arial,sans-serif;color:#333;line-height:1.5;">
  <strong>{{ .Data.inviter_name }}</strong> has invited you to join <strong>{{ .Data.firm_name }}</strong>
  on ConveyQuote as <strong>{{ .Data.member_role }}</strong>.
</p>

<p style="font-family:Arial,sans-serif;color:#333;line-height:1.5;">
  Click below to accept the invite and continue:
</p>

<p style="margin:20px 0;">
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-family:Arial,sans-serif;font-weight:600;">
    Accept invitation
  </a>
</p>

<p style="font-family:Arial,sans-serif;color:#666;font-size:13px;line-height:1.5;">
  If the button doesn’t work, copy and paste this link into your browser:<br />
  <a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a>
</p>

<hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />

<p style="font-family:Arial,sans-serif;color:#666;font-size:12px;line-height:1.5;">
  If you weren’t expecting this invite, you can ignore this email.
</p>
```

---

## Plain text fallback template

```txt
You’re invited to join {{ .Data.firm_name }} on ConveyQuote.

{{ .Data.inviter_name }} invited you as {{ .Data.member_role }}.

Accept invite: {{ .ConfirmationURL }}

If you were not expecting this email, you can ignore it.
```
