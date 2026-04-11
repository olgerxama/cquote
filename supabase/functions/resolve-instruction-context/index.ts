// Self-contained edge function: resolve-instruction-context
// Given a firmSlug + ref (reference_code or leadId), return the full context
// needed by the public instruction page: firm, lead, quote, quote items.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { firmSlug, ref } = await req.json()
    if (!firmSlug || !ref) {
      return json({ error: 'Missing firmSlug or ref' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Resolve firm by slug
    const { data: firm, error: firmError } = await supabase
      .from('firms')
      .select('*')
      .eq('slug', firmSlug)
      .eq('is_active', true)
      .single()

    if (firmError || !firm) {
      return json({ error: 'Firm not found' }, 404)
    }

    // Try to resolve by quote reference_code first, fall back to lead id
    let lead: Record<string, unknown> | null = null
    let quote: Record<string, unknown> | null = null

    const { data: quoteByRef } = await supabase
      .from('quotes')
      .select('*')
      .eq('reference_code', ref)
      .eq('firm_id', firm.id)
      .maybeSingle()

    if (quoteByRef) {
      quote = quoteByRef
      const { data: leadById } = await supabase
        .from('leads')
        .select('*')
        .eq('id', quoteByRef.lead_id)
        .eq('firm_id', firm.id)
        .maybeSingle()
      lead = leadById
    } else if (UUID_RE.test(ref)) {
      const { data: leadById } = await supabase
        .from('leads')
        .select('*')
        .eq('id', ref)
        .eq('firm_id', firm.id)
        .maybeSingle()
      if (leadById) {
        lead = leadById
        const { data: quoteForLead } = await supabase
          .from('quotes')
          .select('*')
          .eq('lead_id', leadById.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        quote = quoteForLead
      }
    }

    if (!lead) {
      return json({ error: 'Instruction context not found' }, 404)
    }

    let items: unknown[] = []
    if (quote) {
      const { data: quoteItems } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quote.id)
        .order('sort_order', { ascending: true })
      items = quoteItems || []
    }

    return json({
      firm,
      lead,
      quote,
      items,
      reference: ref,
    })
  } catch (err) {
    return json({ error: 'Internal error', detail: String(err) }, 500)
  }
})
