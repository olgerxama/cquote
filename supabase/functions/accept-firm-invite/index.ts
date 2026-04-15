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

    const authEmail = String(authUser.user.email || '').trim().toLowerCase()
    if (!authEmail) {
      return json({ error: 'Authenticated user has no email' }, 400)
    }

    let inviteQuery = service
      .from('firm_user_invites')
      .select('id,firm_id,role')
      .eq('email', authEmail)
      .is('accepted_at', null)
      .order('invited_at', { ascending: false })
      .limit(1)

    if (firmIdFromBody) {
      inviteQuery = inviteQuery.eq('firm_id', firmIdFromBody)
    }

    const { data: invite, error: inviteError } = await inviteQuery.maybeSingle()
    if (inviteError) return json({ error: inviteError.message }, 400)
    if (!invite) return json({ error: 'No pending invite found for this email and firm' }, 404)

    const targetFirmId = invite.firm_id as string
    const invitedRole = invite.role === 'admin' ? 'admin' : 'read_only'

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

    await service
      .from('firm_user_invites')
      .update({
        accepted_at: new Date().toISOString(),
        accepted_user_id: authUser.user.id,
      })
      .eq('id', invite.id)

    return json({ ok: true, firmId: targetFirmId, role: invitedRole })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
