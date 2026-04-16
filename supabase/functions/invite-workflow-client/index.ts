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
  let page = 1
  const perPage = 200
  while (page < 20) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage })
    if (error) return null
    const found = data.users.find((u) => (u.email || '').toLowerCase() === email)
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

    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: authUser, error: authError } = await anon.auth.getUser()
    if (authError || !authUser.user) return json({ error: 'Unauthorized' }, 401)

    const { workflowId, email, fullName } = await req.json()
    if (!workflowId || !email) return json({ error: 'Missing required fields' }, 400)

    const normalizedEmail = String(email).trim().toLowerCase()

    const { data: workflow } = await service
      .from('client_workflows')
      .select('id,firm_id,title')
      .eq('id', workflowId)
      .maybeSingle()

    if (!workflow) return json({ error: 'Workflow not found' }, 404)

    const { data: actorLink } = await service
      .from('firm_users')
      .select('role')
      .eq('firm_id', workflow.firm_id)
      .eq('user_id', authUser.user.id)
      .maybeSingle()

    const { data: firm } = await service
      .from('firms')
      .select('owner_user_id,name')
      .eq('id', workflow.firm_id)
      .maybeSingle()

    const canManage = firm?.owner_user_id === authUser.user.id || actorLink?.role === 'admin'
    if (!canManage) return json({ error: 'Forbidden' }, 403)

    const { data: existingClient } = await service
      .from('workflow_clients')
      .select('id')
      .eq('firm_id', workflow.firm_id)
      .eq('email', normalizedEmail)
      .maybeSingle()

    let workflowClientId = existingClient?.id as string | undefined
    if (!workflowClientId) {
      const { data: insertedClient, error: clientInsertError } = await service
        .from('workflow_clients')
        .insert({
          firm_id: workflow.firm_id,
          email: normalizedEmail,
          full_name: fullName || null,
          invited_by_user_id: authUser.user.id,
          invited_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (clientInsertError || !insertedClient) {
        return json({ error: clientInsertError?.message || 'Failed to create client record' }, 400)
      }
      workflowClientId = insertedClient.id as string
    } else {
      await service
        .from('workflow_clients')
        .update({ full_name: fullName || null, invited_by_user_id: authUser.user.id, invited_at: new Date().toISOString() })
        .eq('id', workflowClientId)
    }

    const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'http://localhost:5173'
    const redirectTo = `${appUrl}/client/accept-invite?workflowId=${encodeURIComponent(workflowId)}&email=${encodeURIComponent(normalizedEmail)}`

    let invitedUserId: string | null = null
    const inviteResult = await service.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
      data: {
        workflow_id: workflowId,
        workflow_title: workflow.title,
        firm_id: workflow.firm_id,
        firm_name: firm?.name || 'your firm',
      },
    })

    if (inviteResult.error) {
      invitedUserId = await findUserIdByEmail(service, normalizedEmail)
      if (!invitedUserId) {
        return json({ error: inviteResult.error.message || 'Failed to invite user' }, 400)
      }
    } else {
      invitedUserId = inviteResult.data.user?.id || null
    }

    if (invitedUserId) {
      await service
        .from('workflow_clients')
        .update({ auth_user_id: invitedUserId })
        .eq('id', workflowClientId)
    }

    await service
      .from('client_workflow_invites')
      .upsert(
        {
          workflow_client_id: workflowClientId,
          firm_id: workflow.firm_id,
          email: normalizedEmail,
          invited_by_user_id: authUser.user.id,
          invited_at: new Date().toISOString(),
          accepted_at: null,
          accepted_user_id: null,
        },
        { onConflict: 'firm_id,email' },
      )

    const { error: workflowUpdateError } = await service
      .from('client_workflows')
      .update({ workflow_client_id: workflowClientId })
      .eq('id', workflowId)

    if (workflowUpdateError) {
      return json({ error: workflowUpdateError.message }, 400)
    }

    return json({ ok: true, workflowClientId })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
