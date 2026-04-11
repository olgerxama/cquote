# ConveyQuote

White-label conveyancing quote platform for law firms. Firms embed a public quote form
on their website; visitors answer a few questions, receive an instant estimate, and can
instruct online. Firms manage pricing, leads, quotes and instructions from a dashboard.

- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4, deployed to Cloudflare Pages.
- **Backend:** Supabase — Postgres with RLS, Auth, and Edge Functions (Deno).
- **Email:** SMTP (primary), with SendGrid and Resend as automatic fallbacks.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project
npm run dev
```

The dev server runs at <http://localhost:5173>.

## Environment variables

Create a `.env.local` for the frontend (see `.env.example`). Only variables prefixed
`VITE_` are exposed to the browser.

| Key | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |

Edge functions read secrets from Supabase function environment. Set these with
`supabase secrets set KEY=value`:

| Key | Purpose |
| --- | --- |
| `SUPABASE_URL` | Auto-populated by Supabase |
| `SUPABASE_ANON_KEY` | Auto-populated by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-populated by Supabase |
| `APP_BASE_URL` | Public base URL used in email links (e.g. `https://conveyquote.com`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` | SMTP credentials (primary email transport) |
| `SMTP_FROM_EMAIL` | Default `From` address |
| `SENDGRID_API_KEY` | Optional fallback |
| `RESEND_API_KEY` | Optional fallback |

Email sending tries SMTP first, then SendGrid, then Resend. Only one provider needs
to be configured for emails to work.

## Database

Schema + RLS policies live in `supabase/migrations/`. Apply with:

```bash
supabase db push
```

Seed a platform owner by inserting a row into `user_roles` for your auth user:

```sql
insert into user_roles (user_id, role) values ('<your-auth-user-id>', 'platform_owner');
```

## Edge functions

Four self-contained Deno functions under `supabase/functions/` — none share code (no
`_shared` directory) so deployments are simple and isolated:

| Function | Called from | Purpose |
| --- | --- | --- |
| `create-public-lead` | Public quote form | Insert lead, create quote, send firm notification + auto customer email |
| `send-quote-email` | Admin Leads page | Send a quote/invoice email (with optional PDF attachment) and mark the quote as sent |
| `resolve-instruction-context` | Public instruction page | Resolve firm + lead + quote for an instruction reference |
| `submit-instruction` | Public instruction page | Persist instruction details and notify the firm |

Deploy them individually:

```bash
supabase functions deploy create-public-lead
supabase functions deploy send-quote-email
supabase functions deploy resolve-instruction-context
supabase functions deploy submit-instruction
```

## Deploying the frontend to Cloudflare Pages

1. Connect this repo in the Cloudflare Pages dashboard.
2. Build command: `npm run build`
3. Build output: `dist`
4. Environment variables: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

The SPA routing is handled by the `_redirects` file in `public/`.

## Project layout

```
src/
  pages/               Routes (public, admin, owner)
  components/          UI primitives and feature components
  contexts/            Auth context
  hooks/               React hooks (useQuoteForm)
  lib/                 Pricing engine + utilities
  integrations/        Supabase client
  types/               Shared domain types
supabase/
  migrations/          Database schema + RLS
  functions/           Edge functions (Deno)
```

## Scripts

```bash
npm run dev       # Vite dev server
npm run build     # Type check + production build
npm run preview   # Preview the production build
npm run lint      # ESLint
```
