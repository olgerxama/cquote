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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) return json({ error: 'Missing STRIPE_SECRET_KEY.' }, 500)

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

    if (!firmMembership?.firm_id) return json({ error: 'No firm found for this user.' }, 400)

    const { data: firm } = await service
      .from('firms')
      .select('id,owner_user_id,stripe_customer_id')
      .eq('id', firmMembership.firm_id)
      .maybeSingle()

    if (!firm) return json({ error: 'Firm not found.' }, 404)
    if (!firm.stripe_customer_id) return json({ error: 'No Stripe customer exists yet. Upgrade first.' }, 400)

    const isFirmOwner = firm.owner_user_id === authUser.user.id
    if (!isFirmOwner) return json({ error: 'Only the firm owner can manage billing.' }, 403)

    const { returnUrl } = await req.json().catch(() => ({ returnUrl: null }))
    const fallbackUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'http://localhost:5173'
    const safeReturnUrl = typeof returnUrl === 'string' && returnUrl.startsWith('http')
      ? returnUrl
      : `${fallbackUrl}/admin/settings`

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' })

    const portal = await stripe.billingPortal.sessions.create({
      customer: firm.stripe_customer_id,
      return_url: safeReturnUrl,
    })

    return json({ url: portal.url })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
