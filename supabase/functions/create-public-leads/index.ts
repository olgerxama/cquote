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
  const page = pdf.addPage([595, 842])
  const { width } = page.getSize()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const navy = rgb(0.118, 0.227, 0.373)
  const black = rgb(0.1, 0.1, 0.1)
  const grey = rgb(0.45, 0.45, 0.45)
  const lightGrey = rgb(0.92, 0.92, 0.92)
  const white = rgb(1, 1, 1)
  const lm = 50 // left margin
  const rm = width - 50 // right margin
  const col2 = rm - 80 // amount column x
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  // ── Header band ──
  page.drawRectangle({ x: 0, y: 780, width, height: 62, color: navy })
  page.drawText(p.firmName, { x: lm, y: 802, font: bold, size: 20, color: white })
  page.drawText('QUOTE ESTIMATE', { x: rm - bold.widthOfTextAtSize('QUOTE ESTIMATE', 11), y: 805, font: bold, size: 11, color: rgb(0.7, 0.8, 0.9) })
  if (p.referenceCode) {
    page.drawText(p.referenceCode, { x: rm - font.widthOfTextAtSize(p.referenceCode, 9), y: 791, font, size: 9, color: rgb(0.7, 0.8, 0.9) })
  }

  let y = 755

  // ── Two-column info block ──
  page.drawText('PREPARED FOR', { x: lm, y, font: bold, size: 8, color: grey })
  page.drawText('DETAILS', { x: 320, y, font: bold, size: 8, color: grey })
  y -= 16
  page.drawText(p.leadName, { x: lm, y, font: bold, size: 11, color: black })
  page.drawText(`Date: ${dateStr}`, { x: 320, y, font, size: 10, color: black })
  y -= 14
  page.drawText(p.leadEmail, { x: lm, y, font, size: 10, color: grey })
  const svcLabel = p.serviceType.replace(/_/g, ' & ').replace(/\b\w/g, c => c.toUpperCase())
  page.drawText(`Service: ${svcLabel}`, { x: 320, y, font, size: 10, color: black })
  y -= 30

  // ── Table header ──
  page.drawRectangle({ x: lm, y: y - 2, width: rm - lm, height: 20, color: navy })
  page.drawText('Description', { x: lm + 10, y: y + 2, font: bold, size: 9, color: white })
  page.drawText('VAT', { x: col2 - 50, y: y + 2, font: bold, size: 9, color: white })
  page.drawText('Amount', { x: col2, y: y + 2, font: bold, size: 9, color: white })
  y -= 22

  // ── Line items ──
  let rowIndex = 0
  for (const item of p.items) {
    if (y < 140) break
    const desc = String(item.description || 'Item').slice(0, 55)
    const amt = Number(item.amount || 0)
    if (rowIndex % 2 === 0) {
      page.drawRectangle({ x: lm, y: y - 4, width: rm - lm, height: 18, color: rgb(0.97, 0.97, 0.97) })
    }
    page.drawText(desc, { x: lm + 10, y, font, size: 9, color: black })
    page.drawText(item.is_vatable === false ? 'No' : 'Yes', { x: col2 - 50, y, font, size: 9, color: grey })
    const amtStr = `£${amt.toFixed(2)}`
    page.drawText(amtStr, { x: col2 + (80 - font.widthOfTextAtSize(amtStr, 9)), y, font, size: 9, color: black })
    y -= 18
    rowIndex++
  }

  y -= 6
  page.drawLine({ start: { x: lm, y }, end: { x: rm, y }, color: lightGrey, thickness: 1 })
  y -= 18

  // ── Totals ──
  const drawTotalRow = (label: string, value: string, isBold = false, size = 10) => {
    const f = isBold ? bold : font
    const c = isBold ? navy : grey
    page.drawText(label, { x: col2 - 100, y, font: f, size, color: c })
    const valW = f.widthOfTextAtSize(value, size)
    page.drawText(value, { x: rm - 10 - valW, y, font: f, size, color: isBold ? navy : black })
    y -= (isBold ? 20 : 16)
  }

  drawTotalRow('Subtotal', `£${p.subtotal.toFixed(2)}`)
  drawTotalRow('VAT (20%)', `£${p.vatTotal.toFixed(2)}`)
  page.drawLine({ start: { x: col2 - 100, y: y + 6 }, end: { x: rm - 10, y: y + 6 }, color: navy, thickness: 1.5 })
  y -= 4
  drawTotalRow('TOTAL (inc. VAT)', `£${p.grandTotal.toFixed(2)}`, true, 13)

  // ── Footer ──
  const footerY = 50
  page.drawLine({ start: { x: lm, y: footerY + 16 }, end: { x: rm, y: footerY + 16 }, color: lightGrey, thickness: 0.5 })
  page.drawText(
    'This is an estimate only and may be subject to change. Please contact us for a full breakdown.',
    { x: lm, y: footerY, font, size: 7.5, color: grey },
  )
  page.drawText(
    `Generated by ConveyQuote on ${dateStr}`,
    { x: lm, y: footerY - 12, font, size: 7, color: rgb(0.7, 0.7, 0.7) },
  )

  const bytes = await pdf.save()
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
  leadEmail: string
  serviceType: string
  propertyValue?: number
  referenceCode?: string
  items?: { description: string; amount: number; is_vatable?: boolean }[]
  subtotal?: number
  vatTotal?: number
  grandTotal?: number
  instructionLink?: string
  hasPdf: boolean
}): string {
  const svcLabel = p.serviceType.replace(/_/g, ' &amp; ')
  const fmtGBP = (n: number) => '&pound;' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  // Build line items rows (matching desktop invoice design)
  let itemsHtml = ''
  if (p.items && p.items.length > 0) {
    const rows = p.items.map((item, i) => {
      const bg = i % 2 === 0 ? '#f9fafb' : '#ffffff'
      return `<tr style="background:${bg};">
        <td style="padding:10px 16px;font-size:13px;color:#333;border-bottom:1px solid #f0f0f0;">${item.description}</td>
        <td style="padding:10px 16px;font-size:13px;color:#333;text-align:right;border-bottom:1px solid #f0f0f0;font-variant-numeric:tabular-nums;">${fmtGBP(item.amount)}</td>
      </tr>`
    }).join('')

    itemsHtml = `
    <table style="width:100%;border-collapse:collapse;margin-top:0;">
      <thead>
        <tr style="border-bottom:2px solid #1e3a5f;">
          <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Description</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
  }

  // Totals section
  let totalsHtml = ''
  if (p.grandTotal != null) {
    totalsHtml = `
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <tbody>
        ${p.subtotal != null ? `<tr>
          <td style="padding:6px 16px;text-align:right;font-size:13px;color:#6b7280;">Subtotal</td>
          <td style="padding:6px 16px;text-align:right;font-size:13px;color:#333;width:120px;font-variant-numeric:tabular-nums;">${fmtGBP(p.subtotal)}</td>
        </tr>` : ''}
        ${p.vatTotal != null ? `<tr>
          <td style="padding:6px 16px;text-align:right;font-size:13px;color:#6b7280;">VAT (20%)</td>
          <td style="padding:6px 16px;text-align:right;font-size:13px;color:#333;width:120px;font-variant-numeric:tabular-nums;">${fmtGBP(p.vatTotal)}</td>
        </tr>` : ''}
        <tr style="border-top:2px solid #1e3a5f;">
          <td style="padding:10px 16px;text-align:right;font-size:16px;font-weight:700;color:#1e3a5f;">Total (inc. VAT)</td>
          <td style="padding:10px 16px;text-align:right;font-size:18px;font-weight:700;color:#1e3a5f;width:120px;font-variant-numeric:tabular-nums;">${fmtGBP(p.grandTotal)}</td>
        </tr>
      </tbody>
    </table>`
  }

  const pdfNote = p.hasPdf
    ? `<div style="background:#f0f4f8;border-radius:8px;padding:14px 18px;margin:20px 16px;font-size:13px;color:#555;">
        <strong style="color:#1e3a5f;">PDF Attached</strong> — Your detailed quote estimate is attached to this email.
       </div>`
    : ''
  const cta = p.instructionLink
    ? `<div style="text-align:center;margin:28px 0;">
        <a href="${p.instructionLink}" style="display:inline-block;background:#1e3a5f;color:#ffffff;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Instruct Us to Proceed</a>
       </div>`
    : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;background:#f5f5f5;color:#333;">

<!-- Invoice card -->
<div style="background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;overflow:hidden;">

  <!-- Header band (matches desktop) -->
  <div style="background:#1e3a5f;padding:24px 32px;">
    <table style="width:100%;"><tr>
      <td style="vertical-align:top;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${p.firmName}</h1>
        ${p.referenceCode ? `<p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:14px;font-family:monospace;">${p.referenceCode}</p>` : ''}
      </td>
      <td style="vertical-align:top;text-align:right;">
        <span style="font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:rgba(255,255,255,0.5);">Quote Estimate</span>
        <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.7);">${dateStr}</p>
      </td>
    </tr></table>
  </div>

  <!-- Info grid (matches desktop) -->
  <div style="padding:20px 32px;border-bottom:1px solid #e5e5e5;">
    <table style="width:100%;"><tr>
      <td style="vertical-align:top;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Prepared For</p>
        <p style="margin:0;font-size:14px;font-weight:500;color:#111;">${p.leadName}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${p.leadEmail}</p>
      </td>
      <td style="vertical-align:top;text-align:right;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Service</p>
        <p style="margin:0;font-size:14px;font-weight:500;color:#111;">${svcLabel}</p>
        ${p.propertyValue ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">Property value: ${fmtGBP(p.propertyValue)}</p>` : ''}
      </td>
    </tr></table>
  </div>

  <!-- Line items table -->
  <div style="padding:16px 16px 0 16px;">
    ${itemsHtml}
  </div>

  <!-- Totals -->
  <div style="padding:0 16px 20px 16px;">
    ${totalsHtml}
  </div>

  ${pdfNote}
  ${cta}

  <!-- Footer disclaimer -->
  <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e5e5;">
    <p style="margin:0;font-size:11px;color:#999;font-style:italic;">This is an estimate only and may be subject to change. Please contact us for a full breakdown.</p>
  </div>

</div>

<p style="text-align:center;font-size:11px;color:#999;margin-top:16px;">Powered by ConveyQuote</p>
</body></html>`
}

function notificationEmailHtml(p: {
  firmName: string
  leadName: string
  leadEmail: string
  serviceType: string
  propertyValue: number
  status: string
  referenceCode?: string
}): string {
  const svcLabel = p.serviceType.replace(/_/g, ' & ')
  const statusColor = p.status === 'review' ? '#d97706' : '#059669'
  const statusLabel = p.status === 'review' ? 'Manual Review' : 'New Lead'
  const fmtGBP = (n: number) => '&pound;' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:0;background:#f5f5f5;color:#333;">
<div style="background:#1e3a5f;padding:24px 32px;">
  <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">New Enquiry Received</h1>
  <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">${p.firmName}</p>
</div>
<div style="background:#ffffff;padding:28px 32px;border:1px solid #e5e5e5;border-top:none;">
  <div style="display:inline-block;background:${statusColor};color:white;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:20px;">${statusLabel}</div>
  <table style="width:100%;border-collapse:collapse;">
    ${p.referenceCode ? `<tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;width:120px;">Reference</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-weight:600;font-family:monospace;color:#1e3a5f;">${p.referenceCode}</td></tr>` : ''}
    <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;width:120px;">Name</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-weight:600;">${p.leadName}</td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;">Email</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;"><a href="mailto:${p.leadEmail}" style="color:#1e3a5f;">${p.leadEmail}</a></td></tr>
    <tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;">Service</td><td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${svcLabel}</td></tr>
    <tr><td style="padding:10px 0;color:#888;font-size:13px;">Property Value</td><td style="padding:10px 0;font-weight:600;">${fmtGBP(Number(p.propertyValue))}</td></tr>
  </table>
</div>
<div style="padding:20px 32px;text-align:center;">
  <p style="margin:0;font-size:12px;color:#999;">Log in to your ConveyQuote dashboard to manage this lead.</p>
</div>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { lead, discountCodeId, totals, quoteItems, notifyLeadId, firmId } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Email-only mode: called by pg_net after the RPC function creates
    //    the lead. Skip all DB writes — just look up and send emails. ──
    if (notifyLeadId) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', notifyLeadId)
        .single()
      if (!existingLead) {
        return new Response(JSON.stringify({ error: 'Lead not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const fId = firmId || existingLead.firm_id
      const { data: notifyFirm } = await supabase
        .from('firms')
        .select('*')
        .eq('id', fId)
        .single()
      if (!notifyFirm) {
        return new Response(JSON.stringify({ error: 'Firm not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Load quote + items if they exist
      const { data: existingQuote } = await supabase
        .from('quotes')
        .select('*')
        .eq('lead_id', notifyLeadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let existingItems: Record<string, unknown>[] = []
      if (existingQuote) {
        const { data: items } = await supabase
          .from('quote_items')
          .select('*')
          .eq('quote_id', existingQuote.id)
          .order('sort_order')
        existingItems = items || []
      }

      const notifyTotals = existingQuote
        ? { subtotal: existingQuote.subtotal, vatTotal: existingQuote.vat_total, grandTotal: existingQuote.grand_total }
        : null
      const notifyRef = existingQuote?.reference_code || notifyLeadId

      const fromEmail = getFromEmail()
      const emailTasks: Array<{ task: string; ok: boolean; error?: string }> = []

      // Firm notification
      try {
        const firmEmail = notifyFirm.reply_to_email || fromEmail
        const result = await sendEmail({
          to: firmEmail,
          from: fromEmail,
          fromName: 'ConveyQuote',
          subject: `New Enquiry: ${existingLead.full_name} - ${existingLead.service_type}`,
          html: notificationEmailHtml({
            firmName: notifyFirm.name,
            leadName: existingLead.full_name,
            leadEmail: existingLead.email,
            serviceType: existingLead.service_type,
            propertyValue: existingLead.property_value,
            status: existingLead.status || 'new',
            referenceCode: existingQuote?.reference_code || undefined,
          }),
        })
        emailTasks.push({ task: 'firm_notification', ...result })
      } catch (err) {
        emailTasks.push({ task: 'firm_notification', ok: false, error: String(err) })
      }

      // Customer thank-you with PDF
      try {
        const baseUrl = getBaseUrl()
        const instructionLink =
          existingLead.status !== 'review' && notifyTotals
            ? `${baseUrl}/quote/${notifyFirm.slug}/instruct?ref=${notifyRef}`
            : undefined

        let attachments: EmailAttachment[] | undefined
        if (notifyTotals && existingItems.length > 0) {
          try {
            const pdfBase64 = await generateQuotePdfBase64({
              firmName: notifyFirm.name,
              leadName: existingLead.full_name,
              leadEmail: existingLead.email,
              serviceType: existingLead.service_type,
              referenceCode: existingQuote?.reference_code || undefined,
              items: existingItems as { description: string; amount: number; is_vatable?: boolean }[],
              subtotal: Number(notifyTotals.subtotal || 0),
              vatTotal: Number(notifyTotals.vatTotal || 0),
              grandTotal: Number(notifyTotals.grandTotal || 0),
            })
            attachments = [{ filename: `quote-${notifyRef}.pdf`, content: pdfBase64 }]
          } catch (pdfErr) {
            console.error('PDF generation failed:', pdfErr)
          }
        }

        const result = await sendEmail({
          to: existingLead.email,
          from: notifyFirm.reply_to_email || fromEmail,
          fromName: notifyFirm.sender_display_name || notifyFirm.name,
          subject: `Thank you — your quote from ${notifyFirm.name}`,
          html: customerThankYouHtml({
            firmName: notifyFirm.name,
            leadName: existingLead.full_name,
            leadEmail: existingLead.email,
            serviceType: existingLead.service_type,
            propertyValue: Number(existingLead.property_value || 0),
            referenceCode: existingQuote?.reference_code || undefined,
            items: existingItems.length > 0
              ? (existingItems as { description: string; amount: number; is_vatable?: boolean }[])
              : undefined,
            subtotal: notifyTotals ? Number(notifyTotals.subtotal || 0) : undefined,
            vatTotal: notifyTotals ? Number(notifyTotals.vatTotal || 0) : undefined,
            grandTotal: notifyTotals?.grandTotal != null ? Number(notifyTotals.grandTotal) : undefined,
            instructionLink,
            hasPdf: !!attachments,
          }),
          attachments,
        })
        emailTasks.push({ task: 'customer_thank_you', ...result })

        if (existingQuote && result.ok) {
          await supabase
            .from('quotes')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', existingQuote.id)
        }
      } catch (err) {
        emailTasks.push({ task: 'customer_thank_you', ok: false, error: String(err) })
      }

      return new Response(
        JSON.stringify({ ok: true, mode: 'notify', leadId: notifyLeadId, emailTasks }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Full mode: create lead + quote + send emails (legacy/direct call) ──
    if (!lead?.firm_id || !lead?.email || !lead?.full_name) {
      return new Response(JSON.stringify({ error: 'Missing required lead fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
          referenceCode: referenceCode || undefined,
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
        from: firm.reply_to_email || fromEmail,
        fromName: firm.sender_display_name || firm.name,
        subject: `Thank you — your quote from ${firm.name}`,
        html: customerThankYouHtml({
          firmName: firm.name,
          leadName: lead.full_name,
          leadEmail: lead.email,
          serviceType: lead.service_type,
          propertyValue: lead.property_value ? Number(lead.property_value) : undefined,
          referenceCode: referenceCode || undefined,
          items: quoteItems?.length ? quoteItems : undefined,
          subtotal: totals?.subtotal != null ? Number(totals.subtotal) : undefined,
          vatTotal: totals?.vatTotal != null ? Number(totals.vatTotal) : undefined,
          grandTotal: totals?.grandTotal != null ? Number(totals.grandTotal) : undefined,
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
