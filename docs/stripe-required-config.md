# Stripe setup details needed from you

I have wired the app for Stripe billing in code, but I need these Stripe values from your account before payments can go live.

## 1) Required Stripe values

Please provide the following:

1. **`STRIPE_SECRET_KEY`**
   - Your Stripe secret API key (test first, then live).
2. **`STRIPE_PROFESSIONAL_PRICE_ID`**
   - Price ID for the Professional monthly plan.
   - Must be **GBP** and **£49 / month recurring**.
3. **`STRIPE_WEBHOOK_SECRET`**
   - Signing secret for the webhook endpoint used by this app.

## 2) Product/price to create in Stripe

Create one product + recurring price:

- Product name: `ConveyQuote Professional`
- Billing: `recurring monthly`
- Price: `49.00 GBP`
- Recommended tax behavior: exclusive (or your preference)

Use that Price ID as `STRIPE_PROFESSIONAL_PRICE_ID`.

## 3) Webhook endpoint to configure in Stripe

Point Stripe to this Supabase Edge Function endpoint:

- `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`

Subscribe it to at least these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

After creating the webhook, copy the signing secret to `STRIPE_WEBHOOK_SECRET`.

## 4) Supabase secrets to set

Set these as Edge Function secrets in Supabase:

- `STRIPE_SECRET_KEY`
- `STRIPE_PROFESSIONAL_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `APP_URL` (recommended, e.g. `https://yourapp.com`)

## 5) Optional but recommended

- Configure customer portal settings in Stripe Billing Portal (what users can update/cancel).
- Add trial settings if you want free trials before charging.
- Test all flows in Stripe test mode first.

## 6) What has been wired in app

- Billing tab in Settings with:
  - Upgrade/checkout button
  - Manage billing portal button
  - Subscription status and period end display
- Premium feature locks for free users
- Stripe checkout function
- Stripe customer portal function
- Stripe webhook function that updates firm subscription fields

