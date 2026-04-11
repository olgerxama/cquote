// Self-contained edge function: create-public-lead
// Handles a public quote form submission: creates the lead, optionally creates
// a quote + items, sends the firm's new-enquiry notification, and optionally
// auto-sends the customer quote email.
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
    await client.send({
      from: opts.fromName ? `${opts.fromName} <${opts.from}>` : opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })
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

function notificationEmailHtml(p: {
  firmName: string
  leadName: string
  leadEmail: string
  serviceType: string
  propertyValue: number
  status: string
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
<h2 style="color:#1e3a5f;">New Enquiry - ${p.firmName}</h2>
<table style="width:100%;border-collapse:collapse;">
<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Name</td><td style="padding:8px;border-bottom:1px solid #eee;">${p.leadName}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Email</td><td style="padding:8px;border-bottom:1px solid #eee;">${p.leadEmail}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Service</td><td style="padding:8px;border-bottom:1px solid #eee;">${p.serviceType}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Property Value</td><td style="padding:8px;border-bottom:1px solid #eee;">&pound;${p.propertyValue.toLocaleString()}</td></tr>
<tr><td style="padding:8px;font-weight:bold;">Status</td><td style="padding:8px;">${p.status}</td></tr>
</table>
<p style="margin-top:20px;">Log in to your ConveyQuote dashboard to view and manage this lead.</p>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { lead, discountCodeId, totals, quoteItems } = await req.json()

    if (!lead?.firm_id || !lead?.email || !lead?.full_name) {
      return new Response(JSON.stringify({ error: 'Missing required lead fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify firm is active and public
    const { data: firm, error: firmError } = await supabase
      .from('firms')
      .select('*')
      .eq('id', lead.firm_id)
      .eq('is_active', true)
      .eq('public_quote_form_enabled', true)
      .single()

    if (firmError || !firm) {
      return new Response(JSON.stringify({ error: 'Firm not available' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Insert lead
    const { data: insertedLead, error: leadError } = await supabase
      .from('leads')
      .insert(lead)
      .select('id')
      .single()

    if (leadError) {
      return new Response(
        JSON.stringify({ error: 'Failed to create lead', detail: leadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const leadId = insertedLead.id

    if (discountCodeId) {
      await supabase.rpc('increment_discount_use_count', { _discount_code_id: discountCodeId })
    }

    let quoteId: string | null = null
    let referenceCode: string | null = null

    if (lead.status !== 'review' && totals) {
      const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          lead_id: leadId,
          firm_id: lead.firm_id,
          status: 'draft',
          subtotal: totals.subtotal || 0,
          vat_total: totals.vatTotal || 0,
          grand_total: totals.grandTotal || 0,
          discount_total: 0,
        })
        .select('id')
        .single()

      if (!quoteError && quote) {
        quoteId = quote.id
        referenceCode = `CQ-${quoteId.substring(0, 8).toUpperCase()}`
        await supabase
          .from('quotes')
          .update({ reference_code: referenceCode })
          .eq('id', quoteId)

        if (quoteItems?.length) {
          const items = quoteItems.map((item: Record<string, unknown>, i: number) => ({
            quote_id: quoteId,
            description: item.description || 'Item',
            amount: item.amount || 0,
            is_vatable: item.is_vatable ?? true,
            item_type: item.item_type || 'fee',
            sort_order: item.sort_order ?? i,
            source_type: item.source_type || 'manual',
          }))
          await supabase.from('quote_items').insert(items)
        }
      }
    }

    const instructionRef = referenceCode || leadId
    const emailTasks: Array<{ task: string; result?: unknown }> = []
    const fromEmail = getFromEmail()

    // Firm notification
    try {
      const firmEmail = firm.reply_to_email || fromEmail
      const result = await sendEmail({
        to: firmEmail,
        from: fromEmail,
        fromName: 'ConveyQuote',
        subject: `New Enquiry: ${lead.full_name} - ${lead.service_type}`,
        html: notificationEmailHtml({
          firmName: firm.name,
          leadName: lead.full_name,
          leadEmail: lead.email,
          serviceType: lead.service_type,
          propertyValue: lead.property_value,
          status: lead.status || 'new',
        }),
      })
      emailTasks.push({ task: 'firm_notification', result })
    } catch (err) {
      emailTasks.push({ task: 'firm_notification', result: { error: String(err) } })
    }

    // Customer auto quote email
    if (firm.auto_send_quote_emails && lead.status !== 'review' && totals) {
      try {
        const baseUrl = getBaseUrl()
        const instructionLink = `${baseUrl}/quote/${firm.slug}/instruct?ref=${instructionRef}`
        const result = await sendEmail({
          to: lead.email,
          from: fromEmail,
          fromName: firm.sender_display_name || firm.name,
          subject: `Your Quote from ${firm.name}`,
          html: quoteEmailHtml({
            firmName: firm.name,
            leadName: lead.full_name,
            serviceType: lead.service_type,
            grandTotal: totals.grandTotal || 0,
            referenceCode: referenceCode || undefined,
            instructionLink,
            documentType: 'estimate',
          }),
        })
        emailTasks.push({ task: 'customer_quote', result })

        if (quoteId) {
          await supabase
            .from('quotes')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', quoteId)
        }
      } catch (err) {
        emailTasks.push({ task: 'customer_quote', result: { error: String(err) } })
      }
    }

    return new Response(
      JSON.stringify({ id: leadId, quoteId, instructionRef, emailTasks }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
