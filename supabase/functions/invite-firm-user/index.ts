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

async function findUserIdByEmail(service: ReturnType<typeof createClient>, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  let page = 1
  const perPage = 200

  while (page < 20) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage })
    if (error) return null
    const found = data.users.find((u) => (u.email || '').toLowerCase() === normalized)
    if (found?.id) return found.id
    if (data.users.length < perPage) break
    page += 1
  }
  return null
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
      .select('owner_user_id,name')
      .eq('id', firmId)
      .maybeSingle()

    const canManage = firm?.owner_user_id === authUser.user.id || actorLink?.role === 'admin'
    if (!canManage) return json({ error: 'Forbidden' }, 403)

    const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'http://localhost:5173'

    const normalizedEmail = String(email).trim().toLowerCase()
    const { error: inviteLogError } = await service
      .from('firm_user_invites')
      .upsert(
        {
          firm_id: firmId,
          email: normalizedEmail,
          role,
          invited_by_user_id: authUser.user.id,
          invited_at: new Date().toISOString(),
          accepted_at: null,
          accepted_user_id: null,
        },
        { onConflict: 'firm_id,email' },
      )

    if (inviteLogError) {
      return json({ error: inviteLogError.message }, 400)
    }

    const redirectTo = `${appUrl}/admin/accept-invite?firmId=${encodeURIComponent(firmId)}&email=${encodeURIComponent(normalizedEmail)}`
    const inviterName =
      authUser.user.user_metadata?.full_name ||
      authUser.user.user_metadata?.name ||
      authUser.user.email ||
      'A team member'
    const roleLabel = role === 'admin' ? 'Admin' : 'Read-only'
    const inviteResult = await service.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
      data: {
        firm_name: firm?.name || 'your firm',
        inviter_name: inviterName,
        member_role: roleLabel,
        invited_role: role,
        firm_id: firmId,
      },
    })

    let invitedUserId = inviteResult.data.user?.id || null
    let message = 'Invitation sent'

    if (inviteResult.error) {
      const existingUserId = await findUserIdByEmail(service, normalizedEmail)
      if (!existingUserId) {
        return json({ error: inviteResult.error.message || 'Failed to invite user' }, 400)
      }
      invitedUserId = existingUserId
      message = 'Existing user added to firm'
    }

    if (!invitedUserId) {
      return json({ error: 'Unable to resolve invited user' }, 400)
    }

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

    return json({ ok: true, message })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
