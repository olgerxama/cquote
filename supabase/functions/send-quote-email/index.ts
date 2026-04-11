// Self-contained edge function: send-quote-email
// Admin-triggered: sends a quote/invoice email to the lead with a generated
// PDF attachment (or a caller-provided one), then marks the quote as sent.
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

interface QuoteItemRow {
  description: string
  amount: number
  is_vatable?: boolean
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

// ─── PDF generation (pure JS, runs in Deno edge runtime) ─────────────────
async function generateQuotePdfBase64(p: {
  firmName: string
  documentType: string
  leadName: string
  leadEmail: string
  serviceType: string
  referenceCode?: string
  items: QuoteItemRow[]
  subtotal: number
  vatTotal: number
  grandTotal: number
}): Promise<string> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const { width } = page.getSize()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const navy = rgb(0.118, 0.227, 0.373)
  const grey = rgb(0.4, 0.4, 0.4)
  const line = rgb(0.85, 0.85, 0.85)

  let y = 800
  page.drawText(p.firmName, { x: 40, y, font: bold, size: 18, color: navy })
  y -= 28
  const heading = p.documentType === 'invoice' ? 'Invoice' : 'Conveyancing Quote Estimate'
  page.drawText(heading, { x: 40, y, font, size: 12, color: grey })
  y -= 22
  if (p.referenceCode) {
    page.drawText(`Reference: ${p.referenceCode}`, { x: 40, y, font, size: 10, color: grey })
    y -= 14
  }
  page.drawText(`Date: ${new Date().toLocaleDateString('en-GB')}`, {
    x: 40, y, font, size: 10, color: grey,
  })
  y -= 24

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

  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, color: line, thickness: 1 })
  y -= 16
  page.drawText('Description', { x: 40, y, font: bold, size: 10, color: navy })
  page.drawText('VAT', { x: 380, y, font: bold, size: 10, color: navy })
  page.drawText('Amount', { x: 480, y, font: bold, size: 10, color: navy })
  y -= 8
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, color: line, thickness: 1 })
  y -= 14

  for (const item of p.items) {
    if (y < 120) break
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

  page.drawText('Subtotal', { x: 380, y, font, size: 10, color: grey })
  page.drawText(`£${p.subtotal.toFixed(2)}`, { x: 480, y, font, size: 10 })
  y -= 14
  page.drawText('VAT', { x: 380, y, font, size: 10, color: grey })
  page.drawText(`£${p.vatTotal.toFixed(2)}`, { x: 480, y, font, size: 10 })
  y -= 16
  page.drawText('Total (inc VAT)', { x: 380, y, font: bold, size: 12, color: navy })
  page.drawText(`£${p.grandTotal.toFixed(2)}`, { x: 480, y, font: bold, size: 12, color: navy })

  page.drawText(
    p.documentType === 'invoice'
      ? 'Please remit payment within the agreed terms. Contact us with any queries.'
      : 'This is an estimate only and may be subject to change. Please contact us for a full breakdown.',
    { x: 40, y: 60, font, size: 8, color: grey },
  )

  const bytes = await pdf.save()
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
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
<p>Thank you for your ${p.serviceType.replace('_', ' & ')} enquiry. Please find your ${p.documentType === 'invoice' ? 'invoice' : 'quote estimate'} attached as a PDF.</p>
${p.referenceCode ? `<p><strong>Reference:</strong> ${p.referenceCode}</p>` : ''}
<p style="font-size:24px;font-weight:bold;color:#1e3a5f;">Total: &pound;${p.grandTotal.toFixed(2)} (inc. VAT)</p>
${p.instructionLink ? `<p>Ready to proceed? Click the button below to instruct us:</p>
<p><a href="${p.instructionLink}" style="display:inline-block;background:#1e3a5f;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Instruct Now</a></p>` : ''}
<p style="color:#666;font-size:12px;margin-top:30px;">${p.documentType === 'invoice' ? 'Please remit payment within the agreed terms.' : 'This is an estimate only and may be subject to change. Please contact us for a full breakdown.'}</p>
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

    const [quoteRes, leadRes, itemsRes] = await Promise.all([
      supabase.from('quotes').select('*').eq('id', quoteId).single(),
      supabase.from('leads').select('*').eq('id', leadId).single(),
      supabase.from('quote_items').select('*').eq('quote_id', quoteId).order('sort_order'),
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
    const items = (itemsRes.data ?? []) as QuoteItemRow[]

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

    // Generate the PDF server-side unless the caller provided one explicitly.
    let attachments: EmailAttachment[] | undefined
    if (pdfAttachment?.base64) {
      attachments = [
        {
          filename: pdfAttachment.filename || `${documentType}-${quote.reference_code || quoteId}.pdf`,
          content: pdfAttachment.base64,
        },
      ]
    } else {
      try {
        const pdfBase64 = await generateQuotePdfBase64({
          firmName: firm.name,
          documentType,
          leadName: lead.full_name,
          leadEmail: lead.email,
          serviceType: lead.service_type,
          referenceCode: quote.reference_code || undefined,
          items,
          subtotal: Number(quote.subtotal || totals.subtotal || 0),
          vatTotal: Number(quote.vat_total || totals.vatTotal || 0),
          grandTotal: Number(quote.grand_total || totals.grandTotal || 0),
        })
        attachments = [
          {
            filename: `${documentType}-${quote.reference_code || quoteId}.pdf`,
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
      attachments,
    })

    if (!result.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'EMAIL_FAILED', message: result.error || 'SMTP send failed', stage: 'send' },
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
      JSON.stringify({ ok: true, quoteId, leadId, documentType }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'INTERNAL', message: String(err) } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
