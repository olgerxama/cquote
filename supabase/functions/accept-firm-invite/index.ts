import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const body = await req.json().catch(() => ({})) as { firmId?: string }
    const firmIdFromBody = body.firmId || null

    const metadata = authUser.user.user_metadata || {}
    const invitedFirmId = String(metadata.firm_id || '').trim() || null
    const invitedRole = metadata.invited_role === 'admin' ? 'admin' : 'read_only'

    const targetFirmId = firmIdFromBody || invitedFirmId
    if (!targetFirmId) {
      return json({ error: 'Missing invited firm context' }, 400)
    }

    if (invitedFirmId && targetFirmId !== invitedFirmId) {
      return json({ error: 'Firm mismatch for invite acceptance' }, 403)
    }

    const { error: upsertError } = await service
      .from('firm_users')
      .upsert(
        {
          user_id: authUser.user.id,
          firm_id: targetFirmId,
          role: invitedRole,
        },
        { onConflict: 'user_id,firm_id' },
      )

    if (upsertError) return json({ error: upsertError.message }, 400)

    return json({ ok: true, firmId: targetFirmId, role: invitedRole })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
