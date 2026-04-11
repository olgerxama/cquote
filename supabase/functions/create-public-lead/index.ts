// Self-contained edge function: create-public-lead
// Handles a public quote form submission: creates the lead, optionally creates
// a quote + items, sends the firm a new-enquiry notification, and sends the
// customer a thank-you email with a PDF estimate attached.
//
// Email is sent ONLY via SMTP. There are no third-party API providers.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailAttachment {
  filename: string
  content: string // base64
}

interface EmailOptions {
  to: string
  from: string
  fromName?: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
}

interface QuoteItemInput {
  description?: string
  amount?: number
  is_vatable?: boolean
  item_type?: string
  sort_order?: number
}

// Hard timeout so a hanging SMTP server can never stall the edge function.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ])
}

async function sendViaSmtp(opts: EmailOptions): Promise<void> {
  const host = Deno.env.get('SMTP_HOST')
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  if (!host || !user || !pass) {
    throw new Error('SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing)')
  }
  const port = parseInt(Deno.env.get('SMTP_PORT') || '587')
  // Port 465 uses implicit TLS; 587/25 start plain and upgrade via STARTTLS.
  const implicitTls = Deno.env.get('SMTP_SECURE') === 'true' || port === 465

  // Most SMTP relays reject any from-address the authenticated user does
  // not own (553 5.7.1). Force the SMTP envelope sender to match SMTP_USER
  // (or an explicitly-configured SMTP_FROM_EMAIL on the same domain).
  const smtpFromEmail = Deno.env.get('SMTP_FROM_EMAIL') || user
  const fromHeader = opts.fromName ? `${opts.fromName} <${smtpFromEmail}>` : smtpFromEmail
  // If the caller wanted a different reply destination (e.g. the firm's
  // address), expose it via Reply-To rather than From.
  const replyTo = opts.from && opts.from !== smtpFromEmail ? opts.from : undefined

  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: implicitTls,
      auth: { username: user, password: pass },
    },
  })

  try {
    const message: Record<string, unknown> = {
      from: fromHeader,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }
    if (replyTo) message.replyTo = replyTo
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
  } finally {
    try { await client.close() } catch (_) { /* ignore */ }
  }
}

async function sendEmail(opts: EmailOptions): Promise<{ ok: boolean; error?: string }> {
  try {
    await withTimeout(sendViaSmtp(opts), 20000, 'SMTP')
    return { ok: true }
  } catch (e) {
    console.error('SMTP send failed:', e)
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

function getBaseUrl(): string {
  return Deno.env.get('APP_BASE_URL') || 'http://localhost:5173'
}

// ─── PDF generation ──────────────────────────────────────────────────────
// Builds a one-page A4 quote PDF using pdf-lib (pure JS, runs in Deno edge
// runtime). Returns base64 so it can be attached straight to an email.
async function generateQuotePdfBase64(p: {
  firmName: string
  leadName: string
  leadEmail: string
  serviceType: string
  referenceCode?: string
  items: QuoteItemInput[]
  subtotal: number
  vatTotal: number
  grandTotal: number
}): Promise<string> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842]) // A4 portrait, points
  const { width } = page.getSize()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const navy = rgb(0.118, 0.227, 0.373)
  const grey = rgb(0.4, 0.4, 0.4)
  const line = rgb(0.85, 0.85, 0.85)

  let y = 800
  page.drawText(p.firmName, { x: 40, y, font: bold, size: 18, color: navy })
  y -= 28
  page.drawText('Conveyancing Quote Estimate', { x: 40, y, font, size: 12, color: grey })
  y -= 22
  if (p.referenceCode) {
    page.drawText(`Reference: ${p.referenceCode}`, { x: 40, y, font, size: 10, color: grey })
    y -= 14
  }
  page.drawText(`Date: ${new Date().toLocaleDateString('en-GB')}`, {
    x: 40, y, font, size: 10, color: grey,
  })
  y -= 24

  // Customer block
  page.drawText('Prepared for:', { x: 40, y, font: bold, size: 11, color: navy })
  y -= 14
  page.drawText(p.leadName, { x: 40, y, font, size: 11 })
  y -= 14
  page.drawText(p.leadEmail, { x: 40, y, font, size: 10, color: grey })
  y -= 14
  page.drawText(`Service: ${p.serviceType.replace('_', ' & ')}`, {
    x: 40, y, font, size: 10, color: grey,
  })
  y -= 24

  // Items header
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, color: line, thickness: 1 })
  y -= 16
  page.drawText('Description', { x: 40, y, font: bold, size: 10, color: navy })
  page.drawText('VAT', { x: 380, y, font: bold, size: 10, color: navy })
  page.drawText('Amount', { x: 480, y, font: bold, size: 10, color: navy })
  y -= 8
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, color: line, thickness: 1 })
  y -= 14

  for (const item of p.items) {
    if (y < 120) break // safety
    const desc = String(item.description || 'Item').slice(0, 60)
    const amt = Number(item.amount || 0)
    page.drawText(desc, { x: 40, y, font, size: 10 })
    page.drawText(item.is_vatable === false ? 'No' : 'Yes', { x: 380, y, font, size: 10 })
    page.drawText(`£${amt.toFixed(2)}`, { x: 480, y, font, size: 10 })
    y -= 14
  }

  y -= 6
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, color: line, thickness: 1 })
  y -= 16

  // Totals
  page.drawText('Subtotal', { x: 380, y, font, size: 10, color: grey })
  page.drawText(`£${p.subtotal.toFixed(2)}`, { x: 480, y, font, size: 10 })
  y -= 14
  page.drawText('VAT', { x: 380, y, font, size: 10, color: grey })
  page.drawText(`£${p.vatTotal.toFixed(2)}`, { x: 480, y, font, size: 10 })
  y -= 16
  page.drawText('Total (inc VAT)', { x: 380, y, font: bold, size: 12, color: navy })
  page.drawText(`£${p.grandTotal.toFixed(2)}`, { x: 480, y, font: bold, size: 12, color: navy })

  // Footer
  page.drawText(
    'This is an estimate only and may be subject to change. Please contact us for a full breakdown.',
    { x: 40, y: 60, font, size: 8, color: grey },
  )

  const bytes = await pdf.save()
  // Encode to base64
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// ─── Email templates ─────────────────────────────────────────────────────
function customerThankYouHtml(p: {
  firmName: string
  leadName: string
  serviceType: string
  grandTotal?: number
  referenceCode?: string
  instructionLink?: string
  hasPdf: boolean
}): string {
  const total = p.grandTotal != null
    ? `<p style="font-size:24px;font-weight:bold;color:#1e3a5f;margin:16px 0;">Estimated Total: &pound;${p.grandTotal.toFixed(2)} (inc. VAT)</p>`
    : ''
  const ref = p.referenceCode ? `<p><strong>Reference:</strong> ${p.referenceCode}</p>` : ''
  const cta = p.instructionLink
    ? `<p style="margin-top:24px;">Ready to proceed? Click below to instruct us:</p>
<p><a href="${p.instructionLink}" style="display:inline-block;background:#1e3a5f;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;">Instruct Now</a></p>`
    : ''
  const pdfNote = p.hasPdf
    ? '<p style="color:#666;font-size:13px;">Your detailed quote estimate is attached to this email as a PDF.</p>'
    : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
<h2 style="color:#1e3a5f;margin-bottom:8px;">${p.firmName}</h2>
<p>Dear ${p.leadName},</p>
<p>Thank you for reaching out about your ${p.serviceType.replace('_', ' & ')} matter.
We've received your enquiry and a member of our team will be in touch shortly.</p>
${ref}
${total}
${pdfNote}
${cta}
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
    const emailTasks: Array<{ task: string; ok: boolean; error?: string }> = []
    const fromEmail = getFromEmail()

    // ── Firm notification (always) ──
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
      emailTasks.push({ task: 'firm_notification', ...result })
    } catch (err) {
      emailTasks.push({ task: 'firm_notification', ok: false, error: String(err) })
    }

    // ── Customer thank-you (always, with PDF if we have totals) ──
    try {
      const baseUrl = getBaseUrl()
      const instructionLink =
        lead.status !== 'review' && totals
          ? `${baseUrl}/quote/${firm.slug}/instruct?ref=${instructionRef}`
          : undefined

      let attachments: EmailAttachment[] | undefined
      if (totals && quoteItems?.length) {
        try {
          const pdfBase64 = await generateQuotePdfBase64({
            firmName: firm.name,
            leadName: lead.full_name,
            leadEmail: lead.email,
            serviceType: lead.service_type,
            referenceCode: referenceCode || undefined,
            items: quoteItems,
            subtotal: totals.subtotal || 0,
            vatTotal: totals.vatTotal || 0,
            grandTotal: totals.grandTotal || 0,
          })
          attachments = [
            {
              filename: `quote-${referenceCode || leadId}.pdf`,
              content: pdfBase64,
            },
          ]
        } catch (pdfErr) {
          console.error('PDF generation failed:', pdfErr)
        }
      }

      const result = await sendEmail({
        to: lead.email,
        from: fromEmail,
        fromName: firm.sender_display_name || firm.name,
        subject: `Thank you — your quote from ${firm.name}`,
        html: customerThankYouHtml({
          firmName: firm.name,
          leadName: lead.full_name,
          serviceType: lead.service_type,
          grandTotal: totals?.grandTotal,
          referenceCode: referenceCode || undefined,
          instructionLink,
          hasPdf: !!attachments,
        }),
        attachments,
      })
      emailTasks.push({ task: 'customer_thank_you', ...result })

      if (quoteId && result.ok) {
        await supabase
          .from('quotes')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', quoteId)
      }
    } catch (err) {
      emailTasks.push({ task: 'customer_thank_you', ok: false, error: String(err) })
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
