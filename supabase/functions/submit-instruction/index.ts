// Self-contained edge function: submit-instruction
// Records instruction details on the lead (into answers jsonb) and notifies
// the firm by email.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

async function sendViaSendGrid(opts: EmailOptions): Promise<boolean> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY')
  if (!apiKey) return false
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: opts.to }] }],
      from: { email: opts.from, name: opts.fromName || 'ConveyQuote' },
      subject: opts.subject,
      content: [{ type: 'text/html', value: opts.html }],
    }),
  })
  return res.ok
}

async function sendViaResend(opts: EmailOptions): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  })
  return res.ok
}

async function sendViaSmtp(opts: EmailOptions): Promise<boolean> {
  const host = Deno.env.get('SMTP_HOST')
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  if (!host || !user || !pass) return false
  const port = parseInt(Deno.env.get('SMTP_PORT') || '587')
  const secure = Deno.env.get('SMTP_SECURE') === 'true'
  try {
    const conn = secure
      ? await Deno.connectTls({ hostname: host, port })
      : await Deno.connect({ hostname: host, port })
    const enc = new TextEncoder()
    const dec = new TextDecoder()
    const read = async () => {
      const buf = new Uint8Array(4096)
      const n = await conn.read(buf)
      return n ? dec.decode(buf.subarray(0, n)) : ''
    }
    const cmd = async (c: string) => {
      await conn.write(enc.encode(c + '\r\n'))
      return read()
    }
    await read()
    await cmd('EHLO conveyquote')
    await cmd('AUTH LOGIN')
    await cmd(btoa(user))
    const authRes = await cmd(btoa(pass))
    if (!authRes.startsWith('235')) {
      conn.close()
      return false
    }
    await cmd(`MAIL FROM:<${opts.from}>`)
    await cmd(`RCPT TO:<${opts.to}>`)
    await cmd('DATA')
    let msg = `From: ${opts.fromName || 'ConveyQuote'} <${opts.from}>\r\n`
    msg += `To: ${opts.to}\r\n`
    msg += `Subject: ${opts.subject}\r\n`
    msg += `MIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n`
    msg += opts.html + '\r\n.'
    const dataRes = await cmd(msg)
    await cmd('QUIT')
    conn.close()
    return dataRes.startsWith('250')
  } catch (err) {
    console.error('SMTP error:', err)
    return false
  }
}

async function sendEmail(opts: EmailOptions): Promise<{ ok: boolean; provider: string }> {
  if (await sendViaSmtp(opts)) return { ok: true, provider: 'smtp' }
  if (await sendViaSendGrid(opts)) return { ok: true, provider: 'sendgrid' }
  if (await sendViaResend(opts)) return { ok: true, provider: 'resend' }
  return { ok: false, provider: 'none' }
}

function getFromEmail(): string {
  return (
    Deno.env.get('SMTP_FROM_EMAIL') ||
    Deno.env.get('EMAIL_FROM') ||
    Deno.env.get('PLATFORM_FROM_EMAIL') ||
    'noreply@conveyquote.com'
  )
}

function instructionEmailHtml(p: {
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
<p>${p.leadName} (${p.leadEmail}) has completed instruction for a ${p.serviceType.replace('_', ' & ')} matter.</p>
<table style="width:100%;border-collapse:collapse;margin-top:16px;">${rows}</table>
<p style="margin-top:20px;">Log in to ConveyQuote to view and action this instruction.</p>
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

    // Notify firm
    const fromEmail = getFromEmail()
    const firmEmail = firm.reply_to_email || fromEmail
    let emailResult: { ok: boolean; provider: string } = { ok: false, provider: 'skipped' }
    try {
      emailResult = await sendEmail({
        to: firmEmail,
        from: fromEmail,
        fromName: 'ConveyQuote',
        subject: `Instruction Submitted: ${lead.full_name} - ${lead.service_type}`,
        html: instructionEmailHtml({
          firmName: firm.name,
          leadName: lead.full_name,
          leadEmail: lead.email,
          serviceType: lead.service_type,
          details,
        }),
      })
    } catch (err) {
      emailResult = { ok: false, provider: `error:${String(err)}` }
    }

    return new Response(
      JSON.stringify({ ok: true, leadId, email: emailResult }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
