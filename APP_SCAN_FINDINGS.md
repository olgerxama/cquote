# ConveyQuote App Scan Findings

_Date scanned: 2026-04-13 (UTC)_

## 1) High-level understanding

ConveyQuote is a multi-tenant conveyancing quote platform.

- Public users complete a quote form per firm slug (`/quote/:firmSlug`) and submit an enquiry.
- Pricing is calculated client-side from `pricing_bands` + `pricing_extras` + optional discount code.
- Submission calls the `create-public-lead` edge function, which creates a lead, optionally creates quote + quote_items, and sends notification/customer emails.
- Admin users (firm members) manage leads, generate/edit quotes, and configure pricing/settings.
- Platform owners (`user_roles.role = platform_owner`) can see cross-firm views and controls.
- Instruction flow is handled via `/quote/:firmSlug/instruct?ref=...` plus two edge functions (`resolve-instruction-context`, `submit-instruction`).

---

## 2) Data model (Supabase migration)

The initial migration defines these main entities:

- `firms`: tenant root + branding + quote/form behavior flags + email settings + plan/subscription metadata.
- `firm_users`: maps auth users to a firm.
- `user_roles`: global roles enum (`admin`, `platform_owner`).
- `pricing_bands`: base legal fee bands by service and value range.
- `pricing_extras`: optional/conditional extras (automatic or manual_optional), VAT flags, optional service filter.
- `discount_codes`: fixed/percentage codes with validity and usage caps.
- `leads`: public/admin enquiry records with normalized columns + raw answers JSON.
- `quotes`: quote totals/status/reference and document tracking fields.
- `quote_items`: line-level pricing rows.

### SQL helpers and integrity

- `update_updated_at_column()` trigger function updates `updated_at` on key tables.
- `get_user_firm_id(_user_id)` returns one firm mapping.
- `has_role(_user_id, _role)` checks global role.
- `increment_discount_use_count(_discount_code_id)` validates active/date/usage then atomically increments usage.

### RLS posture

- Most tables enforce firm isolation for authenticated users.
- `platform_owner` gets cross-firm read access where policy includes `has_role` checks.
- Public/anon reads are intentionally allowed for quote-form-critical data (`firms`, `pricing_bands`, `pricing_extras`, active `discount_codes`) with constraints around firm active/public state.
- Public inserts are allowed on `leads` with firm existence check.

Overall: schema is coherent and aligned with app behavior, with explicit tenancy controls.

---

## 3) Edge functions (detailed)

## 3.1 `create-public-lead`

Responsibilities:

1. Validates minimal lead payload (`firm_id`, `email`, `full_name`).
2. Verifies firm is active + public-form-enabled.
3. Inserts `leads` row.
4. If discount exists: calls `increment_discount_use_count` RPC.
5. If not review-status and totals exist: creates `quotes` row + `reference_code`, inserts `quote_items`.
6. Sends firm notification email.
7. Optionally auto-sends customer quote email when `firm.auto_send_quote_emails` is true.
8. Returns `{ id, quoteId, instructionRef, emailTasks }`.

Email provider fallback order: SMTP -> SendGrid -> Resend.

## 3.2 `send-quote-email`

Responsibilities:

1. Requires Authorization header and validates user via anon client.
2. Loads quote + lead + firm using service role.
3. Builds quote/invoice HTML and optional PDF attachment.
4. Sends via same provider fallback chain.
5. Updates quote status/metadata (`status='sent'`, `sent_at`, `document_type`, `document_generated_at`).

## 3.3 `resolve-instruction-context`

Responsibilities:

1. Accepts `{ firmSlug, ref }`.
2. Resolves active firm by slug.
3. Resolves quote+lead by `reference_code` OR lead by UUID fallback.
4. Loads quote items if quote exists.
5. Returns firm/lead/quote/items context used by the public instruction page.

## 3.4 `submit-instruction`

Responsibilities:

1. Accepts `{ firmSlug, leadId, details }`.
2. Resolves firm + lead.
3. Merges into `leads.answers` under:
   - `instruction` (details payload)
   - `instruction_submitted_at` (timestamp)
4. Sends firm notification email.

---

## 4) Frontend architecture and flow

Routing partitions:

- Public: `/`, `/quote/:firmSlug`, `/quote/:firmSlug/instruct`
- Admin auth: `/admin/login`, `/admin/signup`, `/admin/onboarding`
- Firm admin protected: `/admin`, `/admin/leads`, `/admin/instructions`, `/admin/pricing`, `/admin/settings`
- Owner protected: `/owner`, `/owner/firms/:firmId`, `/owner/analytics`

Auth model:

- `AuthContext` pulls Supabase session and resolves:
  - `firmId` from `firm_users`
  - `isPlatformOwner` via RPC `has_role`
- `ProtectedRoute` enforces login + firm membership.
- `OwnerProtectedRoute` enforces login + platform_owner.

State/data layer:

- Supabase JS client in browser.
- TanStack Query for server state.
- Sonner for notifications.

## 4.1 Public quote page behavior

`PublicQuotePage`:

- Loads firm by slug, plus bands/extras.
- Builds service availability from `public_form_config` toggles.
- Supports hidden field config via `hidden_fields` keys.
- Validates discount codes client-side.
- Calculates quote using `calculateQuoteWithFallback`.
- Flags manual review if:
  - `firm.require_admin_review` is true, OR
  - configured manual review conditions match answers, OR
  - no pricing band matched (`noMatchFallback`).
- Submits via edge function; if function fails, falls back to direct `leads` insert.

## 4.2 Pricing engine behavior (`src/lib/quoteEngine.ts`)

- VAT fixed at 20% on vatable positive items.
- Base fees:
  - Single service: finds matching band by value range.
  - `sale_purchase`: independently resolves sale and purchase bands.
- Automatic extras:
  - Applies `pricing_extras` where `apply_mode='automatic'` and condition matches.
  - Supports `equals` and `not_equals` operators.
- Discounts:
  - Applies fixed or percentage discount as a negative line item.
  - Capped at positive subtotal.
- Totals computed by `recalculateTotals`.

## 4.3 Admin area behavior

- Dashboard: quick lead/quote metrics and recent leads.
- Leads:
  - Filters/search/pagination.
  - Detail panel with answers and status updates.
  - Quote generator/recalculator and editable line items.
  - Save quote updates/creates `quotes` + rewrites `quote_items` + marks lead `quoted`.
  - “Send Quote Email” button currently shows toast only (no edge-function call wired yet).
- Pricing:
  - Full CRUD for fee bands, extras, discount codes.
  - Includes “common extras” bulk insert helper.
- Settings:
  - Firm profile, branding, quote behavior toggles, manual review rules, email values.
  - Public form section toggles and per-field visibility controls.
  - Embed tab exposes direct URL and iframe snippets.

## 4.4 Public instruction flow

- Instruct page resolves context through edge function.
- Submits details to `submit-instruction` function.
- Shows quote summary if quote/items present.

## 4.5 Owner area behavior

- Owner firms list with basic plan/active/lead stats.
- Owner firm detail allows toggling active/public form and plan, plus notes.
- Owner analytics aggregates firms/leads/quotes in client queries and derives summary cards.

---

## 5) Notable gaps / inconsistencies discovered

1. **Embed auto-resize message mismatch**
   - Public page posts `{ type: 'conveyquote-resize', height }`.
   - Embed snippet listener expects `type === 'conveyquote:height'`.
   - Result: recommended auto-resizing snippet will not react unless one side is changed.

2. **Instruction data key mismatch in admin page**
   - `submit-instruction` stores details under `answers.instruction`.
   - `InstructionsPage` reads `answers.instruction_data`.
   - Result: instruction details may appear empty in admin detail dialog even when submitted.

3. **Send quote email action not wired in admin leads UI**
   - Button currently only fires success toast in `LeadsPage`.
   - Edge function `send-quote-email` exists and is capable, but not integrated here.

4. **Public submit fallback bypasses quote + notifications**
   - On edge function failure, direct DB insert only creates `lead`.
   - No quote/items/discount usage increment/emails are executed in fallback path.
   - This may be intentional resiliency, but behavior is materially different.

5. **Instruction reference flexibility is broad**
   - Resolver accepts either quote `reference_code` or raw lead UUID.
   - Useful for recovery, but UUID usage expands discoverability risk if links leak.

---

## 6) Overall readiness for change work

I now understand the end-to-end architecture and runtime behavior across:

- Supabase schema and RLS
- All edge functions
- Public/admin/owner frontend flows
- Pricing and instruction pipelines

I am ready to implement requested changes next.

