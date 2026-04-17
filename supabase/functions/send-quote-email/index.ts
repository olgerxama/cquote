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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function hasProfessionalAccessForFirm(firm: Record<string, unknown>): boolean {
  const planType = String(firm.plan_type || '').toLowerCase()
  const subscriptionStatus = String(firm.stripe_subscription_status || '').toLowerCase()
  return planType === 'professional' && ['active', 'trialing'].includes(subscriptionStatus)
}

function normalizeMoney(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function renderPdfFromHtmlBase64(html: string): Promise<string | null> {
  const apiKey = Deno.env.get('PDFSHIFT_API_KEY')
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: html,
        format: 'A4',
        margin: '0',
        use_print: true,
      }),
    })
    if (!res.ok) {
      console.error('PDFSHIFT failed:', res.status, await res.text())
      return null
    }

    const bytes = new Uint8Array(await res.arrayBuffer())
    return bytesToBase64(bytes)
  } catch (e) {
    console.error('PDFSHIFT request failed:', e)
    return null
  }
}

// ─── PDF generation (pure JS, runs in Deno edge runtime) ─────────────────
async function generateQuotePdfBase64(p: {
  firmName: string
  documentType: string
  leadName: string
  leadEmail: string
  serviceType: string
  propertyValue?: number
  referenceCode?: string
  items: QuoteItemRow[]
  subtotal: number
  vatTotal: number
  grandTotal: number
}): Promise<string> {
  const formatCurrency = (value: number): string => {
    const fixed = normalizeMoney(value).toFixed(2)
    const [whole, decimals] = fixed.split('.')
    return `£${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimals}`
  }
  const serviceLabel = p.serviceType
    .replace(/_/g, ' & ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const heading = p.documentType === 'invoice' ? 'INVOICE' : 'QUOTE ESTIMATE'
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const { width, height } = page.getSize()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const navy = rgb(0.118, 0.227, 0.373)
  const dark = rgb(0.1, 0.1, 0.1)
  const muted = rgb(0.52, 0.52, 0.52)
  const border = rgb(0.88, 0.88, 0.88)
  const rowBg = rgb(0.96, 0.96, 0.96)
  const panelX = 34
  const panelW = width - (panelX * 2)
  const left = panelX + 14
  const right = panelX + panelW - 10

  page.drawRectangle({ x: panelX, y: 34, width: panelW, height: height - 68, color: rgb(1, 1, 1) })

  const headerY = 730
  page.drawRectangle({ x: panelX, y: headerY, width: panelW, height: 90, color: navy })
  page.drawText(p.firmName, { x: left, y: headerY + 54, font: bold, size: 20, color: rgb(1, 1, 1) })
  if (p.referenceCode) {
    const refText = `Ref: ${p.referenceCode}`
    page.drawText(refText, {
      x: left,
      y: headerY + 22,
      font,
      size: 11,
      color: rgb(0.78, 0.84, 0.92),
    })
  }
  page.drawText(heading, {
    x: right - bold.widthOfTextAtSize(heading, 11),
    y: headerY + 62,
    font: bold,
    size: 11,
    color: rgb(0.72, 0.78, 0.86),
  })
  page.drawText(dateStr, {
    x: right - font.widthOfTextAtSize(dateStr, 13),
    y: headerY + 30,
    font,
    size: 13,
    color: rgb(0.83, 0.87, 0.93),
  })

  let y = headerY - 14
  page.drawLine({ start: { x: panelX, y }, end: { x: panelX + panelW, y }, color: border, thickness: 1 })
  y -= 18
  const rightInfoX = right - 8
  page.drawText('PREPARED FOR', { x: left, y, font: bold, size: 9, color: muted })
  page.drawText('SERVICE', { x: rightInfoX - bold.widthOfTextAtSize('SERVICE', 9), y, font: bold, size: 9, color: muted })
  y -= 16
  page.drawText(p.leadName, { x: left, y, font, size: 14, color: dark })
  page.drawText(serviceLabel, { x: rightInfoX - font.widthOfTextAtSize(serviceLabel, 14), y, font, size: 14, color: dark })
  y -= 16
  page.drawText(p.leadEmail, { x: left, y, font, size: 10, color: rgb(0.09, 0.35, 0.82) })
  if (p.propertyValue != null) {
    const prop = `Property value: ${formatCurrency(p.propertyValue)}`
    page.drawText(prop, {
      x: rightInfoX - font.widthOfTextAtSize(prop, 10),
      y,
      font,
      size: 10,
      color: muted,
    })
  }
  y -= 24

  page.drawLine({ start: { x: panelX, y }, end: { x: panelX + panelW, y }, color: border, thickness: 1 })
  y -= 20
  page.drawText('DESCRIPTION', { x: left, y, font: bold, size: 10, color: dark })
  const amountRightX = rightInfoX
  const amountHeader = 'AMOUNT'
  page.drawText(amountHeader, { x: amountRightX - bold.widthOfTextAtSize(amountHeader, 10), y, font: bold, size: 10, color: dark })
  y -= 10
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: navy, thickness: 1 })
  y -= 16

  let row = 0
  for (const item of p.items) {
    if (y < 120) break
    const desc = String(item.description || 'Item').slice(0, 68)
    const amt = Number(item.amount || 0)
    const isDiscount = amt < 0
    const amountText = `${isDiscount ? '−' : ''}${formatCurrency(Math.abs(amt))}`
    if (row % 2 === 0) {
      page.drawRectangle({ x: left, y: y - 8, width: right - left, height: 22, color: rowBg })
    }
    page.drawText(desc, { x: left + 6, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) })
    page.drawText(amountText, {
      x: amountRightX - font.widthOfTextAtSize(amountText, 10),
      y,
      font,
      size: 10,
      color: isDiscount ? rgb(0.08, 0.5, 0.27) : rgb(0.25, 0.25, 0.25),
    })
    y -= 18
    row++
  }

  y -= 8
  const totalsValueRight = amountRightX
  const totalsValueLeft = right - 130
  const totalsLabelRight = totalsValueLeft - 20
  const drawTotalRow = (label: string, value: string, useBold = false) => {
    const textFont = useBold ? bold : font
    const textSize = useBold ? 12.5 : 9.5
    const labelWidth = textFont.widthOfTextAtSize(label, textSize)
    const valueWidth = textFont.widthOfTextAtSize(value, textSize)
    page.drawText(label, {
      x: totalsLabelRight - labelWidth,
      y,
      font: textFont,
      size: textSize,
      color: useBold ? navy : muted,
    })
    page.drawText(value, {
      x: totalsValueRight - valueWidth,
      y,
      font: textFont,
      size: textSize,
      color: useBold ? navy : rgb(0.25, 0.25, 0.25),
    })
    y -= useBold ? 24 : 18
  }

  drawTotalRow('Subtotal', formatCurrency(p.subtotal))
  drawTotalRow('VAT (20%)', formatCurrency(p.vatTotal))
  page.drawLine({ start: { x: totalsValueLeft, y: y + 8 }, end: { x: totalsValueRight, y: y + 8 }, color: navy, thickness: 1.5 })
  y -= 10
  drawTotalRow('Total (inc. VAT)', formatCurrency(p.grandTotal), true)

  const footerY = 48
  page.drawLine({ start: { x: panelX, y: footerY + 18 }, end: { x: panelX + panelW, y: footerY + 18 }, color: border, thickness: 1 })
  page.drawText(
    p.documentType === 'invoice'
      ? 'Please remit payment within agreed terms. Contact us if you have any questions.'
      : 'This is an estimate only and may be subject to change. Please contact us for a full breakdown.',
    { x: left, y: footerY, font, size: 8.5, color: rgb(0.38, 0.46, 0.56) },
  )

  const bytes = await pdf.save()
  return bytesToBase64(bytes)
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
<p style="font-size:24px;font-weight:bold;color:#1e3a5f;">Total: &pound;${normalizeMoney(p.grandTotal).toFixed(2)} (inc. VAT)</p>
${p.instructionLink ? `<p>Ready to proceed? Click the button below to instruct us:</p>
<p><a href="${p.instructionLink}" style="display:inline-block;background:#1e3a5f;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Instruct Now</a></p>` : ''}
<p style="color:#666;font-size:12px;margin-top:30px;">${p.documentType === 'invoice' ? 'Please remit payment within the agreed terms.' : 'This is an estimate only and may be subject to change. Please contact us for a full breakdown.'}</p>
</body></html>`
}

function quoteAttachmentHtml(p: {
  firmName: string
  leadName: string
  leadEmail: string
  serviceType: string
  propertyValue?: number
  propertyAddress?: string
  referenceCode?: string
  items: QuoteItemRow[]
  subtotal: number
  vatTotal: number
  grandTotal: number
  documentType: string
}): string {
  const svcLabel = p.serviceType.replace(/_/g, ' & ').replace(/\b\w/g, (c) => c.toUpperCase())
  const fmt = (n: number) => {
    const s = normalizeMoney(n).toFixed(2)
    return '£' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  let rows = ''
  for (let i = 0; i < p.items.length; i++) {
    const it = p.items[i]
    const bg = i % 2 === 0 ? '#f9fafb' : '#fff'
    rows += '<tr bgcolor="' + bg + '">'
    rows += '<td style="padding:10px 6px;font-size:13px;color:#333">' + it.description + '</td>'
    rows += '<td align="right" width="120" style="padding:10px 6px;font-size:13px;color:#333">' + fmt(it.amount) + '</td>'
    rows += '</tr>'
  }

  let h = ''
  h += '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>'
  h += '<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#333"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px">'
  h += '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">'
  h += '<tr><td bgcolor="#1e3a5f" style="padding:16px 24px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top">'
  h += '<div style="color:#fff;font-size:18px;font-weight:700">' + p.firmName + '</div>'
  if (p.referenceCode) h += '<div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:2px;font-family:monospace">' + p.referenceCode + '</div>'
  h += '</td><td valign="top" align="right">'
  h += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;color:rgba(255,255,255,0.5)">' + (p.documentType === 'invoice' ? 'Invoice' : 'Quote Estimate') + '</div>'
  h += '<div style="font-size:13px;margin-top:2px;color:rgba(255,255,255,0.7)">' + dateStr + '</div>'
  h += '</td></tr></table></td></tr>'
  h += '<tr><td style="padding:20px 28px;border-bottom:1px solid #e5e5e5"><table width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top">'
  h += '<div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#888;margin-bottom:4px">Prepared For</div><div style="font-size:14px;font-weight:500;color:#111">' + p.leadName + '</div><div style="font-size:12px;color:#888">' + p.leadEmail + '</div>'
  h += '</td><td valign="top" align="right" style="text-align:right"><div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#888;margin-bottom:4px">Service</div><div style="font-size:14px;font-weight:500;color:#111">' + svcLabel + '</div>'
  if (p.propertyAddress) h += '<div style="font-size:12px;color:#888">' + p.propertyAddress + '</div>'
  if (p.propertyValue) h += '<div style="font-size:12px;color:#888">Property value: ' + fmt(p.propertyValue) + '</div>'
  h += '</td></tr></table></td></tr>'
  h += '<tr><td style="padding:20px 28px 0"><table width="100%" cellpadding="0" cellspacing="0"><tr style="border-bottom:2px solid #1e3a5f"><th align="left" style="padding:8px 6px;font-size:11px;font-weight:700;text-transform:uppercase;color:#888">Description</th><th align="right" width="120" style="padding:8px 6px;font-size:11px;font-weight:700;text-transform:uppercase;color:#888">Amount</th></tr>' + rows + '</table></td></tr>'
  h += '<tr><td style="padding:8px 28px 20px"><table width="100%" cellpadding="0" cellspacing="0">'
  h += '<tr><td align="right" style="padding:6px 6px;font-size:13px;color:#888">Subtotal</td><td align="right" width="120" style="padding:6px 6px;font-size:13px;color:#333">' + fmt(p.subtotal) + '</td></tr>'
  h += '<tr><td align="right" style="padding:6px 6px;font-size:13px;color:#888">VAT (20%)</td><td align="right" width="120" style="padding:6px 6px;font-size:13px;color:#333">' + fmt(p.vatTotal) + '</td></tr>'
  h += '<tr><td></td><td width="120" style="padding:0 6px 10px"><div style="height:2px;background:#1e3a5f"></div></td></tr>'
  h += '<tr><td align="right" style="padding:16px 6px 10px;font-size:16px;font-weight:700;color:#1e3a5f">Total (inc. VAT)</td><td align="right" width="120" style="padding:16px 6px 10px;font-size:18px;font-weight:700;color:#1e3a5f">' + fmt(p.grandTotal) + '</td></tr>'
  h += '</table></td></tr></table></td></tr></table></body></html>'
  return h
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

    const { data: actorLink } = await supabase
      .from('firm_users')
      .select('role')
      .eq('firm_id', quote.firm_id)
      .eq('user_id', user.id)
      .maybeSingle()

    const canManage = actorLink?.role === 'admin' || firm.owner_user_id === user.id
    if (!canManage) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'FORBIDDEN', message: 'Read-only users cannot send quote emails.' } }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const fromEmail = getFromEmail()
    const baseUrl = getBaseUrl()
    const instructionRef = quote.reference_code || leadId
    const publicFormConfig = (firm.public_form_config ?? {}) as Record<string, unknown>
    const canShowInstructLink = hasProfessionalAccessForFirm(firm as Record<string, unknown>) && Boolean(publicFormConfig.show_instruct_button)
    const instructionLink = canShowInstructLink ? `${baseUrl}/quote/${firm.slug}/instruct?ref=${instructionRef}` : undefined

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
        const attachmentHtml = quoteAttachmentHtml({
          firmName: firm.name,
          documentType,
          leadName: lead.full_name,
          leadEmail: lead.email,
          serviceType: lead.service_type,
          propertyValue: lead.property_value ? Number(lead.property_value) : undefined,
          propertyAddress: String(lead.property_postcode || ''),
          referenceCode: quote.reference_code || undefined,
          items,
          subtotal: Number(quote.subtotal || totals.subtotal || 0),
          vatTotal: Number(quote.vat_total || totals.vatTotal || 0),
          grandTotal: Number(quote.grand_total || totals.grandTotal || 0),
        })
        const pdfBase64 = (await renderPdfFromHtmlBase64(attachmentHtml)) || await generateQuotePdfBase64({
          firmName: firm.name,
          documentType,
          leadName: lead.full_name,
          leadEmail: lead.email,
          serviceType: lead.service_type,
          propertyValue: lead.property_value ? Number(lead.property_value) : undefined,
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
