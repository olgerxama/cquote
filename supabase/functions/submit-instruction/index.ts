// Self-contained edge function: submit-instruction
// Records instruction details on the lead (into answers jsonb) and notifies
// the firm by email.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailOptions {
  to: string
  from: string
  fromName?: string
  subject: string
  html: string
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ])
}

async function sendViaSmtp(opts: EmailOptions): Promise<boolean> {
  const host = Deno.env.get('SMTP_HOST')
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  if (!host || !user || !pass) return false
  const port = parseInt(Deno.env.get('SMTP_PORT') || '587')
  const implicitTls = Deno.env.get('SMTP_SECURE') === 'true' || port === 465

  // Most SMTP relays reject any from-address the authenticated user does
  // not own (553 5.7.1). Force the SMTP envelope sender to match SMTP_USER.
  const smtpFromEmail = Deno.env.get('SMTP_FROM_EMAIL') || user
  const fromHeader = opts.fromName ? `${opts.fromName} <${smtpFromEmail}>` : smtpFromEmail
  const replyTo = opts.from && opts.from !== smtpFromEmail ? opts.from : undefined

  let client: SMTPClient | null = null
  try {
    client = new SMTPClient({
      connection: {
        hostname: host,
        port,
        tls: implicitTls,
        auth: { username: user, password: pass },
      },
    })
    const message: Record<string, unknown> = {
      from: fromHeader,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }
    if (replyTo) message.replyTo = replyTo
    // deno-lint-ignore no-explicit-any
    await client.send(message as any)
    await client.close()
    return true
  } catch (err) {
    console.error('SMTP error:', err)
    if (client) {
      try { await client.close() } catch (_) { /* ignore */ }
    }
    return false
  }
}

async function sendEmail(opts: EmailOptions): Promise<{ ok: boolean; error?: string }> {
  try {
    const ok = await withTimeout(sendViaSmtp(opts), 20000, 'SMTP')
    return ok ? { ok: true } : { ok: false, error: 'SMTP send failed' }
  } catch (e) {
    console.error('SMTP failed:', e)
    return { ok: false, error: String(e) }
  }
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

function instructionFirmEmailHtml(p: {
  firmName: string
  leadName: string
  leadEmail: string
  serviceType: string
  details: Record<string, unknown>
}): string {
  const rows = Object.entries(p.details)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${k.replace(/_/g, ' ')}</td><td style="padding:8px;border-bottom:1px solid #eee;">${String(v ?? '')}</td></tr>`,
    )
    .join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
<h2 style="color:#1e3a5f;">Instruction Submitted - ${p.firmName}</h2>
<p><strong>${p.leadName}</strong> (${p.leadEmail}) has completed instruction for a ${p.serviceType.replace('_', ' & ')} matter.</p>
<table style="width:100%;border-collapse:collapse;margin-top:16px;">${rows}</table>
<p style="margin-top:20px;">Log in to ConveyQuote to view and action this instruction.</p>
</body></html>`
}

function instructionCustomerEmailHtml(p: {
  firmName: string
  leadName: string
  serviceType: string
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
<h2 style="color:#1e3a5f;margin-bottom:8px;">${p.firmName}</h2>
<p>Dear ${p.leadName},</p>
<p>Thank you for instructing us with your ${p.serviceType.replace('_', ' & ')} matter. We've received your instruction details and a member of our team will be in touch shortly to begin the next steps.</p>
<p>You don't need to do anything further at this stage — we'll reach out by email or phone with your case number and what to expect next.</p>
<p style="margin-top:20px;">Kind regards,<br/>The ${p.firmName} team</p>
<p style="color:#666;font-size:12px;margin-top:30px;border-top:1px solid #eee;padding-top:12px;">If you did not submit this instruction, please contact us immediately so we can investigate.</p>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { firmSlug, leadId, details } = await req.json()
    if (!firmSlug || !leadId || !details) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Resolve firm
    const { data: firm, error: firmError } = await supabase
      .from('firms')
      .select('*')
      .eq('slug', firmSlug)
      .eq('is_active', true)
      .single()

    if (firmError || !firm) {
      return new Response(JSON.stringify({ error: 'Firm not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('firm_id', firm.id)
      .single()

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Merge instruction details into answers AND set the dedicated column so
    // Postgres can efficiently sort/filter instructed leads.
    const existingAnswers = (lead.answers || {}) as Record<string, unknown>
    const submittedAt = new Date().toISOString()
    const updatedAnswers = {
      ...existingAnswers,
      instruction: details,
      instruction_submitted_at: submittedAt,
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update({
        answers: updatedAnswers,
        instruction_submitted_at: submittedAt,
      })
      .eq('id', leadId)

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to record instruction', detail: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Notify firm AND confirm to customer
    const fromEmail = getFromEmail()
    const firmEmail = firm.reply_to_email || fromEmail
    const emailTasks: Array<{ task: string; ok: boolean; error?: string }> = []

    // Firm notification
    try {
      const result = await sendEmail({
        to: firmEmail,
        from: fromEmail,
        fromName: 'ConveyQuote',
        subject: `Instruction Submitted: ${lead.full_name} - ${lead.service_type}`,
        html: instructionFirmEmailHtml({
          firmName: firm.name,
          leadName: lead.full_name,
          leadEmail: lead.email,
          serviceType: lead.service_type,
          details,
        }),
      })
      emailTasks.push({ task: 'firm_notification', ...result })
    } catch (err) {
      emailTasks.push({ task: 'firm_notification', ok: false, error: String(err) })
    }

    // Customer confirmation
    try {
      const result = await sendEmail({
        to: lead.email,
        from: fromEmail,
        fromName: firm.sender_display_name || firm.name,
        subject: `Instruction received — ${firm.name}`,
        html: instructionCustomerEmailHtml({
          firmName: firm.name,
          leadName: lead.full_name,
          serviceType: lead.service_type,
        }),
      })
      emailTasks.push({ task: 'customer_confirmation', ...result })
    } catch (err) {
      emailTasks.push({ task: 'customer_confirmation', ok: false, error: String(err) })
    }

    return new Response(
      JSON.stringify({ ok: true, leadId, emailTasks }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
