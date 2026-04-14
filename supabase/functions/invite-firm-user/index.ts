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

    const { firmId, email, role } = await req.json()
    if (!firmId || !email || !role) return json({ error: 'Missing fields' }, 400)
    if (role !== 'admin' && role !== 'read_only') return json({ error: 'Invalid role' }, 400)

    const { data: actorLink } = await service
      .from('firm_users')
      .select('role')
      .eq('firm_id', firmId)
      .eq('user_id', authUser.user.id)
      .maybeSingle()

    const { data: firm } = await service
      .from('firms')
      .select('owner_user_id')
      .eq('id', firmId)
      .maybeSingle()

    const canManage = firm?.owner_user_id === authUser.user.id || actorLink?.role === 'admin'
    if (!canManage) return json({ error: 'Forbidden' }, 403)

    const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'http://localhost:5173'

    const inviteResult = await service.auth.admin.inviteUserByEmail(String(email).trim().toLowerCase(), {
      redirectTo: `${appUrl}/admin/accept-invite`,
    })

    if (inviteResult.error || !inviteResult.data.user?.id) {
      return json({ error: inviteResult.error?.message || 'Failed to invite user' }, 400)
    }

    const invitedUserId = inviteResult.data.user.id

    const { error: upsertError } = await service
      .from('firm_users')
      .upsert(
        {
          user_id: invitedUserId,
          firm_id: firmId,
          role,
        },
        { onConflict: 'user_id,firm_id' },
      )

    if (upsertError) return json({ error: upsertError.message }, 400)

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
