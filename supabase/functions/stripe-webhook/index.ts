import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mapPlanType(subscriptionStatus: string | null | undefined): 'free' | 'professional' {
  const normalized = (subscriptionStatus || '').toLowerCase()
  return normalized === 'active' || normalized === 'trialing' ? 'professional' : 'free'
}

async function upsertFirmBilling(service: ReturnType<typeof createClient>, subscription: Stripe.Subscription) {
  const firmId = subscription.metadata?.firm_id || null
  if (!firmId) throw new Error('Missing firm_id metadata on Stripe subscription.')

  const periodEndUnix = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end || null
  const periodEndIso = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null

  const { error } = await service
    .from('firms')
    .update({
      plan_type: mapPlanType(subscription.status),
      stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
      stripe_subscription_id: subscription.id,
      stripe_subscription_status: subscription.status,
      stripe_subscription_current_period_end: periodEndIso,
      stripe_subscription_cancel_at_period_end: !!subscription.cancel_at_period_end,
    })
    .eq('id', firmId)

  if (error) throw error
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

    if (!stripeSecretKey || !stripeWebhookSecret) {
      return json({ error: 'Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET' }, 500)
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' })
    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const signature = req.headers.get('stripe-signature')
    if (!signature) return json({ error: 'Missing stripe-signature header' }, 400)

    const payload = await req.text()
    const event = await stripe.webhooks.constructEventAsync(payload, signature, stripeWebhookSecret)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (!session.subscription) break
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
        await upsertFirmBilling(service, subscription)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await upsertFirmBilling(service, subscription)
        break
      }
      default:
        break
    }

    return json({ received: true })
  } catch (err) {
    return json({ error: String(err) }, 400)
  }
})
