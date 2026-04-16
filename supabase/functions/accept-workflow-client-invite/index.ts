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

    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: authUser, error: authError } = await anon.auth.getUser()
    if (authError || !authUser.user) return json({ error: 'Unauthorized' }, 401)

    const { workflowId } = await req.json().catch(() => ({ workflowId: null }))
    const authEmail = String(authUser.user.email || '').trim().toLowerCase()

    if (!authEmail) return json({ error: 'No email found for authenticated user' }, 400)

    let inviteQuery = service
      .from('client_workflow_invites')
      .select('id,workflow_client_id,firm_id')
      .eq('email', authEmail)
      .is('accepted_at', null)
      .order('invited_at', { ascending: false })
      .limit(1)

    if (workflowId) {
      const { data: workflow } = await service
        .from('client_workflows')
        .select('workflow_client_id')
        .eq('id', workflowId)
        .maybeSingle()
      if (!workflow?.workflow_client_id) return json({ error: 'Workflow invite not found' }, 404)
      inviteQuery = inviteQuery.eq('workflow_client_id', workflow.workflow_client_id)
    }

    const { data: invite, error: inviteError } = await inviteQuery.maybeSingle()
    if (inviteError) return json({ error: inviteError.message }, 400)
    if (!invite) return json({ error: 'No pending client invite found' }, 404)

    const { error: clientUpdateError } = await service
      .from('workflow_clients')
      .update({
        auth_user_id: authUser.user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invite.workflow_client_id)

    if (clientUpdateError) return json({ error: clientUpdateError.message }, 400)

    const { error: inviteUpdateError } = await service
      .from('client_workflow_invites')
      .update({
        accepted_at: new Date().toISOString(),
        accepted_user_id: authUser.user.id,
      })
      .eq('id', invite.id)

    if (inviteUpdateError) return json({ error: inviteUpdateError.message }, 400)

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
