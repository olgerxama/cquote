import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

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

function getFromEmail(): string {
  return (
    Deno.env.get('SMTP_FROM_EMAIL') ||
    Deno.env.get('EMAIL_FROM') ||
    Deno.env.get('PLATFORM_FROM_EMAIL') ||
    Deno.env.get('SMTP_USER') ||
    'noreply@conveyquote.com'
  )
}

async function sendViaSmtp(to: string, subject: string, html: string, fromName: string): Promise<boolean> {
  const host = Deno.env.get('SMTP_HOST')
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  if (!host || !user || !pass) return false

  const port = parseInt(Deno.env.get('SMTP_PORT') || '587')
  const implicitTls = Deno.env.get('SMTP_SECURE') === 'true' || port === 465
  const smtpFromEmail = Deno.env.get('SMTP_FROM_EMAIL') || user

  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: implicitTls,
      auth: { username: user, password: pass },
    },
  })

  try {
    await client.send({
      from: `${fromName} <${smtpFromEmail}>`,
      to,
      subject,
      html,
      replyTo: getFromEmail(),
    } as Record<string, unknown>)
    return true
  } catch (e) {
    console.error('SMTP send failed', e)
    return false
  } finally {
    try { await client.close() } catch { /* noop */ }
  }
}

function eventCopy(eventType: string): { subjectSuffix: string; body: string } {
  switch (eventType) {
    case 'for_review':
      return { subjectSuffix: 'submitted for review', body: 'A workflow step has been submitted and is ready for review.' }
    case 'complete':
      return { subjectSuffix: 'marked complete', body: 'A workflow step has been reviewed and marked complete.' }
    case 'needs_info':
      return { subjectSuffix: 'needs more information', body: 'A workflow step was sent back and needs additional information.' }
    case 'workflow_complete':
      return { subjectSuffix: 'workflow complete', body: 'All workflow steps are complete.' }
    default:
      return { subjectSuffix: 'workflow updated', body: 'A workflow step was updated.' }
  }
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

    const { data: authUser } = await anon.auth.getUser()
    if (!authUser?.user) return json({ error: 'Unauthorized' }, 401)

    const { workflowId, stepId, eventType } = await req.json()
    if (!workflowId || !eventType) return json({ error: 'workflowId and eventType are required' }, 400)

    const { data: workflow } = await service
      .from('client_workflows')
      .select('id,title,firm_id,status,workflow_client_id,firms(name,reply_to_email),workflow_clients(email,full_name)')
      .eq('id', workflowId)
      .maybeSingle()

    if (!workflow) return json({ error: 'Workflow not found' }, 404)

    const { data: member } = await service
      .from('firm_users')
      .select('id')
      .eq('firm_id', workflow.firm_id)
      .eq('user_id', authUser.user.id)
      .maybeSingle()

    const { data: owningFirm } = await service
      .from('firms')
      .select('id')
      .eq('id', workflow.firm_id)
      .eq('owner_user_id', authUser.user.id)
      .maybeSingle()

    const { data: clientAssignment } = await service
      .from('workflow_clients')
      .select('id')
      .eq('id', workflow.workflow_client_id)
      .eq('auth_user_id', authUser.user.id)
      .maybeSingle()

    const isFirmSide = !!member || !!owningFirm
    const isClientSide = !!clientAssignment

    if (!isFirmSide && !isClientSide) return json({ error: 'Forbidden' }, 403)

    let stepTitle = ''
    if (stepId) {
      const { data: step } = await service
        .from('workflow_steps')
        .select('title')
        .eq('id', stepId)
        .maybeSingle()
      stepTitle = step?.title || ''
    }

    const copy = eventCopy(eventType)
    const firmObj = (workflow.firms || {}) as { name?: string; reply_to_email?: string }
    const clientObj = (workflow.workflow_clients || {}) as { email?: string; full_name?: string }
    const firmName = firmObj.name || 'Your firm'
    const clientEmail = clientObj.email
    const clientName = clientObj.full_name || 'Client'
    const firmRecipient = firmObj.reply_to_email || getFromEmail()
    const subject = `${firmName}: ${copy.subjectSuffix} — ${workflow.title}`

    const line = stepTitle ? `<p><strong>Step:</strong> ${stepTitle}</p>` : ''
    const html = `<p>${copy.body}</p>${line}<p><strong>Workflow:</strong> ${workflow.title}</p>`

    const results = [] as Array<{ to: string; ok: boolean }>

    if (firmRecipient) {
      results.push({ to: firmRecipient, ok: await sendViaSmtp(firmRecipient, subject, html, 'ConveyQuote') })
    }
    if (clientEmail) {
      results.push({
        to: clientEmail,
        ok: await sendViaSmtp(
          clientEmail,
          subject,
          `<p>Hi ${clientName},</p>${html}`,
          firmName,
        ),
      })
    }

    return json({ ok: true, results })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
