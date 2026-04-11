// Self-contained edge function: send-quote-email
// Admin-triggered: sends a quote/invoice email to the lead with an optional
// PDF attachment, then marks the quote as sent.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailAttachment {
  filename: string
  content: string
  encoding: 'base64'
}

interface EmailOptions {
  to: string
  from: string
  fromName?: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
}

// Hard timeout so a hanging provider can never stall the edge function.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ])
}

async function sendViaSendGrid(opts: EmailOptions): Promise<boolean> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY')
  if (!apiKey) return false
  const body: Record<string, unknown> = {
    personalizations: [{ to: [{ email: opts.to }] }],
    from: { email: opts.from, name: opts.fromName || 'ConveyQuote' },
    subject: opts.subject,
    content: [{ type: 'text/html', value: opts.html }],
  }
  if (opts.attachments?.length) {
    body.attachments = opts.attachments.map((a) => ({
      content: a.content,
      filename: a.filename,
      type: 'application/pdf',
      disposition: 'attachment',
    }))
  }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

async function sendViaResend(opts: EmailOptions): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return false
  const body: Record<string, unknown> = {
    from: opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
  }
  if (opts.attachments?.length) {
    body.attachments = opts.attachments.map((a) => ({
      content: a.content,
      filename: a.filename,
    }))
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

async function sendViaSmtp(opts: EmailOptions): Promise<boolean> {
  const host = Deno.env.get('SMTP_HOST')
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  if (!host || !user || !pass) return false
  const port = parseInt(Deno.env.get('SMTP_PORT') || '587')
  // Port 465 uses implicit TLS; 587/25 start plain and upgrade via STARTTLS.
  const implicitTls = Deno.env.get('SMTP_SECURE') === 'true' || port === 465

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
      from: opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }
    if (opts.attachments?.length) {
      message.attachments = opts.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: 'base64',
        contentType: 'application/pdf',
      }))
    }
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

async function sendEmail(opts: EmailOptions): Promise<{ ok: boolean; provider: string }> {
  // Each provider is bounded by a hard timeout so one misbehaving path
  // (e.g. blocked SMTP port) can never hang the whole request.
  try {
    if (await withTimeout(sendViaSmtp(opts), 15000, 'SMTP')) {
      return { ok: true, provider: 'smtp' }
    }
  } catch (e) {
    console.warn('SMTP failed:', e)
  }
  try {
    if (await withTimeout(sendViaSendGrid(opts), 15000, 'SendGrid')) {
      return { ok: true, provider: 'sendgrid' }
    }
  } catch (e) {
    console.warn('SendGrid failed:', e)
  }
  try {
    if (await withTimeout(sendViaResend(opts), 15000, 'Resend')) {
      return { ok: true, provider: 'resend' }
    }
  } catch (e) {
    console.warn('Resend failed:', e)
  }
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

function getBaseUrl(): string {
  return Deno.env.get('APP_BASE_URL') || 'http://localhost:5173'
}

function quoteEmailHtml(p: {
  firmName: string
  leadName: string
  serviceType: string
  grandTotal: number
  referenceCode?: string
  instructionLink?: string
  documentType?: string
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
<h2 style="color:#1e3a5f;">${p.firmName}</h2>
<p>Dear ${p.leadName},</p>
<p>Thank you for your ${p.serviceType.replace('_', ' & ')} enquiry. Please find your ${p.documentType || 'estimate'} details below.</p>
${p.referenceCode ? `<p><strong>Reference:</strong> ${p.referenceCode}</p>` : ''}
<p style="font-size:24px;font-weight:bold;color:#1e3a5f;">Total: &pound;${p.grandTotal.toFixed(2)} (inc. VAT)</p>
${p.instructionLink ? `<p>Ready to proceed? Click the button below to instruct us:</p>
<p><a href="${p.instructionLink}" style="display:inline-block;background:#1e3a5f;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Instruct Now</a></p>` : ''}
<p style="color:#666;font-size:12px;margin-top:30px;">This is an estimate only and may be subject to change. Please contact us for a full breakdown.</p>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing auth' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Verify user
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { quoteId, leadId, documentType, totals, pdfAttachment } = await req.json()

    if (!quoteId || !leadId || !documentType || !totals) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'INVALID_PAYLOAD', message: 'Missing required fields' },
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const [quoteRes, leadRes] = await Promise.all([
      supabase.from('quotes').select('*').eq('id', quoteId).single(),
      supabase.from('leads').select('*').eq('id', leadId).single(),
    ])

    if (!quoteRes.data || !leadRes.data) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Quote or lead not found' },
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const quote = quoteRes.data
    const lead = leadRes.data

    const { data: firm } = await supabase
      .from('firms')
      .select('*')
      .eq('id', quote.firm_id)
      .single()
    if (!firm) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Firm not found' } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const fromEmail = getFromEmail()
    const baseUrl = getBaseUrl()
    const instructionRef = quote.reference_code || leadId
    const instructionLink = `${baseUrl}/quote/${firm.slug}/instruct?ref=${instructionRef}`

    const emailOptions: EmailOptions = {
      to: lead.email,
      from: fromEmail,
      fromName: firm.sender_display_name || firm.name,
      subject: `Your ${documentType === 'invoice' ? 'Invoice' : 'Quote Estimate'} from ${firm.name}`,
      html: quoteEmailHtml({
        firmName: firm.name,
        leadName: lead.full_name,
        serviceType: lead.service_type,
        grandTotal: totals.grandTotal,
        referenceCode: quote.reference_code || undefined,
        instructionLink,
        documentType,
      }),
    }

    if (pdfAttachment?.base64) {
      emailOptions.attachments = [
        {
          filename: pdfAttachment.filename || `${documentType}-${quote.reference_code || quoteId}.pdf`,
          content: pdfAttachment.base64,
          encoding: 'base64',
        },
      ]
    }

    const result = await sendEmail(emailOptions)

    if (!result.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'EMAIL_FAILED', message: 'All email providers failed', stage: 'send' },
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    await supabase
      .from('quotes')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        document_type: documentType,
        document_generated_at: new Date().toISOString(),
      })
      .eq('id', quoteId)

    return new Response(
      JSON.stringify({ ok: true, quoteId, leadId, provider: result.provider, documentType }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'INTERNAL', message: String(err) } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
