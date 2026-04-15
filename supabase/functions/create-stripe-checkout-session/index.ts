import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function withCheckoutState(url: string, state: 'success' | 'cancelled'): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('checkout', state)
    return parsed.toString()
  } catch {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}checkout=${state}`
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const professionalPriceId = Deno.env.get('STRIPE_PROFESSIONAL_PRICE_ID')

    if (!stripeSecretKey || !professionalPriceId) {
      return json({ error: 'Stripe is not configured. Missing STRIPE_SECRET_KEY or STRIPE_PROFESSIONAL_PRICE_ID.' }, 500)
    }

    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Missing auth token' }, 401)

    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    )

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: authUser, error: authError } = await anon.auth.getUser()
    if (authError || !authUser.user) return json({ error: 'Unauthorized' }, 401)

    const { data: firmMembership } = await service
      .from('firm_users')
      .select('firm_id, role')
      .eq('user_id', authUser.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const firmId = firmMembership?.firm_id || null
    if (!firmId) return json({ error: 'No firm found for this user.' }, 400)

    const { data: firm } = await service
      .from('firms')
      .select('id,name,slug,owner_user_id,stripe_customer_id')
      .eq('id', firmId)
      .maybeSingle()

    if (!firm) return json({ error: 'Firm not found.' }, 404)

    const isFirmOwner = firm.owner_user_id === authUser.user.id
    if (!isFirmOwner) return json({ error: 'Only the firm owner can manage billing.' }, 403)

    const { returnUrl } = await req.json().catch(() => ({ returnUrl: null }))
    const fallbackUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'http://localhost:5173'
    const safeReturnUrl = typeof returnUrl === 'string' && returnUrl.startsWith('http')
      ? returnUrl
      : `${fallbackUrl}/admin/settings`

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: firm.stripe_customer_id || undefined,
      customer_email: firm.stripe_customer_id ? undefined : (authUser.user.email || undefined),
      line_items: [{ price: professionalPriceId, quantity: 1 }],
      success_url: withCheckoutState(safeReturnUrl, 'success'),
      cancel_url: withCheckoutState(safeReturnUrl, 'cancelled'),
      metadata: {
        firm_id: firm.id,
        firm_slug: firm.slug,
        source: 'conveyquote_billing',
      },
      subscription_data: {
        metadata: {
          firm_id: firm.id,
          source: 'conveyquote_billing',
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    })

    return json({ url: session.url })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
