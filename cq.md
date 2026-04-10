# FULL_APP_REBUILD_HANDOFF_DETAILED

> Goal: this is a **rebuild-grade reverse-engineering handoff** for ConveyQuote, written so a brand-new Codex chat can recreate the product without access to the original code.

## 1. Product Overview

### What the app does
ConveyQuote is a white-label conveyancing quote platform for law firms. It embeds on a firm website, captures detailed client answers, calculates pricing from configurable fee rules, stores leads/quotes, and supports email + instruction workflows.

Primary business sequence:
1. Prospect completes public quote form.
2. System calculates quote or flags manual review.
3. Lead is stored.
4. Draft quote and line items are optionally persisted.
5. Notifications/emails are sent (firm + customer depending on plan/config/status).
6. Customer can click instruction link and submit instruction details.
7. Admin/owner users manage pipeline, pricing, settings, and exports.

### User roles
- **Anonymous public user**: Can access quote page by firm slug; can submit quote requests.
- **Authenticated firm admin (firm member)**: Can manage that firm’s leads, quotes, pricing, forms, and settings.
- **Platform owner** (`user_roles.role = platform_owner`): Cross-firm read/update visibility and analytics.

### Core flows (quote → lead → quote → instruction)
- **Public Quote Flow**: `/quote/:firmSlug` loads firm config + pricing data, gathers answers, optionally applies discount, calls `create-public-lead`.
- **Lead & Quote Flow**: Admin opens `/admin/leads`, can auto-generate or edit quote items, save/update quote, preview estimate/invoice, and send email via edge function.
- **Instruction Flow**: Customer opens `/quote/:firmSlug/instruct?ref=...`, context resolved by `resolve-instruction-context`, instruction submitted to `submit-instruction`.

---

## 2. Full Architecture

### Frontend stack
- **React + TypeScript + Vite**.
- **TanStack Query** for server-state fetch/mutation.
- **shadcn + Radix wrappers** in `src/components/ui/*`.
- **Route-driven app** with public/admin/owner partitions in `src/App.tsx`.

### Backend (Supabase)
- Postgres with RLS.
- Supabase Auth for user sessions.
- Supabase Edge Functions for privileged workflows:
  - lead creation orchestration
  - quote/instruction email dispatch
  - Stripe checkout session creation
  - instruction context resolution

### Auth model
- Client auth/session tracked in `AuthContext`.
- Firm membership resolved through `firm_users`.
- Platform owner resolved via RPC `has_role(user_id, 'platform_owner')`.
- Route guards:
  - `ProtectedRoute`: requires user + firm link.
  - `OwnerProtectedRoute`: requires user + platform_owner.

### Routing
- `/` marketing page
- `/quote/:firmSlug` public form
- `/quote/:firmSlug/instruct` instruction page
- `/admin/*` firm admin
- `/owner/*` platform owner

### Data flow
- Public page loads pricing config from DB.
- Local quote engine computes draft breakdown.
- Edge function creates lead (+ quote/items when eligible).
- Admin editing uses persisted quote_items + recalculation helper.
- Email/document state (sent/downloaded/generated timestamps) tracked in `quotes`.

### Third-party services
- **Stripe**: subscription checkout for professional plan.
- **Email providers** (fallback): SMTP, SendGrid, Resend.
- **PDF**:
  - Frontend: html2canvas + jsPDF (`pdfUtils`).
  - Edge: `pdf-lib` for generated attachments (quote/instruction variants).

---

## 3. FULL PRICING SYSTEM DEEP DIVE (VERY IMPORTANT)

## 3.1 Pricing Inputs (from UI)

Pricing-relevant input sources:
- `PurchaseSection`
- `SaleSection`
- `RemortgageSection`
- `AdditionalInfoSection`
- `Timeline & Notes` block in `PublicQuotePage`
- Discount code input (if enabled by form config)

Canonical fields (from types + `PUBLIC_FORM_FIELDS`):

### Service selection
- `serviceType`: `purchase | sale | sale_purchase | remortgage`
- UI: top service buttons in `PublicQuotePage`.
- Pricing impact: determines which base band lookup path is used.

### Purchase fields
- `purchase_price` (primary valuation input)
- `tenure` (`freehold`/`leasehold`)
- `is_newbuild`
- `is_shared_ownership`
- `has_mortgage`
- `is_first_time_buyer`
- `buyer_count`
- `gifted_deposit` (`yes/no/not_sure`)
- `uses_help_to_buy_isa`
- `uses_right_to_buy`
- `uses_help_to_buy_equity_loan`

### Sale fields
- `sale_price` (valuation input)
- `tenure`
- `has_existing_mortgage`
- `is_shared_ownership`
- `seller_count`

### Remortgage fields
- `remortgage_property_value` (valuation input)
- `tenure`
- `is_buy_to_let`
- `transfer_of_equity`
- `remortgagor_count`
- `recommend_mortgage_broker`

### Additional fields
- `buy_to_let`
- `second_home`
- `company_purchase`
- `auction_purchase`
- `probate_related`
- `speed_essential`
- `lender_name`
- `source_of_funds_notes`
- `chain_related_notes`

### Timeline/common fields
- `instruct_timeline`
- `special_instructions`

### Contact/lead metadata fields
- `first_name`, `surname`, `email`, `phone`
- These do not alter base calculations directly, but influence lead persistence and downstream communication.

### Option-by-option required extraction (UI + storage + pricing behavior)

Below each option states: **UI location**, **storage**, **pricing effect**, **quote item/totals/VAT effect**, **extra trigger potential**, **manual review potential**, **discount interaction**, **email/instruction impact**.

#### Buy to Let
- UI appears in:
  - `RemortgageSection`: `remortgage.is_buy_to_let`
  - `AdditionalInfoSection`: `additional.buy_to_let`
- Storage:
  - persisted in `leads.answers` JSON (non-default filtering applies for additional section in `useQuoteForm.getAnswersJson`).
- Pricing effect:
  - no hardcoded multiplier.
  - can trigger automatic extras via `pricing_extras.condition_field` = `is_buy_to_let` or `buy_to_let`.
- Quote item impact:
  - creates extra line item(s) if matching extra rules.
- VAT/totals:
  - extra contributes VAT only if `vat_applicable = true`.
- Manual review:
  - can trigger if firm config has manual rule matching `buy_to_let`/`is_buy_to_let`.
- Discount eligibility:
  - no direct exclusion rule; discount applies to positive subtotal unless no-match fallback.
- Email/instruction:
  - only indirect through resulting totals/items and lead answers shown in admin/instruction pack.

#### First Time Buyer
- UI: `PurchaseSection` (`purchase.is_first_time_buyer`).
- Storage: `leads.first_time_buyer` boolean backfilled for legacy + `answers.is_first_time_buyer`.
- Pricing effect: only via extras condition mapping; no built-in base discount.
- Quote items: potential automatic extra.
- VAT/totals: via extra VAT flag.
- Manual review: can be manual-review condition.
- Discount: unaffected directly.
- Email/instruction: appears in stored answers and admin displays.

#### Help to Buy ISA
- UI: `PurchaseSection` (`uses_help_to_buy_isa`).
- Storage: `answers.uses_help_to_buy_isa`.
- Pricing effect: optional via extra conditions only.
- Special note: common extras templates include a combined “Help to Buy ISA / Lifetime ISA Fee” item. No dedicated Lifetime-ISA field exists.

#### Lifetime ISA
- UI field: **none explicitly**.
- Storage: no dedicated JSON key.
- Pricing effect: only as a naming convention in template extra (manual optional by default).
- Rebuild implication: if true LISA logic is needed, add dedicated field + condition support.

#### Shared Ownership
- UI:
  - purchase: `is_shared_ownership`
  - sale: `is_shared_ownership`
- Storage: `answers.is_shared_ownership`.
- Pricing: via extras conditions.

#### Remortgage
- UI: service type selector.
- Storage: `leads.service_type='remortgage'` plus remortgage answers.
- Pricing:
  - base fee from `pricing_bands` with service_type `remortgage`.
  - extras filtered by `service_type` compatibility and condition matches.

#### Sale
- UI: service type selector.
- Storage: `service_type='sale'`.
- Pricing: band lookup on sale price in sale band.

#### Purchase
- UI: service selector.
- Storage: `service_type='purchase'`.
- Pricing: band lookup on purchase price in purchase band.

#### Sale + Purchase combined
- UI: service selector includes sale_purchase when both purchase and sale sections enabled.
- Storage: `service_type='sale_purchase'`.
- Pricing:
  - computes sale fee + purchase fee independently.
  - fallback if both missing.
  - produces two base fee items (`Sale — Legal Fee`, `Purchase — Legal Fee`).

#### Transfer of Equity
- UI: `RemortgageSection.transfer_of_equity`.
- Storage: `answers.transfer_of_equity`.
- Pricing: conditional extras only.

#### Leasehold vs Freehold
- UI: tenure select in purchase/sale/remortgage sections.
- Storage: `answers.tenure` + `leads.tenure` normalized.
- Pricing:
  - no intrinsic multiplier.
  - common extra template includes leasehold fee; automatic behavior depends on configured rule.

#### New Build
- UI: `PurchaseSection.is_newbuild`.
- Storage: `answers.is_newbuild`.
- Pricing: extra-rule driven only.

#### Property value ranges
- UI: `purchase_price`, `sale_price`, `remortgage_property_value` numeric fields.
- Storage: `answers.*price` fields + `leads.property_value` single normalized number.
- Pricing core:
  - base band selected where `min_value <= property_value <= max_value`.
  - first matching band in fetched order.

#### Mortgage types / mortgage-related toggles
- Present toggles:
  - `has_mortgage` (purchase)
  - `has_existing_mortgage` (sale)
  - `recommend_mortgage_broker` (remortgage)
  - `lender_name` (additional free-text)
- Storage: JSON answers + legacy bool `leads.mortgage_required` for purchase path.
- Pricing: conditional extras only.

#### Right to Buy / HTB Equity Loan / Gifted Deposit / Second Home / Company Purchase / Auction / Probate / Speed Essential
- All are **extras-trigger-capable toggles**, not hardcoded arithmetic rules.
- Behavior depends on configured pricing_extra rules.

## 3.2 Pricing Engine Logic (step-by-step)

Engine entrypoints:
- `calculateQuote(formData, bands, extras, discountCode?)`
- `calculateQuoteWithFallback(...)` returns `{ breakdown, noMatchFallback }`

Detailed steps:
1. **Normalize answers** (`flattenAnswers`): merges purchase/sale/remortgage/additional into flat object, adds aliases (`mortgage_required`, `first_time_buyer`, buy_to_let aliases), ensures tenure selection.
2. **Base fee selection**:
   - `sale_purchase`: lookup sale fee + purchase fee independently.
   - otherwise lookup by selected service and property value.
3. **No-match fallback detection**:
   - if service single and no band found -> fallback true.
   - if sale_purchase and both subfees missing -> fallback true.
4. **Base quote item creation**:
   - each matched fee becomes item_type `fee`, source_type `band`, VAT true.
5. **Automatic extras resolution** (`getApplicableExtras`) if not fallback:
   - only `is_active` extras.
   - only `apply_mode='automatic'`.
   - `service_type` null/all/current-service matching.
   - requires condition field + value.
   - operator `equals` or `not_equals`.
   - field key normalization strips section prefixes.
6. **Discount application** if supplied and not fallback:
   - validates active/date window/max uses.
   - calculates fixed or percentage on positive subtotal.
   - clamps discount to non-negative subtotal.
   - inserts negative non-vatable `discount` line item.
7. **Totals recomputation** (`recalculateTotals`):
   - subtotal = sum positive items
   - discountTotal = abs(sum negative items)
   - vatableTotal = sum positive + is_vatable
   - vat = vatableTotal * 20%
   - grand total = max(0, subtotal - discount + VAT)

## 3.3 Pricing Bands

### Structure
`pricing_bands` columns: `firm_id`, `service_type`, `min_value`, `max_value`, `base_fee`.

### Service support
Allowed values: `purchase`, `sale`, `sale_purchase`, `remortgage`.

### Lookup behavior
- Uses `Array.find` over fetched list order.
- No tie-breaker logic beyond first match.
- Inclusive boundaries on both ends.
- For sale_purchase, fallback search tries service-specific band then `sale_purchase` band.

### Practical rebuild note
In rebuild, add deterministic ordering and overlap validation (currently admin UI validates min<=max only, not overlap consistency).

## 3.4 Extras (conditional + optional)

### Data model
`pricing_extras` supports:
- `name`, `amount`
- `apply_mode`: `automatic` or `manual_optional`
- `trigger_operator`: `equals` | `not_equals`
- `condition_field`, `condition_value`
- `vat_applicable`
- `is_active`
- `service_type` nullable

### Automatic extras
Applied inside quote engine only when:
- quote has base fee match (not fallback)
- extra is active and automatic
- service compatibility satisfied
- condition matched on flattened answers

### Manual optional extras
- Not auto-applied by quote engine.
- Available in admin quote editor (`LeadsPage`) dropdown “Add Extra”.
- Inserted as `source_type='extra_manual'` line items.

### Condition fields available in pricing UI
Includes tenure, mortgage flags, first-time buyer, shared ownership, right-to-buy, HTB fields, additional toggles, count fields, and service_type.

### Common extras template
Pricing page can bulk insert manual optional extras (searches, fees, leasehold supplement, HTB/LISA fee, etc.). These default to optional/manual, not automatic.

## 3.5 Discounts

### Schema
`discount_codes`:
- `code`, `description`
- `discount_type` (`fixed`/`percentage`)
- `discount_value`
- `is_active`
- `valid_from`, `valid_until`
- `max_uses`, `use_count`

### Public-side discount flow
- User enters code on public form.
- Frontend validates by querying active code + date/limit checks.
- If valid, `validatedDiscount` passed to quote engine.
- On successful lead creation, `create-public-lead` calls RPC `increment_discount_use_count`.

### Admin-side discount flow
- Admin can apply active code manually in lead quote editor.
- Similar date/limit checks done client-side.
- Adds negative quote line item immediately.

### Discount restrictions
- Discount disabled when no-match fallback path used.
- Discount cannot exceed positive subtotal.
- Discount line is non-vatable.

## 3.6 VAT + totals

- VAT rate is hardcoded constant `0.20`.
- VAT computed only on positive line items marked `is_vatable=true`.
- Discount items reduce grand total but do not reduce VAT base directly (because non-vatable and excluded from VAT base).
- Grand total floor at zero.

## 3.7 Manual review / fallback

Manual review triggers in public flow:
1. `firm.manual_review_conditions` field/value match against flattened answers.
2. Free-plan and/or `require_admin_review` logic.
3. No matching fee bands (`noMatchFallback`).

Outcomes:
- Lead inserted with status `review` when manual review path chosen.
- In review mode no instant quote shown to customer.
- Auto quote email behavior suppressed for review path.

## 3.8 How final quote is constructed

### Public flow
- Quote built in browser first.
- Sent to edge function with `totals` and `quoteItems`.
- Edge function may persist `quotes` + `quote_items` (status draft) unless review.

### Admin flow
- Admin can load existing items or regenerate from engine.
- Admin can edit line items, apply codes, add manual extras/disbursements.
- Saving draft upserts `quotes` and recreates `quote_items` rowset.
- Sending email calls edge function then marks status sent.

---

## 4. Route-by-Route Breakdown

## Public routes
### `/`
- Purpose: marketing + CTA to signup/demo quote.
- User type: anonymous.
- Data loaded: none from DB.
- Dependencies: UI cards/buttons/icons.

### `/quote/:firmSlug`
- Purpose: public quote intake, pricing, submission, optional estimate/instruct.
- User: anonymous.
- Data loaded:
  - `firms` by slug
  - `pricing_bands` by firm
  - `pricing_extras` by firm
- Actions:
  - validate discount code
  - compute quote
  - submit via `create-public-lead`
  - show result/review state
  - optional PDF download and instruct redirect
- Depends on:
  - `useQuoteForm`, `quoteEngine`, quote section components, `EstimateDocument`, `pdfUtils`.

### `/quote/:firmSlug/instruct`
- Purpose: resolve quote context and capture instruction details.
- User: anonymous customer with link.
- Data loaded/actions:
  - invoke `resolve-instruction-context`
  - invoke `submit-instruction`
- Uses estimate preview component for context.

## Admin routes
### `/admin/login`
- email/password login via Supabase auth.

### `/admin/signup`
- registers user account.

### `/admin/onboarding`
- creates first firm and self-link membership.

### `/admin`
- dashboard counters from leads/quotes.

### `/admin/leads`
- central pipeline UI.
- loads leads, quotes map, pricing rules, discount codes, manual extras.
- supports manual lead creation, quote drafting, editing, status updates, email send via edge function.

### `/admin/instructions`
- lists leads with `answers.instruction_submitted_at`.
- shows instruction details and customer answer pack.
- resolves latest quote_items for invoice preview.

### `/admin/forms`
- edits `firms.public_form_config` toggles and hidden field list.

### `/admin/pricing`
- manages pricing bands, extras, discount codes.

### `/admin/settings`
- manages plan-dependent settings and manual review rules.
- starts stripe checkout via edge function.

### `/admin/embed`
- shows public URL and iframe/widget embed snippets.

## Owner routes
### `/owner`
- cross-firm listing with metrics.

### `/owner/firms/:firmId`
- firm detail, controls, exports, recent pricing/lead/quote data.

### `/owner/analytics`
- aggregate platform metrics and top-firm lists.

---

## 5. Frontend File-by-File Breakdown

This section has two layers:
1. **Deep-dive on meaningful logic files**.
2. **Exhaustive appendix for all files** (including small/shared files) at the end.

## 5.1 Core app + infra files

### `src/main.tsx`
- Bootstraps React root and imports global CSS.

### `src/App.tsx`
- Declares complete routing graph.
- Wraps app with QueryClientProvider, tooltip provider, toast systems, and AuthProvider.
- Establishes separation between public/admin/owner surfaces.

### `src/contexts/AuthContext.tsx`
- Tracks user/session/loading/firmId/isPlatformOwner.
- Resolves firm membership from `firm_users`.
- Resolves platform owner via RPC `has_role`.
- Handles auth state transitions, avoids stale identity mismatch via `lastUserIdRef`.

### `src/components/ProtectedRoute.tsx`
- Redirect logic:
  - unauthenticated -> `/admin/login`
  - authenticated without firm -> `/admin/onboarding`

### `src/components/OwnerProtectedRoute.tsx`
- Ensures only platform owners access owner pages.

### `src/integrations/supabase/client.ts`
- Browser Supabase client using Vite env vars.

### `src/integrations/supabase/types.ts`
- Generated typings for DB schema.
- Note: generated types may lag latest migrations (important rebuild warning).

## 5.2 Pricing + quote logic files

### `src/hooks/useQuoteForm.ts`
- Maintains defaults for purchase/sale/remortgage/additional/common/contact.
- Provides update handlers per section.
- `getFormData()` returns service-scoped payload for pricing.
- `getPropertyValue()` derives scalar value used in validations/display.
- `getAnswersJson()` persists relevant answers to lead JSON (filters default/no-value additional fields).

### `src/lib/quoteEngine.ts`
- Primary deterministic pricing implementation.
- Implements:
  - base band matching
  - extras matching by rule engine
  - discount calculation and clamping
  - VAT/totals recomputation
- Handles no-band fallback and sale+purchase dual pricing.

### `src/lib/publicFormFields.ts`
- Canonical field list used by Forms page to hide/show individual inputs.

### `src/lib/pdfUtils.ts`
- Browser-side PDF renderer for `EstimateDocument` using canvas + jsPDF.

## 5.3 Public experience pages/components

### `src/pages/PublicQuotePage.tsx`
- Highest complexity public flow.
- Loads firm/bands/extras, merges form config defaults.
- Computes visible service types based on config.
- Supports embed mode with dynamic postMessage height publishing.
- Validates form fields and discount codes.
- Calls quote engine and then edge function `create-public-lead`.
- Handles:
  - manual review state
  - quote display policy by plan
  - estimate document preview/download
  - instruct button generation with reference.

### `src/components/quote/PurchaseSection.tsx`
- Purchase inputs including new-build/shared ownership/mortgage/FTB/HTB toggles.

### `src/components/quote/SaleSection.tsx`
- Sale inputs including existing mortgage/shared ownership/seller count.

### `src/components/quote/RemortgageSection.tsx`
- Remortgage inputs including BTL + transfer-of-equity toggles.

### `src/components/quote/AdditionalInfoSection.tsx`
- Additional yes/no + notes fields that may trigger extras/review.

### `src/components/quote/QuoteResultDisplay.tsx`
- Renders computed line items and totals for customer.

### `src/components/quote/EstimateDocument.tsx`
- Document-like renderer reused in public/admin/instruction contexts.

### `src/pages/InstructPage.tsx`
- Resolves instruction reference, renders context + estimate preview.
- Submits instruction details to edge function.

## 5.4 Admin experience pages

### `src/pages/admin/AdminLayout.tsx`
- Grouped nav by domain (overview/pipeline/configuration).
- Displays identity + firm context.
- Includes platform-owner shortcut and sign out.

### `src/pages/admin/DashboardPage.tsx`
- Headline KPI cards + actionable queue indicators (review/new).
- Loads recent leads list.

### `src/pages/admin/LeadsPage.tsx`
- Most operationally critical page.
- Features:
  - filter/search/pagination.
  - manual lead creation.
  - draft quote generation from pricing rules.
  - quote editor with reorder/delete/add line items.
  - manual extras and discount code application.
  - save/update quote (rebuild quote_items set each save).
  - document preview and PDF download.
  - send email via `send-quote-email` edge function.
- Reads/writes many tables: leads, quotes, quote_items, pricing_bands, pricing_extras, discount_codes, firms.

### `src/pages/admin/InstructionsPage.tsx`
- Lists submitted instructions by checking JSON path in `leads.answers`.
- Provides modal with:
  - instruction details
  - customer submitted quote answers
  - invoice preview from latest quote_items.

### `src/pages/admin/PricingPage.tsx`
- Maintains fee bands, extras rules, discount codes.
- Condition system supports typed option lists and yes/no sets.
- Has “Add Common Set” extras helper (manual optional templates).

### `src/pages/admin/FormsPage.tsx`
- Controls public form structure (`public_form_config` JSON).
- Section toggles + searchable field-level visibility toggles.

### `src/pages/admin/SettingsPage.tsx`
- Plan display (free/professional).
- Quote display controls (instant quote, estimate document, review requirement).
- Manual review condition editor.
- Email settings (reply-to/sender/auto-send).
- Stripe upgrade trigger.

### `src/pages/admin/EmbedPage.tsx`
- Generates iframe embed and floating widget snippets.
- Includes origin-check resize message listener script.

### `src/pages/admin/LoginPage.tsx`, `SignupPage.tsx`, `OnboardingPage.tsx`
- Auth + onboarding primitives.

## 5.5 Owner pages

### `src/pages/owner/OwnerLayout.tsx`
- Owner nav shell.

### `src/pages/owner/OwnerFirmsPage.tsx`
- Cross-firm table with plan/status and computed counts.

### `src/pages/owner/OwnerFirmDetailPage.tsx`
- Firm-level controls and exports.
- Surfaces recent leads/quotes/bands/extras/codes/member info.

### `src/pages/owner/OwnerAnalyticsPage.tsx`
- Aggregate platform metrics and top firms.

## 5.6 Other files
- `src/types/index.ts`: domain contracts/constants/answer labels.
- `src/components/EmptyState.tsx`, `LiveChatWidget.tsx`, `NavLink.tsx`: reusable UI helpers.
- `src/test/*`: minimal test scaffold.
- `src/index.css`, `src/App.css`: theme/layout styling.
- `src/components/ui/*`: shared primitive wrappers.

---

## 6. Database Schema Deep Dive

## `firms`
- Purpose: firm tenant root + branding + plan + feature flags + Stripe metadata + form config.
- Pricing relevance:
  - `plan_type`
  - `show_instant_quote`, `show_estimate_document`
  - `require_admin_review`, `manual_review_conditions`
  - `public_quote_form_enabled`, `public_form_config`
  - `auto_send_quote_emails`
- Other key columns: slug, logo, color, disclaimers, reply_to_email, owner_user_id, stripe IDs.

## `firm_users`
- user-to-firm membership mapping.
- Used by auth context and RLS ownership checks.

## `user_roles`
- Global app roles (`admin`, `platform_owner`).
- RPC `has_role` used heavily in RLS and owner routing context.

## `pricing_bands`
- Base legal fee bands by service + value range.
- Constraints ensure service types only valid enum set.

## `pricing_extras`
- Rule-based and manual extras.
- Critical columns for engine:
  - `apply_mode`
  - `condition_field`, `condition_value`, `trigger_operator`
  - `vat_applicable`, `is_active`, `service_type`

## `discount_codes`
- Configurable fixed/percentage discounts.
- Time-window and usage-cap-aware.
- `increment_discount_use_count` RPC handles safe increment.

## `leads`
- Canonical customer submission.
- Hybrid model: structured columns + `answers` JSON.
- Status values used in pipeline: `new`, `review`, `quoted`.

## `quotes`
- Aggregate quote metadata and totals.
- Tracks document lifecycle: sent/generated/downloaded.
- `reference_code` supports customer-facing short references.

## `quote_items`
- Itemized breakdown for quotes.
- Holds item type, source metadata, VAT flags, manual/discount flags.

---

## 7. Migration-by-Migration Breakdown

### 20260311132227 (initial schema)
- Adds core tables, RLS enablement, baseline policies, updated_at trigger function and triggers.
- Keep in clean rebuild: **Yes (foundation)**.

### 20260311132239
- Replaces permissive lead insert policy with firm-exists check.
- Keep: **Yes (security hardening)**.

### 20260311133135
- Adds JSON answers, sale_purchase support, quote item type, discount table, lead name columns.
- Keep: **Yes (major model expansion)**.

### 20260311134429
- Adds `apply_mode` to pricing_extras.
- Keep: **Yes**.

### 20260311141624
- Adds firm plan/toggles and firm update policy.
- Keep: **Yes**.

### 20260311142737
- Adds quote document metadata timestamps/type.
- Keep: **Yes**.

### 20260311144607
- Adds role system and platform-owner policies; extends firms admin fields.
- Keep: **Yes**.

### 20260323175827
- Onboarding insert policies for firms/firm_users.
- Keep: **Yes, but superseded partly by later tightening**.

### 20260323175834
- Tightens firm insert policy to users without existing firm links.
- Keep: **Yes**.

### 20260324120000
- Large RLS/performance pass:
  - consolidates policies
  - wraps `auth.uid()` usage
  - adds scale indexes
- Keep: **Yes**.

### 20260324123000
- Adds FK-covering indexes.
- Keep: **Yes**.

### 20260324130000
- Prunes unused speculative indexes.
- Keep: **Conditional** (depends on workload; safe if linter confirms).

### 20260324143000
- Business hardening:
  - plan normalization to free/professional
  - new firm branding/email/owner fields
  - extra + quote item constraints
  - status constraints
  - discount validation + increment RPC
  - RLS tightening for firm_users and public pricing scope
- Keep: **Yes, critical**.

### 20260324152000
- Stripe scaffold fields and constraints.
- Keep: **Yes if subscription model remains**.

### 20260324164000
- Hardens function search_path and public policy scoping to anon.
- Keep: **Yes**.

### 20260406120000
- Adds per-firm public form JSON config.
- Keep: **Yes**.

### 20260406183000
- Adds auto-send quote email toggle on firms.
- Keep: **Yes**.

### 20260406213000
- Backfills auto-send for professional/paid firms.
- Keep: **Optional data migration**, not structural.

### 20260407110000
- Adds quote reference_code and index with backfill.
- Keep: **Yes**.

---

## 8. RLS + Auth Model

### anon access
- public reads allowed on pricing tables via anon-scoped policies for active/public-enabled firms.
- lead inserts allowed if firm exists.

### authenticated firm admin access
- typically gated by `get_user_firm_id(auth.uid())` checks.
- CRUD permitted for own firm pricing/quotes/leads.

### platform owner access
- via `has_role(..., 'platform_owner')` in select/update policies.
- cross-firm visibility on major tables.

### pricing exposure rules
- public pricing reads only for firms where:
  - `is_active = true`
  - `public_quote_form_enabled = true`
- authenticated users get broader access if member/owner.

---

## 9. Edge Functions Deep Dive

## `create-public-lead`
**Payload**
- `lead` object with core lead fields + answers + status.
- optional `discountCodeId`, `totals`, `quoteItems`.

**Logic**
1. Validate payload shape.
2. Load firm and enforce active/public-form-enabled.
3. Insert lead.
4. Increment discount usage if provided.
5. If not review and totals present, insert draft quote + quote_items.
6. Generate `reference_code` from quote ID.
7. Invoke async post-create tasks:
   - `send-new-lead-notification`
   - `send-public-quote-emails` (if auto-send enabled and not review)
8. Optionally fail if email tasks fail and env flag enabled.

**Pricing interactions**
- consumes precomputed totals/items from frontend engine.
- does not recompute pricing server-side.

**Failure handling**
- returns structured 4xx/5xx JSON errors.
- email task failures can be soft or hard depending on env flag.

## `resolve-instruction-context`
- Input: `{ firmSlug, ref }`
- Resolves firm by slug, quote by reference_code, fallback UUID lead id.
- Returns firm+lead+quote+items for instruction page render.

## `submit-instruction`
- Input: `{ firmSlug, leadId, details }`
- Loads firm + lead, merges instruction metadata into `leads.answers`.
- Builds instruction PDF.
- Sends firm notification email (+ customer confirmation) with attachment.

## `send-new-lead-notification`
- Input: `{ firmId, leadId }`
- Sends firm-side “new enquiry” message.
- Sends customer acknowledgement when auto-send quote is disabled or lead in review.
- Provider chain: SMTP then SendGrid then Resend.

## `send-public-quote-emails`
- Sends automatic customer quote/invoice + firm copy for public submissions.
- Builds instruction link using reference code.
- Uses provider fallback chain.

## `send-quote-email`
- Admin-triggered quote sending function.
- Validates auth context/payload.
- Loads firm/lead/quote/items as needed.
- Builds/generates PDF attachment if absent.
- Sends email via SMTP or API provider fallback.
- Updates quote sent/document metadata.
- Strong structured logging and staged error responses.

## `create-stripe-checkout-session`
- Requires authenticated user and linked firm.
- Ensures Stripe customer exists; creates checkout session for subscription price ID.
- Returns redirect URL.

---

## 10. Hidden Logic & Assumptions

1. **Frontend computes pricing and sends totals/items to backend**.
   - Server trusts these values in `create-public-lead` (risk: tampering if anon endpoint is abused).
2. **Discount validity duplicated in frontend and DB/RPC**.
   - Potential drift if logic diverges.
3. **No dedicated Lifetime ISA field** despite template naming.
4. **Plan aliases**: code treats `paid` and `professional` as equivalent in places.
5. **Type generation drift risk**: `src/integrations/supabase/types.ts` may lag later schema changes.
6. **Band overlap not strongly prevented in UI**.
7. **Sale_purchase fallback behavior** can create partial quote if only one side has matching band.
8. **RLS dependence on SECURITY DEFINER helper functions** means function hardening is critical.

---

## 11. Rebuild Blueprint

### Phase 1: foundation
1. Create frontend shell + routing + auth context.
2. Implement base schema + migrations + RLS helper functions.
3. Add typed Supabase client and domain types.

### Phase 2: pricing core
1. Build `useQuoteForm` + section components.
2. Implement `quoteEngine` and unit tests for key paths.
3. Build Pricing admin for bands/extras/codes.

### Phase 3: public flow
1. Build public quote page with form config controls.
2. Implement `create-public-lead` edge function.
3. Persist leads + optional draft quotes.

### Phase 4: admin operations
1. Build Leads page quote editor and save/update flow.
2. Implement `send-quote-email` edge function + provider fallback.
3. Add instructions pages and instruction functions.

### Phase 5: productization
1. Settings page plan controls + Stripe function.
2. Embed page scripts.
3. Owner analytics/admin.

### What to simplify for MVP
- Skip owner dashboards.
- Skip CSV exports.
- Start with one email provider.
- Use estimate-only document type initially.

### What not to replicate blindly
- Trusting frontend totals without server recalculation.
- Potentially stale generated types.
- Mixed alias usage (`paid` vs `professional`) — normalize from start.

---

## 12. Final Step-by-Step Checklist

1. Initialize Vite React TS project and install dependency set.
2. Add UI primitive library and theme CSS.
3. Implement app routes and layout skeleton.
4. Create Supabase project and configure auth.
5. Replay all structural migrations in order.
6. Validate RLS with anon/user/owner test users.
7. Build auth context and route guards.
8. Build quote form sections and state hook.
9. Implement pricing engine + tests for:
   - single-service band match
   - sale_purchase dual match
   - no-match fallback
   - automatic extras equals/not_equals
   - fixed and percent discount with clamp
   - VAT/non-VAT totals
10. Build public quote page with form config visibility.
11. Build pricing, forms, settings admin pages.
12. Implement `create-public-lead` function and verify lead + quote persistence behavior.
13. Build leads quote editor and quote save/update flow.
14. Implement `send-quote-email` and verify provider fallback.
15. Build instruction routes + `resolve-instruction-context` + `submit-instruction`.
16. Add embed page + postMessage resize integration.
17. Add owner pages (optional for MVP).
18. Add stripe checkout function and settings integration.
19. Backfill/verify reference codes and auto-send behavior.
20. Run end-to-end scenario tests:
   - public submit with valid band
   - public submit no-match/review
   - discount application and usage increment
   - admin quote edit + send
   - instruction submit
   - owner visibility

---
## Appendix A — Exhaustive frontend file index (all src files)
### `src`
- **src/App.css**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/App.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/components`
- **src/components/EmptyState.tsx**
  - **Primary export(s):** EmptyState.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/LiveChatWidget.tsx**
  - **Primary export(s):** LiveChatWidget.
  - **State/data patterns:** useState.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/NavLink.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/OwnerProtectedRoute.tsx**
  - **Primary export(s):** OwnerProtectedRoute.
  - **State/data patterns:** useEffect.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ProtectedRoute.tsx**
  - **Primary export(s):** ProtectedRoute.
  - **State/data patterns:** useEffect.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/components/quote`
- **src/components/quote/AdditionalInfoSection.tsx**
  - **Primary export(s):** AdditionalInfoSection.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/quote/EstimateDocument.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/quote/PurchaseSection.tsx**
  - **Primary export(s):** PurchaseSection.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/quote/QuoteResultDisplay.tsx**
  - **Primary export(s):** QuoteResultDisplay.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/quote/RemortgageSection.tsx**
  - **Primary export(s):** RemortgageSection.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/quote/SaleSection.tsx**
  - **Primary export(s):** SaleSection.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/components/ui`
- **src/components/ui/accordion.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/alert-dialog.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/alert.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/aspect-ratio.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/avatar.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/badge.tsx**
  - **Primary export(s):** BadgeProps.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/breadcrumb.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/button.tsx**
  - **Primary export(s):** ButtonProps.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/calendar.tsx**
  - **Primary export(s):** CalendarProps.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/card.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/carousel.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** useState, useEffect, useContext.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/chart.tsx**
  - **Primary export(s):** ChartConfig.
  - **State/data patterns:** useMemo, useContext.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/checkbox.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/collapsible.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/command.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/context-menu.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/dialog.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/drawer.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/dropdown-menu.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/form.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** useContext.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/hover-card.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/input-otp.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** useContext.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/input.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/label.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/menubar.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/navigation-menu.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/pagination.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/popover.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/progress.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/radio-group.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/resizable.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/scroll-area.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/select.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/separator.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/sheet.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/sidebar.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** useState, useEffect, useMemo, useContext.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/skeleton.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/slider.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/sonner.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/switch.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/table.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/tabs.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/textarea.tsx**
  - **Primary export(s):** TextareaProps.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/toast.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/toaster.tsx**
  - **Primary export(s):** Toaster.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/toggle-group.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** useContext.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/toggle.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/tooltip.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/components/ui/use-toast.ts**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/contexts`
- **src/contexts/AuthContext.tsx**
  - **Primary export(s):** AuthProvider, useAuth.
  - **State/data patterns:** useState, useEffect, useContext.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/hooks`
- **src/hooks/use-mobile.tsx**
  - **Primary export(s):** useIsMobile.
  - **State/data patterns:** useState, useEffect.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/hooks/use-toast.ts**
  - **Primary export(s):** reducer.
  - **State/data patterns:** useState, useEffect.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/hooks/useQuoteForm.ts**
  - **Primary export(s):** useQuoteForm.
  - **State/data patterns:** useState.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src`
- **src/index.css**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/integrations/supabase`
- **src/integrations/supabase/client.ts**
  - **Primary export(s):** supabase.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/integrations/supabase/types.ts**
  - **Primary export(s):** Json, Database, Tables, TablesInsert, TablesUpdate, Enums, CompositeTypes, Constants.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/lib`
- **src/lib/pdfUtils.ts**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/lib/publicFormFields.ts**
  - **Primary export(s):** PUBLIC_FORM_FIELDS, PublicFormFieldKey.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/lib/quoteEngine.ts**
  - **Primary export(s):** QuoteCalculationResult, calculateQuote, calculateQuoteWithFallback, recalculateTotals.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/lib/utils.ts**
  - **Primary export(s):** cn.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src`
- **src/main.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/pages`
- **src/pages/Index.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/pages/InstructPage.tsx**
  - **Primary export(s):** InstructPage.
  - **State/data patterns:** useState, useMemo, useQuery, useMutation.
  - **Backend touchpoints:** tables[none], edge_functions[resolve-instruction-context, submit-instruction].
- **src/pages/NotFound.tsx**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** useEffect.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/pages/PublicQuotePage.tsx**
  - **Primary export(s):** PublicQuotePage.
  - **State/data patterns:** useState, useEffect, useMemo, useQuery, useMutation.
  - **Backend touchpoints:** tables[firms, pricing_bands, pricing_extras], edge_functions[create-public-lead].
### `src/pages/admin`
- **src/pages/admin/AdminLayout.tsx**
  - **Primary export(s):** AdminLayout.
  - **State/data patterns:** useQuery.
  - **Backend touchpoints:** tables[firms], edge_functions[none].
- **src/pages/admin/DashboardPage.tsx**
  - **Primary export(s):** DashboardPage.
  - **State/data patterns:** useQuery.
  - **Backend touchpoints:** tables[leads, quotes], edge_functions[none].
- **src/pages/admin/EmbedPage.tsx**
  - **Primary export(s):** EmbedPage.
  - **State/data patterns:** useQuery.
  - **Backend touchpoints:** tables[firms], edge_functions[none].
- **src/pages/admin/FormsPage.tsx**
  - **Primary export(s):** FormsPage.
  - **State/data patterns:** useState, useEffect, useMemo, useQuery, useMutation.
  - **Backend touchpoints:** tables[firms], edge_functions[none].
- **src/pages/admin/InstructionsPage.tsx**
  - **Primary export(s):** InstructionsPage.
  - **State/data patterns:** useState, useMemo, useQuery.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/pages/admin/LeadsPage.tsx**
  - **Primary export(s):** LeadsPage.
  - **State/data patterns:** useState, useEffect, useMemo, useQuery, useMutation.
  - **Backend touchpoints:** tables[discount_codes, firms, leads, pricing_bands, pricing_extras, quote_items, quotes], edge_functions[send-quote-email].
- **src/pages/admin/LoginPage.tsx**
  - **Primary export(s):** LoginPage.
  - **State/data patterns:** useState.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/pages/admin/OnboardingPage.tsx**
  - **Primary export(s):** OnboardingPage.
  - **State/data patterns:** useState.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/pages/admin/PricingPage.tsx**
  - **Primary export(s):** PricingPage.
  - **State/data patterns:** useState, useQuery, useMutation.
  - **Backend touchpoints:** tables[discount_codes, pricing_bands, pricing_extras], edge_functions[none].
- **src/pages/admin/SettingsPage.tsx**
  - **Primary export(s):** SettingsPage.
  - **State/data patterns:** useState, useEffect, useQuery, useMutation.
  - **Backend touchpoints:** tables[firms], edge_functions[create-stripe-checkout-session].
- **src/pages/admin/SignupPage.tsx**
  - **Primary export(s):** SignupPage.
  - **State/data patterns:** useState.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/pages/owner`
- **src/pages/owner/OwnerAnalyticsPage.tsx**
  - **Primary export(s):** OwnerAnalyticsPage.
  - **State/data patterns:** useQuery.
  - **Backend touchpoints:** tables[firms, leads, quotes], edge_functions[none].
- **src/pages/owner/OwnerFirmDetailPage.tsx**
  - **Primary export(s):** OwnerFirmDetailPage.
  - **State/data patterns:** useState, useEffect, useQuery, useMutation.
  - **Backend touchpoints:** tables[discount_codes, firm_users, firms, leads, pricing_bands, pricing_extras, quotes], edge_functions[none].
- **src/pages/owner/OwnerFirmsPage.tsx**
  - **Primary export(s):** OwnerFirmsPage.
  - **State/data patterns:** useQuery.
  - **Backend touchpoints:** tables[firm_users, firms, leads, quotes], edge_functions[none].
- **src/pages/owner/OwnerLayout.tsx**
  - **Primary export(s):** OwnerLayout.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/test`
- **src/test/example.test.ts**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
- **src/test/setup.ts**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src/types`
- **src/types/index.ts**
  - **Primary export(s):** Firm, FirmUser, PricingBand, PricingExtra, Lead, Quote, QuoteItem, DiscountCode, ServiceType, Tenure, YesNo, YesNoNotSure, ItemType, QuoteItemSourceType, SERVICE_TYPE_LABELS, TIMELINE_OPTIONS, PurchaseAnswers, SaleAnswers, RemortgageAnswers, AdditionalInfo, CommonAnswers, ContactInfo, QuoteFormData, QuoteLineItem, QuoteBreakdown, QUOTE_STATUSES, QuoteStatus, QUOTE_STATUS_COLORS, ManualReviewCondition, ANSWER_LABELS.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
### `src`
- **src/vite-env.d.ts**
  - **Primary export(s):** none/default only.
  - **State/data patterns:** presentational/static.
  - **Backend touchpoints:** tables[none], edge_functions[none].
---

## 13. Full Database Dictionary (final effective schema)

> Source of truth used: migration sequence in `supabase/migrations/*.sql` plus generated client types where available. Where generated types lag migrations, migration-derived shape is preferred.

### 13.1 `public.firms`

| Column | Type | Nullable | Default | Constraints / Notes |
|---|---|---:|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| name | text | no | — | |
| slug | text | no | — | UNIQUE |
| logo_url | text | yes | null | |
| primary_color | text | yes | `'#1e3a5f'` | |
| disclaimer_text | text | yes | estimate disclaimer string | |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | trigger-maintained |
| plan_type | text | no | `'free'` | CHECK in (`free`,`professional`) |
| show_instant_quote | boolean | no | `false` | paid/pro-only behavior in app |
| show_estimate_document | boolean | no | `false` | paid/pro-only behavior in app |
| require_admin_review | boolean | no | `true` | |
| public_quote_form_enabled | boolean | no | `true` | |
| is_active | boolean | no | `true` | |
| admin_notes | text | yes | null | owner/admin internal notes |
| disclaimer_purchase | text | yes | null | |
| disclaimer_sale | text | yes | null | |
| disclaimer_remortgage | text | yes | null | |
| manual_review_conditions | jsonb | no | `'[]'::jsonb` | list of `{field,value}` |
| reply_to_email | text | yes | null | outbound response address |
| sender_display_name | text | yes | null | |
| owner_user_id | uuid | yes | null | FK -> `auth.users(id)` |
| stripe_customer_id | text | yes | null | indexed |
| stripe_subscription_id | text | yes | null | indexed |
| stripe_subscription_status | text | yes | null | CHECK allowed Stripe statuses |
| public_form_config | jsonb | no | jsonb defaults object | field visibility schema |
| auto_send_quote_emails | boolean | no | false | controls public auto-email path |

Indexes (final expected present):
- PK + UNIQUE(slug)
- `idx_firms_owner_user_id`
- `idx_firms_stripe_customer_id`
- `idx_firms_stripe_subscription_id`

### 13.2 `public.firm_users`

| Column | Type | Nullable | Default | Constraints |
|---|---|---:|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| user_id | uuid | no | — | FK -> `auth.users(id)` ON DELETE CASCADE |
| firm_id | uuid | no | — | FK -> `public.firms(id)` ON DELETE CASCADE |
| role | text | no | `'admin'` | app-level label |
| created_at | timestamptz | no | `now()` | |

Constraints/indexes:
- UNIQUE (`user_id`,`firm_id`)
- indexes historically created/removed; current required behavior depends on latest migration chain (performance migration created user/firm indexes, prune migration removed some).

### 13.3 `public.user_roles`

| Column | Type | Nullable | Default | Constraints |
|---|---|---:|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| user_id | uuid | no | — | FK -> `auth.users(id)` ON DELETE CASCADE |
| role | `public.app_role` | no | — | enum: `admin`, `platform_owner` |
| created_at | timestamptz | no | `now()` | |

Constraints:
- UNIQUE (`user_id`,`role`)

### 13.4 `public.pricing_bands`

| Column | Type | Nullable | Default | Constraints |
|---|---|---:|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| firm_id | uuid | no | — | FK -> firms(id) ON DELETE CASCADE |
| service_type | text | no | — | CHECK in (`purchase`,`sale`,`sale_purchase`,`remortgage`) |
| min_value | numeric | no | `0` | |
| max_value | numeric | no | `999999999` | |
| base_fee | numeric | no | — | |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | trigger-maintained |

### 13.5 `public.pricing_extras`

| Column | Type | Nullable | Default | Constraints |
|---|---|---:|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| firm_id | uuid | no | — | FK -> firms(id) ON DELETE CASCADE |
| name | text | no | — | |
| condition_field | text | yes | null | |
| condition_value | text | yes | null | |
| amount | numeric | no | — | |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | trigger-maintained |
| apply_mode | text | no | `automatic` | CHECK in (`automatic`,`manual_optional`) |
| vat_applicable | boolean | no | true | |
| is_active | boolean | no | true | |
| trigger_operator | text | no | `equals` | CHECK in (`equals`,`not_equals`) |
| service_type | text | yes | null | CHECK null or in service types |

### 13.6 `public.discount_codes`

| Column | Type | Nullable | Default | Constraints |
|---|---|---:|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| firm_id | uuid | no | — | FK -> firms(id) ON DELETE CASCADE |
| code | text | no | — | UNIQUE with firm_id |
| description | text | yes | null | |
| discount_type | text | no | `fixed` | CHECK in (`fixed`,`percentage`) |
| discount_value | numeric | no | — | |
| is_active | boolean | no | true | |
| valid_from | timestamptz | yes | null | |
| valid_until | timestamptz | yes | null | |
| max_uses | int | yes | null | |
| use_count | int | no | 0 | |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | trigger-maintained |

### 13.7 `public.leads`

| Column | Type | Nullable | Default | Constraints |
|---|---|---:|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| firm_id | uuid | no | — | FK -> firms(id) ON DELETE CASCADE |
| full_name | text | no | — | |
| email | text | no | — | |
| phone | text | yes | null | |
| service_type | text | no | — | app expects service labels |
| property_value | numeric | no | — | |
| tenure | text | no | — | |
| mortgage_required | boolean | no | false | |
| first_time_buyer | boolean | no | false | |
| estimated_total | numeric | yes | null | null for review/fallback path |
| status | text | no | `new` | CHECK in (`new`,`review`,`quoted`) |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | trigger-maintained |
| answers | jsonb | yes | `'{}'::jsonb` | section answers + instruction metadata |
| discount_code_id | uuid | yes | null | FK -> discount_codes(id) |
| first_name | text | yes | null | |
| surname | text | yes | null | |

Indexes (effective intent): firm/status/time composites + discount_code_id index.

### 13.8 `public.quotes`

| Column | Type | Nullable | Default | Constraints |
|---|---|---:|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| lead_id | uuid | no | — | FK -> leads(id) ON DELETE CASCADE |
| firm_id | uuid | no | — | FK -> firms(id) ON DELETE CASCADE |
| status | text | no | `draft` (initially `new`) | CHECK in (`new`,`draft`,`sent`,`accepted`,`expired`) |
| subtotal | numeric | no | 0 | |
| vat_total | numeric | no | 0 | |
| grand_total | numeric | no | 0 | |
| created_by | uuid | yes | null | FK -> auth.users(id) |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | trigger-maintained |
| discount_total | numeric | no | 0 | |
| document_type | text | yes | null | CHECK null or (`estimate`,`invoice`) |
| sent_at | timestamptz | yes | null | |
| document_generated_at | timestamptz | yes | null | |
| document_downloaded_at | timestamptz | yes | null | |
| reference_code | text | yes | null | unique index where not null |

### 13.9 `public.quote_items`

| Column | Type | Nullable | Default | Constraints |
|---|---|---:|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| quote_id | uuid | no | — | FK -> quotes(id) ON DELETE CASCADE |
| description | text | no | — | |
| amount | numeric | no | — | |
| is_vatable | boolean | no | true | |
| sort_order | int | no | 0 | |
| created_at | timestamptz | no | `now()` | |
| item_type | text | no | `fee` | CHECK in (`fee`,`extra`,`disbursement`,`discount`,`manual`) |
| source_type | text | no | `manual` | CHECK in (`band`,`extra_auto`,`extra_manual`,`discount_code`,`manual`) |
| source_reference_id | uuid | yes | null | |
| is_manual | boolean | no | false | |
| is_discount | boolean | no | false | |

---

## 14. Full SQL Object Inventory

### 14.1 SQL functions / RPCs / helpers

| Function | Kind | SECURITY DEFINER | Purpose |
|---|---|---:|---|
| `public.update_updated_at_column()` | trigger function | no | sets `NEW.updated_at=now()` |
| `public.get_user_firm_id(_user_id uuid)` | helper | yes | resolve single firm_id for current user context |
| `public.has_role(_user_id uuid, _role app_role)` | helper/RPC | yes | role check used in RLS and auth context |
| `public.is_discount_code_valid(_code discount_codes)` | helper | no | checks active/date/max-uses validity |
| `public.increment_discount_use_count(_discount_code_id uuid)` | RPC-like callable | yes | lock + validate + increment usage |

Notes:
- SECURITY DEFINER functions are trust boundaries. Search path hardening was later applied to reduce risk.

### 14.2 Triggers

| Trigger | Table | Event | Function |
|---|---|---|---|
| `update_firms_updated_at` | firms | BEFORE UPDATE | `update_updated_at_column` |
| `update_pricing_bands_updated_at` | pricing_bands | BEFORE UPDATE | `update_updated_at_column` |
| `update_pricing_extras_updated_at` | pricing_extras | BEFORE UPDATE | `update_updated_at_column` |
| `update_leads_updated_at` | leads | BEFORE UPDATE | `update_updated_at_column` |
| `update_quotes_updated_at` | quotes | BEFORE UPDATE | `update_updated_at_column` |
| `update_discount_codes_updated_at` | discount_codes | BEFORE UPDATE | `update_updated_at_column` |

### 14.3 RLS policies by table (effective-final)

#### `firms`
- SELECT public readable baseline exists from initial migration (not later dropped).
- UPDATE: `firms_update_authenticated_owner_or_member` (member firm match OR platform owner).
- INSERT: `firms_insert_authenticated_without_existing_link`.

#### `firm_users`
- SELECT: `firm_users_select_self_or_owner`.
- INSERT: `firm_users_insert_self_owned_firm_only` (tightened version).

#### `user_roles`
- SELECT: `user_roles_select_self_or_owner`.

#### `pricing_bands`
- SELECT anon: `pricing_bands_select_public_active_firm`.
- SELECT authenticated: `pricing_bands_select_member_or_owner`.
- INSERT/UPDATE/DELETE member policies.

#### `pricing_extras`
- SELECT anon: `pricing_extras_select_public_active_firm`.
- SELECT authenticated: `pricing_extras_select_member_or_owner`.
- INSERT/UPDATE/DELETE member policies.

#### `leads`
- INSERT anon/public: policy requiring existing firm.
- SELECT authenticated: `leads_select_member_or_owner`.
- UPDATE member: `leads_update_member`.

#### `quotes`
- SELECT member/owner.
- INSERT/UPDATE/DELETE member policies.

#### `quote_items`
- SELECT member/owner by parent quote check.
- INSERT/UPDATE/DELETE member by parent quote firm check.

#### `discount_codes`
- SELECT anon active: `discount_codes_select_public_active`.
- SELECT authenticated member/owner.
- INSERT/UPDATE/DELETE member policies.

Views/materialized views:
- none defined in migrations.

---

## 15. Edge Function API Contracts

### 15.1 `create-public-lead`
- **Auth requirement**: callable from public contexts (uses service role internally).
- **Request body**:
```ts
{
  lead: {
    firm_id: string;
    full_name: string;
    first_name?: string|null;
    surname?: string|null;
    email: string;
    phone?: string|null;
    service_type: string;
    property_value: number;
    tenure: string;
    mortgage_required: boolean;
    first_time_buyer: boolean;
    estimated_total?: number|null;
    answers?: Record<string, unknown>;
    discount_code_id?: string|null;
    status?: string; // typically new or review
  };
  discountCodeId?: string|null;
  totals?: { subtotal?: number; vatTotal?: number; grandTotal?: number };
  quoteItems?: Array<{description?: string; amount?: number; is_vatable?: boolean; item_type?: string; sort_order?: number}>;
}
```
- **Response (200)**:
```json
{ "id":"<leadId>", "quoteId":"<uuid|null>", "instructionRef":"<reference|leadId>", "emailTasks":[...] }
```
- **Response (502 optional)** when `FAIL_ON_EMAIL_TASK_ERROR=true` and post-create tasks fail.
- **Reads**: firms.
- **Writes**: leads, quotes, quote_items, discount use count RPC.
- **Side effects**: invokes `send-new-lead-notification`, `send-public-quote-emails`.
- **Error cases**: invalid payload, unavailable firm, lead insert failure, generic 500.
- **Idempotency**: not idempotent; repeated calls create repeated leads.
- **Trust boundary**: totals/items are client-supplied and trusted.

### 15.2 `create-stripe-checkout-session`
- **Auth requirement**: requires Authorization token; validates user.
- **Request body**: `{}` (unused)
- **Response (200)**: `{ "url": "https://checkout.stripe..." }`
- **Reads**: firm_users, firms.
- **Writes**: firms.stripe_customer_id (if new).
- **Side effects**: Stripe customer/session creation.
- **Errors**: config missing, unauthorized, no firm, firm missing, unexpected.
- **Idempotency**: partially idempotent for customer creation (reuses existing id).

### 15.3 `resolve-instruction-context`
- **Auth**: public callable.
- **Request**: `{ firmSlug: string; ref: string }`
- **Response (200)**:
```json
{ "firm": {...}, "lead": {...}, "quote": {...}|null, "items": [...], "reference":"..." }
```
- **Reads**: firms, quotes, leads, quote_items.
- **Writes**: none.
- **Error cases**: missing fields, firm not found, reference not found, lead not found.
- **Idempotency**: yes (read-only).

### 15.4 `send-new-lead-notification`
- **Auth**: internal/service invocation expected.
- **Request**: `{ firmId: string; leadId: string }`
- **Response**: `{ok:true}` or `{ok:true, skipped:"..."}`.
- **Reads**: firms, leads.
- **Writes**: none.
- **Side effects**: outbound email(s).
- **Suppression rule**: customer acknowledgement depends on `auto_send_quote_emails` and review status.
- **Provider fallback**: SMTP -> SendGrid -> Resend -> skipped.
- **Idempotency**: no dedupe token; repeated calls resend emails.

### 15.5 `send-public-quote-emails`
- **Auth**: internal/service invocation expected.
- **Request**: `{ firmId: string; leadId: string; totals?: {subtotal,vatTotal,grandTotal}; quoteId?: string; documentType?: 'estimate'|'invoice' }`
- **Response**: `{ok:true}` or `{ok:true, skipped:"Auto quote emails disabled by firm"}`.
- **Reads**: firms, leads, quotes, quote_items.
- **Writes**: may update quote sent metadata.
- **Side effects**: sends customer quote email and firm copy.
- **Errors**: missing firm/lead, missing lead email, provider failures.
- **Trust boundary**: totals can come from request body when quote data absent.

### 15.6 `send-quote-email`
- **Auth**: requires authenticated user context (validated in function).
- **Request**:
```ts
{
  quoteId: string;
  leadId: string;
  documentType: 'estimate'|'invoice';
  totals: { subtotal:number; vatTotal:number; grandTotal:number };
  pdfAttachment?: { filename?: string; base64: string } | null;
}
```
- **Response (200)**:
```json
{ "ok": true, "quoteId": "...", "leadId": "...", "provider": "smtp|sendgrid|resend", "documentType":"estimate|invoice" }
```
- **Error response shape**:
```json
{ "ok": false, "error": { "code":"...", "message":"...", "stage":"...", ... } }
```
- **Reads**: quotes, leads, quote_items, firms.
- **Writes**: quotes status/document timestamps/sent_at.
- **Side effects**: email sending + optional PDF generation.
- **Idempotency**: not strict; repeated calls can resend and update sent timestamps.

### 15.7 `submit-instruction`
- **Auth**: public callable with firmSlug+leadId link context.
- **Request**:
```ts
{ firmSlug: string; leadId: string; details: Record<string,string> }
```
- **Response**: `{ "ok": true }`
- **Reads**: firms, leads, quotes.
- **Writes**: merges instruction metadata into `leads.answers`.
- **Side effects**: firm + customer instruction emails with instruction PDF attachment.
- **Errors**: invalid payload, firm/lead not found, provider failures, generic 500.
- **Trust boundary**: link possession + guessed ids; no signed-token verification.

---

## 16. Pricing Field and Options Matrix (complete)

> Fields listed from `types`, quote sections, and `PUBLIC_FORM_FIELDS`.

| UI label | Internal field | Component/section | Stored values | Type | Defined in | In `answers` JSON | Flattened/aliased | Usable in pricing conditions | Affects base fee | Affects extras | Affects manual review | Affects discounts | Email/instruction impact |
|---|---|---|---|---|---|---:|---|---:|---:|---:|---:|---:|---|
| Service Type | serviceType / service_type | PublicQuotePage selector | purchase/sale/sale_purchase/remortgage | enum string | `types`, `PublicQuotePage` | yes (`service_type` via flatten) | direct | yes | yes | yes | yes | indirect | included in templates/content |
| Property Postcode (purchase) | purchase.property_postcode | PurchaseSection | text | string | PurchaseSection | yes | flattened | possible | no | possible | possible | no | shown in admin answers |
| Purchase Price | purchase.purchase_price | PurchaseSection | number | number | PurchaseSection | yes | flattened | no (not in condition list by default) | yes | no | no | no | affects totals in emails |
| Tenure (purchase) | purchase.tenure | PurchaseSection | freehold/leasehold | enum | PurchaseSection | yes | mapped to `tenure` | yes | no | yes | yes | no | reflected in lead context |
| New Build | purchase.is_newbuild | PurchaseSection | yes/no | enum | PurchaseSection | yes | flattened | yes | no | yes | yes | no | appears in admin/instruction answers |
| Shared Ownership (purchase) | purchase.is_shared_ownership | PurchaseSection | yes/no | enum | PurchaseSection | yes | flattened | yes | no | yes | yes | no | answer visibility only |
| Mortgage Required | purchase.has_mortgage | PurchaseSection | yes/no | enum | PurchaseSection | yes | alias to `mortgage_required` | yes | no | yes | yes | no | answer visibility |
| First Time Buyer | purchase.is_first_time_buyer | PurchaseSection | yes/no | enum | PurchaseSection | yes | alias to `first_time_buyer` | yes | no | yes | yes | no | answer visibility |
| Number of Buyers | purchase.buyer_count | PurchaseSection | integer | number | PurchaseSection | yes | flattened | yes | no | yes | possible | no | answer visibility |
| Gifted Deposit | purchase.gifted_deposit | PurchaseSection | yes/no/not_sure | enum | PurchaseSection | yes | flattened | yes | no | yes | yes | no | answer visibility |
| Help to Buy ISA | purchase.uses_help_to_buy_isa | PurchaseSection | yes/no | enum | PurchaseSection | yes | flattened | yes | no | yes | yes | no | answer visibility |
| Right to Buy | purchase.uses_right_to_buy | PurchaseSection | yes/no | enum | PurchaseSection | yes | flattened | yes | no | yes | yes | no | answer visibility |
| HTB Equity Loan | purchase.uses_help_to_buy_equity_loan | PurchaseSection | yes/no | enum | PurchaseSection | yes | flattened | yes | no | yes | yes | no | answer visibility |
| Property Postcode (sale) | sale.property_postcode | SaleSection | text | string | SaleSection | yes | flattened | possible | no | possible | possible | no | answer visibility |
| Sale Price | sale.sale_price | SaleSection | number | number | SaleSection | yes | flattened | no | yes | no | no | no | totals |
| Tenure (sale) | sale.tenure | SaleSection | freehold/leasehold | enum | SaleSection | yes | mapped to `tenure` if missing | yes | no | yes | yes | no | context |
| Existing Mortgage | sale.has_existing_mortgage | SaleSection | yes/no | enum | SaleSection | yes | flattened | yes | no | yes | yes | no | answer visibility |
| Shared Ownership (sale) | sale.is_shared_ownership | SaleSection | yes/no | enum | SaleSection | yes | flattened | yes | no | yes | yes | no | answer visibility |
| Number of Sellers | sale.seller_count | SaleSection | integer | number | SaleSection | yes | flattened | yes | no | yes | possible | no | answer visibility |
| Property Postcode (remortgage) | remortgage.property_postcode | RemortgageSection | text | string | RemortgageSection | yes | flattened | possible | no | possible | possible | no | answer visibility |
| Remortgage Property Value | remortgage.remortgage_property_value | RemortgageSection | number | number | RemortgageSection | yes | flattened | no | yes | no | no | no | totals |
| Tenure (remortgage) | remortgage.tenure | RemortgageSection | freehold/leasehold | enum | RemortgageSection | yes | mapped to `tenure` | yes | no | yes | yes | no | context |
| Buy to Let (remortgage) | remortgage.is_buy_to_let | RemortgageSection | yes/no | enum | RemortgageSection | yes | alias mirrored with additional field | yes | no | yes | yes | no | answer visibility |
| Transfer of Equity | remortgage.transfer_of_equity | RemortgageSection | yes/no | enum | RemortgageSection | yes | flattened | yes | no | yes | yes | no | answer visibility |
| Number of Remortgagors | remortgage.remortgagor_count | RemortgageSection | integer | number | RemortgageSection | yes | flattened | yes | no | yes | possible | no | answer visibility |
| Recommend Mortgage Broker | remortgage.recommend_mortgage_broker | RemortgageSection | yes/no | enum | RemortgageSection | yes | flattened | not in default condition list | no | possible | possible | no | answer visibility |
| Buy to Let (additional) | additional.buy_to_let | AdditionalInfoSection | yes/no | enum | AdditionalInfoSection | yes (if non-default) | alias with remortgage key | yes | no | yes | yes | no | answer visibility |
| Second Home | additional.second_home | AdditionalInfoSection | yes/no | enum | AdditionalInfoSection | yes (if non-default) | flattened | yes | no | yes | yes | no | answer visibility |
| Company Purchase | additional.company_purchase | AdditionalInfoSection | yes/no | enum | AdditionalInfoSection | yes (if non-default) | flattened | yes | no | yes | yes | no | answer visibility |
| Auction Purchase | additional.auction_purchase | AdditionalInfoSection | yes/no | enum | AdditionalInfoSection | yes (if non-default) | flattened | yes | no | yes | yes | no | answer visibility |
| Probate Related | additional.probate_related | AdditionalInfoSection | yes/no | enum | AdditionalInfoSection | yes (if non-default) | flattened | yes | no | yes | yes | no | answer visibility |
| Urgency essential | additional.speed_essential | AdditionalInfoSection | yes/no | enum | AdditionalInfoSection | yes (if non-default) | flattened | yes | no | yes | yes | no | answer visibility |
| Lender Name | additional.lender_name | AdditionalInfoSection | text | string | AdditionalInfoSection | yes (if non-default) | flattened | no | no | no | possible | no | answer visibility |
| Source of funds notes | additional.source_of_funds_notes | AdditionalInfoSection | text | string | AdditionalInfoSection | yes (if non-default) | flattened | no | no | no | possible | no | answer visibility |
| Chain notes | additional.chain_related_notes | AdditionalInfoSection | text | string | AdditionalInfoSection | yes (if non-default) | flattened | no | no | no | possible | no | answer visibility |
| Instruct timeline | common.instruct_timeline | Timeline section | option string | string | PublicQuotePage | yes | flattened | not pricing by default | no | possible | possible | no | admin filter + context |
| Special instructions | common.special_instructions | Timeline section | text | string | PublicQuotePage | yes | flattened | no | no | no | possible | no | admin/instruction context |
| First name | contact.first_name | Contact section | text | string | PublicQuotePage | no | n/a | no | no | no | no | no | email personalization |
| Surname | contact.surname | Contact section | text | string | PublicQuotePage | no | n/a | no | no | no | no | no | email personalization |
| Email | contact.email | Contact section | email | string | PublicQuotePage | no | n/a | no | no | no | no | no | recipient routing |
| Phone | contact.phone | Contact section | text | string | PublicQuotePage | no | n/a | no | no | no | no | no | context/contact only |

---

## 17. `public_form_config` schema detail

### JSON structure
```json
{
  "show_service_selector": true,
  "show_sale_section": true,
  "show_purchase_section": true,
  "show_remortgage_section": true,
  "show_additional_info": true,
  "show_timeline_notes": true,
  "show_phone_field": true,
  "show_discount_code": true,
  "show_instruct_button": true,
  "hidden_fields": []
}
```

### Defaults
- DB default set by migration (`jsonb_build_object(...)`).
- Frontend also has `DEFAULT_PUBLIC_FORM_CONFIG` fallback and merges persisted config into defaults.

### Section keys / service toggles
- `show_purchase_section`, `show_sale_section`, `show_remortgage_section` determine visible service choices.
- `sale_purchase` option appears only when both purchase and sale sections are enabled.

### Hidden field logic
- `hidden_fields` array stores keys from `PUBLIC_FORM_FIELDS` list.
- Visibility function: field visible when key is **not** in `hidden_fields` set.

### Missing config fallback
- If `public_form_config` missing/partial, frontend merges with defaults and remains operational.

---

## 18. Lead/Quote/Document Lifecycle State Machine

### Lead statuses
- `new`: default post-submit when not manual review.
- `review`: manual-review required.
- `quoted`: set when admin saves/sends quote.

### Quote statuses
- `new`, `draft`, `sent`, `accepted`, `expired` (constraint allowed set).
- Typical app path uses `draft` then `sent`; accepted/expired reserved for future/manual updates.

### Document type
- `estimate` or `invoice` per quote/document send action.

### Transition map (implemented)
- Public submit -> lead `new` OR `review`.
- create-public-lead (non-review) -> quote `draft`.
- Admin save quote -> lead `quoted`, quote status selected (usually `draft`).
- Admin send quote email -> quote status set `sent`, `sent_at` updated.
- Preview/download flows -> set `document_generated_at` / `document_downloaded_at`.

### Invalid/unsupported transitions
- No explicit workflow guard preventing arbitrary status update to allowed values.
- accepted/expired not fully automated in current UI.

---

## 19. Environment Variable Matrix

| Env var | Where used | Required | Purpose | Failure impact |
|---|---|---:|---|---|
| SUPABASE_URL | all edge functions | yes | create clients | function hard-fails |
| SUPABASE_SERVICE_ROLE_KEY | most edge functions | yes | privileged DB operations | function hard-fails |
| SUPABASE_ANON_KEY | create-stripe-checkout-session | yes | user-scoped auth check client | checkout flow fails |
| APP_BASE_URL | stripe + quote-email/public-email functions | optional (has localhost default) | return URLs/link generation | wrong links if unset in prod |
| STRIPE_SECRET_KEY | create-stripe-checkout-session | yes for stripe | Stripe API auth | checkout unavailable |
| STRIPE_PROFESSIONAL_PRICE_ID | create-stripe-checkout-session | yes for stripe | plan price target | checkout unavailable |
| SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE | email functions | optional but preferred | primary email transport | falls back to APIs or skip/error |
| SMTP_FROM_EMAIL | email functions | optional | sender address override | defaults used |
| EMAIL_FROM / PLATFORM_FROM_EMAIL | email functions | optional | sender fallback values | defaults used |
| SENDGRID_API_KEY | email functions | optional | secondary provider | if absent, fallback chain continues |
| RESEND_API_KEY | email functions | optional | tertiary provider | if absent and no other provider, send skipped/fails |
| SMTP_VERIFY_BEFORE_SEND | send-quote-email | optional | pre-send smtp verification | may expose config issues earlier |
| FAIL_ON_EMAIL_TASK_ERROR | create-public-lead | optional | decide soft vs hard failure when post-create email tasks fail | may return 502 after lead insert |
| FIRM_NOTIFICATION_FALLBACK_EMAIL | submit-instruction | optional | firm recipient fallback when reply_to missing | firm may miss instruction notice |

---

## 20. Component Dependency Graph

### Page -> components/hooks/utilities/backend

| Page | Key components | Hooks/utilities | Tables | Edge functions |
|---|---|---|---|---|
| PublicQuotePage | Purchase/Sale/Remortgage/Additional sections, QuoteResultDisplay, EstimateDocument | useQuoteForm, quoteEngine, pdfUtils | firms, pricing_bands, pricing_extras | create-public-lead |
| InstructPage | EstimateDocument | react-query + mutation logic | (via function only) | resolve-instruction-context, submit-instruction |
| Admin Dashboard | cards/badges | react-query | leads, quotes | — |
| Admin Leads | EstimateDocument + editor UI | quoteEngine, recalculateTotals, pdfUtils | leads, quotes, quote_items, pricing_bands, pricing_extras, discount_codes, firms | send-quote-email |
| Admin Instructions | EstimateDocument | recalculateTotals, pdfUtils | firms, leads, quotes, quote_items | — |
| Admin Pricing | form/dialog components | validation helpers | pricing_bands, pricing_extras, discount_codes | — |
| Admin Forms | switches/inputs/cards | PUBLIC_FORM_FIELDS | firms | — |
| Admin Settings | cards/switches/selects | condition list + mutation handlers | firms | create-stripe-checkout-session |
| Admin Embed | code blocks + copy UI | browser location | firms | — |
| Owner Firms | table/badges | react-query aggregation | firms, leads, quotes, firm_users | — |
| Owner Firm Detail | multi-panel cards | csv download helper | firms, firm_users, leads, quotes, pricing_bands, pricing_extras, discount_codes | — |
| Owner Analytics | cards/badges | react-query aggregation | firms, leads, quotes | — |

Hook dependencies:
- `useQuoteForm` -> type definitions only.
- `quoteEngine` -> type definitions only.
- Pages consume both for runtime pricing behavior.

---

## 21. Email System Detail

### Trigger inventory
1. **New lead notification** (`create-public-lead` -> `send-new-lead-notification`)
   - Receivers: firm reply-to (or configured recipient), optionally customer acknowledgement.
2. **Auto public quote emails** (`create-public-lead` -> `send-public-quote-emails`)
   - Receivers: customer + internal firm copy.
   - Suppressed when `auto_send_quote_emails=false` or lead in review path.
3. **Admin send quote/invoice** (`LeadsPage` -> `send-quote-email`)
   - Receiver: lead email.
   - Includes summary and optional/generated PDF.
4. **Instruction submitted** (`submit-instruction`)
   - Receivers: firm + customer confirmation.
   - Includes instruction PDF attachment.

### Content purpose
- Firm notifications: actionable operational alert.
- Customer messages: acknowledgement / quote delivery / instruction confirmation.
- Includes service labels, totals, references, and instruction links where relevant.

### Attachment behavior
- Admin quote send: accepts base64 attachment override or generates PDF server-side.
- Instruction submit: always builds instruction PDF attachment.

### Fallback provider logic
- Primary SMTP if configured.
- If SMTP unavailable/fails, attempt SendGrid.
- If no SendGrid, attempt Resend.
- If none configured, behavior varies by function (skip success vs error).

---

## 22. Rebuild Risks and Technical Debt (explicit)

1. **Client-trusted pricing payload in public flow**
   - Risk: tampered totals/items accepted by backend.
   - Rebuild fix: recompute quote server-side from canonical rules before persisting/sending.

2. **Inconsistent plan aliases (`paid` vs `professional`)**
   - Risk: feature gating drift.
   - Fix: strict enum and migration cleanup; eliminate alias checks in app code.

3. **Type drift between DB and generated TS types**
   - Risk: missing new columns/contract mismatch.
   - Fix: automate type generation in CI and block stale commits.

4. **Loose status transition governance**
   - Risk: invalid business transitions.
   - Fix: add transition guards in DB/RPC + UI workflows.

5. **Policy complexity and historical churn**
   - Risk: hard-to-audit security behavior.
   - Fix: formal policy snapshot docs + SQL tests for access matrix.

6. **Band overlap ambiguity**
   - Risk: first-match semantics produce non-deterministic pricing if overlapping.
   - Fix: enforce non-overlap constraints and deterministic ordering keys.

7. **Unsigned instruction links**
   - Risk: reference guessing/harvesting.
   - Fix: signed, expiring tokens tied to lead+firm+document.

8. **Email idempotency gaps**
   - Risk: duplicate sends on retries.
   - Fix: idempotency keys and message-log table.

9. **Mixed pricing rule source of truth**
   - Risk: quote logic split across public/admin/client paths.
   - Fix: one canonical server pricing module reused everywhere.

10. **Limited observability for async email tasks**
   - Risk: silent partial failures.
   - Fix: durable job table, retries, dead-letter queue, and dashboard.
