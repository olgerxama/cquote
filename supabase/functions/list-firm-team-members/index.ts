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

async function listUsersById(service: ReturnType<typeof createClient>) {
  const users = new Map<string, string>()
  let page = 1
  const perPage = 200

  while (page < 20) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage })
    if (error) break

    for (const user of data.users) {
      users.set(user.id, user.email || '')
    }

    if (data.users.length < perPage) break
    page += 1
  }

  return users
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

    const { firmId } = await req.json()
    if (!firmId) return json({ error: 'Missing firmId' }, 400)

    const [{ data: actorLink }, { data: firm }] = await Promise.all([
      service.from('firm_users').select('role').eq('firm_id', firmId).eq('user_id', authUser.user.id).maybeSingle(),
      service.from('firms').select('owner_user_id').eq('id', firmId).maybeSingle(),
    ])

    const isMember = !!actorLink || firm?.owner_user_id === authUser.user.id
    if (!isMember) return json({ error: 'Forbidden' }, 403)

    const { data: members, error: memberError } = await service
      .from('firm_users')
      .select('id,user_id,firm_id,role,created_at')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: true })

    if (memberError) return json({ error: memberError.message }, 400)

    const emailByUserId = await listUsersById(service)

    const rows = (members || []).map((member) => ({
      ...member,
      email: emailByUserId.get(member.user_id) || null,
    }))

    return json({ ok: true, members: rows })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
