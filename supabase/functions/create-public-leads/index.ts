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

// ─── PDF generation ──────────────────────────────────────────────────────
async function generateQuotePdfBase64(p: {
  firmName: string
  leadName: string
  leadEmail: string
  serviceType: string
  propertyValue?: number
  referenceCode?: string
  items: QuoteItemInput[]
  subtotal: number
  vatTotal: number
  grandTotal: number
}): Promise<string> {
  const formatCurrency = (value: number): string => {
    const fixed = Number(value || 0).toFixed(2)
    const [whole, decimals] = fixed.split('.')
    return `£${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimals}`
  }
  const serviceLabel = p.serviceType
    .replace(/_/g, ' & ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const heading = 'QUOTE ESTIMATE'

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
    const refText = p.referenceCode
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
  if (p.leadEmail) {
    page.drawText(p.leadEmail, { x: left, y, font, size: 10, color: rgb(0.09, 0.35, 0.82) })
  }
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
    if (y < 140) break
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
    'This is an estimate only and may be subject to change. Please contact us for a full breakdown.',
    { x: left, y: footerY, font, size: 8.5, color: rgb(0.38, 0.46, 0.56) },
  )

  const bytes = await pdf.save()
  return bytesToBase64(bytes)
}

// ─── Email templates ─────────────────────────────────────────────────────
function customerThankYouHtml(p: {
  firmName: string
  leadName: string
  leadEmail: string
  serviceType: string
  propertyValue?: number
  propertyAddress?: string
  referenceCode?: string
  items?: { description: string; amount: number; is_vatable?: boolean }[]
  subtotal?: number
  vatTotal?: number
  grandTotal?: number
  instructionLink?: string
  hasPdf: boolean
  includeIntro?: boolean
  compactHeader?: boolean
}): string {
  const svcLabel = p.serviceType
    .replace(/_/g, ' & ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const fmt = (n: number) => {
    const s = Number(n).toFixed(2)
    return '£' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
  const d = new Date()
  const dateStr = d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const headerPadding = p.compactHeader ? '16px 24px' : '24px 28px'
  const firmTitleSize = p.compactHeader ? '18px' : '20px'
  const refSize = p.compactHeader ? '13px' : '14px'
  const rightDateMargin = p.compactHeader ? '2px' : '4px'

  // Line item rows — keep styles SHORT to avoid QP encoding bugs
  let rows = ''
  if (p.items && p.items.length > 0) {
    for (let i = 0; i < p.items.length; i++) {
      const it = p.items[i]
      const bg = i % 2 === 0 ? '#f9fafb' : '#fff'
      rows += '<tr bgcolor="' + bg + '">'
      rows += '<td style="padding:10px 6px;'
      rows += 'font-size:13px;color:#333">'
      rows += it.description + '</td>'
      rows += '<td align="right" width="120" style="padding:10px 6px;'
      rows += 'font-size:13px;color:#333">'
      rows += fmt(it.amount) + '</td>'
      rows += '</tr>\n'
    }
  }

  // Build full HTML using concatenation (short lines)
  let h = ''
  h += '<!DOCTYPE html><html><head>'
  h += '<meta charset="utf-8">'
  h += '<meta name="viewport" content="width=device-width">'
  h += '</head><body style="margin:0;padding:0;'
  h += 'background:#f5f5f5;'
  h += 'font-family:Arial,sans-serif;color:#333">\n'

  // Wrapper
  h += '<table width="100%" cellpadding="0" cellspacing="0">'
  h += '<tr><td align="center" style="padding:20px">\n'
  h += '<table width="600" cellpadding="0" cellspacing="0" '
  h += 'style="background:#fff;border:1px solid #e5e5e5;'
  h += 'border-radius:8px;overflow:hidden">\n'

  // — Header band —
  h += '<tr><td bgcolor="#1e3a5f" style="padding:' + headerPadding + '">\n'
  h += '<table width="100%" cellpadding="0" cellspacing="0"><tr>\n'
  h += '<td valign="top">'
  h += '<div style="color:#fff;font-size:' + firmTitleSize + ';'
  h += 'font-weight:700">' + p.firmName + '</div>\n'
  if (p.referenceCode) {
    h += '<div style="color:rgba(255,255,255,0.7);'
    h += 'font-size:' + refSize + ';margin-top:2px;'
    h += 'font-family:monospace">'
    h += p.referenceCode + '</div>\n'
  }
  h += '</td>\n'
  h += '<td valign="top" align="right">'
  h += '<div style="font-size:11px;font-weight:600;'
  h += 'text-transform:uppercase;'
  h += 'color:rgba(255,255,255,0.5)">Quote Estimate</div>\n'
  h += '<div style="font-size:13px;margin-top:' + rightDateMargin + ';'
  h += 'color:rgba(255,255,255,0.7)">' + dateStr + '</div>\n'
  h += '</td></tr></table>\n'
  h += '</td></tr>\n'

  if (p.includeIntro !== false) {
    // — Thank you text —
    h += '<tr><td style="padding:24px 28px;'
    h += 'border-bottom:1px solid #e5e5e5">\n'
    h += '<p style="margin:0 0 8px;font-size:15px;'
    h += 'font-weight:600;color:#111">Dear ' + p.leadName + ',</p>\n'
    h += '<p style="margin:0;font-size:14px;'
    h += 'line-height:1.6;color:#555">'
    h += 'Thank you for your ' + svcLabel.toLowerCase()
    h += ' enquiry. We have received your details and '
    h += 'a member of our team will be in touch shortly.</p>\n'
    h += '</td></tr>\n'
  }

  // — Info grid —
  h += '<tr><td style="padding:20px 28px;'
  h += 'border-bottom:1px solid #e5e5e5">\n'
  h += '<table width="100%" cellpadding="0" cellspacing="0"><tr>\n'
  h += '<td valign="top">'
  h += '<div style="font-size:11px;font-weight:600;'
  h += 'text-transform:uppercase;color:#888;'
  h += 'margin-bottom:4px">Prepared For</div>\n'
  h += '<div style="font-size:14px;font-weight:500;'
  h += 'color:#111">' + p.leadName + '</div>\n'
  h += '<div style="font-size:12px;color:#888">'
  h += p.leadEmail + '</div>\n'
  h += '</td>\n'
  h += '<td valign="top" align="right" style="text-align:right">'
  h += '<div style="font-size:11px;font-weight:600;'
  h += 'text-transform:uppercase;color:#888;'
  h += 'margin-bottom:4px">Service</div>\n'
  h += '<div style="font-size:14px;font-weight:500;'
  h += 'color:#111">' + svcLabel + '</div>\n'
  if (p.propertyAddress) {
    h += '<div style="font-size:12px;color:#888">'
    h += p.propertyAddress + '</div>\n'
  }
  if (p.propertyValue) {
    h += '<div style="font-size:12px;color:#888">'
    h += 'Property value: ' + fmt(p.propertyValue) + '</div>\n'
  }
  h += '</td></tr></table>\n'
  h += '</td></tr>\n'

  // — Line items —
  if (rows) {
    h += '<tr><td style="padding:20px 28px 0">\n'
    h += '<table width="100%" cellpadding="0" cellspacing="0">\n'
    h += '<tr style="border-bottom:2px solid #1e3a5f">'
    h += '<th align="left" style="padding:8px 6px;'
    h += 'font-size:11px;font-weight:700;'
    h += 'text-transform:uppercase;color:#888">'
    h += 'Description</th>\n'
    h += '<th align="right" width="120" style="padding:8px 6px;'
    h += 'font-size:11px;font-weight:700;'
    h += 'text-transform:uppercase;color:#888">'
    h += 'Amount</th>\n'
    h += '</tr>\n'
    h += rows
    h += '</table>\n'
    h += '</td></tr>\n'
  }

  // — Totals —
  if (p.grandTotal != null) {
    h += '<tr><td style="padding:8px 28px 20px">\n'
    h += '<table width="100%" cellpadding="0" cellspacing="0">\n'
    if (p.subtotal != null) {
      h += '<tr><td align="right" style="padding:6px 6px;'
      h += 'font-size:13px;color:#888">Subtotal</td>\n'
      h += '<td align="right" width="120" style="padding:6px 6px;'
      h += 'font-size:13px;color:#333">'
      h += fmt(p.subtotal) + '</td></tr>\n'
    }
    if (p.vatTotal != null) {
      h += '<tr><td align="right" style="padding:6px 6px;'
      h += 'font-size:13px;color:#888">VAT (20%)</td>\n'
      h += '<td align="right" width="120" style="padding:6px 6px;'
      h += 'font-size:13px;color:#333">'
      h += fmt(p.vatTotal) + '</td></tr>\n'
    }
    h += '<tr><td></td><td width="120" style="padding:0 6px 10px">'
    h += '<div style="height:2px;background:#1e3a5f"></div></td></tr>\n'
    h += '<tr>'
    h += '<td align="right" style="padding:16px 6px 10px;'
    h += 'font-size:16px;font-weight:700;'
    h += 'color:#1e3a5f">Total (inc. VAT)</td>\n'
    h += '<td align="right" width="120" style="padding:16px 6px 10px;'
    h += 'font-size:18px;font-weight:700;'
    h += 'color:#1e3a5f">'
    h += fmt(p.grandTotal) + '</td></tr>\n'
    h += '</table>\n'
    h += '</td></tr>\n'
  }

  // — PDF note —
  if (p.hasPdf) {
    h += '<tr><td style="padding:0 24px 8px">\n'
    h += '<div style="background:#f0f4f8;'
    h += 'border-radius:6px;padding:12px 16px;'
    h += 'font-size:13px;color:#555">'
    h += '<strong style="color:#1e3a5f">PDF Attached</strong>'
    h += ' &mdash; A detailed quote is attached.</div>\n'
    h += '</td></tr>\n'
  }

  // — CTA button —
  if (p.instructionLink) {
    h += '<tr><td align="center" style="padding:20px 28px">\n'
    h += '<a href="' + p.instructionLink + '" style="'
    h += 'display:inline-block;background:#1e3a5f;'
    h += 'color:#fff;padding:14px 36px;'
    h += 'text-decoration:none;border-radius:8px;'
    h += 'font-weight:600;font-size:15px">'
    h += 'Instruct Us to Proceed</a>\n'
    h += '</td></tr>\n'
  }

  // — Footer —
  h += '<tr><td bgcolor="#f9fafb" style="padding:14px 28px;'
  h += 'border-top:1px solid #e5e5e5">\n'
  h += '<p style="margin:0;font-size:11px;'
  h += 'color:#999;font-style:italic">'
  h += 'This is an estimate only and may be subject '
  h += 'to change.</p>\n'
  h += '</td></tr>\n'

  // Close wrapper
  h += '</table>\n'
  h += '<p style="text-align:center;font-size:11px;'
  h += 'color:#999;margin-top:14px">'
  h += 'Powered by ConveyQuote</p>\n'
  h += '</td></tr></table>\n'
  h += '</body></html>'
  return h
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
  const svc = p.serviceType.replace(/_/g, ' & ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
  const sc = p.status === 'review' ? '#d97706' : '#059669'
  const sl = p.status === 'review' ? 'Manual Review' : 'New Lead'
  const fmt = (n: number) => {
    const s = Number(n).toFixed(2)
    return '£' + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  let h = ''
  h += '<!DOCTYPE html><html><head>'
  h += '<meta charset="utf-8"></head>\n'
  h += '<body style="margin:0;padding:0;'
  h += 'background:#f5f5f5;'
  h += 'font-family:Arial,sans-serif;color:#333">\n'
  h += '<table width="100%" cellpadding="0" cellspacing="0">'
  h += '<tr><td align="center" style="padding:20px">\n'
  h += '<table width="600" cellpadding="0" cellspacing="0" '
  h += 'style="background:#fff;border:1px solid #e5e5e5">\n'

  // Header
  h += '<tr><td bgcolor="#1e3a5f" style="padding:22px 28px">\n'
  h += '<div style="color:#fff;font-size:18px;'
  h += 'font-weight:700">New Enquiry Received</div>\n'
  h += '<div style="color:rgba(255,255,255,0.7);'
  h += 'font-size:13px;margin-top:4px">'
  h += p.firmName + '</div>\n'
  h += '</td></tr>\n'

  // Body
  h += '<tr><td style="padding:24px 28px">\n'
  h += '<div style="display:inline-block;background:'
  h += sc + ';color:#fff;padding:4px 12px;'
  h += 'border-radius:20px;font-size:12px;'
  h += 'font-weight:600;margin-bottom:16px">'
  h += sl + '</div>\n'

  h += '<table width="100%" cellpadding="0" cellspacing="0">\n'
  if (p.referenceCode) {
    h += '<tr>'
    h += '<td style="padding:10px 0;'
    h += 'border-bottom:1px solid #f0f0f0;'
    h += 'color:#888;font-size:13px;width:120px">'
    h += 'Reference</td>\n'
    h += '<td style="padding:10px 0;'
    h += 'border-bottom:1px solid #f0f0f0;'
    h += 'font-weight:600;font-family:monospace;'
    h += 'color:#1e3a5f">' + p.referenceCode + '</td>'
    h += '</tr>\n'
  }
  h += '<tr>'
  h += '<td style="padding:10px 0;'
  h += 'border-bottom:1px solid #f0f0f0;'
  h += 'color:#888;font-size:13px">Name</td>\n'
  h += '<td style="padding:10px 0;'
  h += 'border-bottom:1px solid #f0f0f0;'
  h += 'font-weight:600">' + p.leadName + '</td>'
  h += '</tr>\n'
  h += '<tr>'
  h += '<td style="padding:10px 0;'
  h += 'border-bottom:1px solid #f0f0f0;'
  h += 'color:#888;font-size:13px">Email</td>\n'
  h += '<td style="padding:10px 0;'
  h += 'border-bottom:1px solid #f0f0f0">'
  h += '<a href="mailto:' + p.leadEmail + '" '
  h += 'style="color:#1e3a5f">'
  h += p.leadEmail + '</a></td>'
  h += '</tr>\n'
  h += '<tr>'
  h += '<td style="padding:10px 0;'
  h += 'border-bottom:1px solid #f0f0f0;'
  h += 'color:#888;font-size:13px">Service</td>\n'
  h += '<td style="padding:10px 0;'
  h += 'border-bottom:1px solid #f0f0f0">'
  h += svc + '</td>'
  h += '</tr>\n'
  h += '<tr>'
  h += '<td style="padding:10px 0;'
  h += 'color:#888;font-size:13px">Property Value</td>\n'
  h += '<td style="padding:10px 0;font-weight:600">'
  h += fmt(Number(p.propertyValue)) + '</td>'
  h += '</tr>\n'
  h += '</table>\n'

  h += '</td></tr>\n'

  // Footer
  h += '<tr><td align="center" style="padding:18px 28px">\n'
  h += '<p style="margin:0;font-size:12px;color:#999">'
  h += 'Log in to your ConveyQuote dashboard '
  h += 'to manage this lead.</p>\n'
  h += '</td></tr>\n'

  h += '</table>\n'
  h += '</td></tr></table>\n'
  h += '</body></html>'
  return h
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
            const pdfHtml = customerThankYouHtml({
              firmName: notifyFirm.name,
              leadName: existingLead.full_name,
              leadEmail: existingLead.email,
              serviceType: existingLead.service_type,
              propertyValue: existingLead.property_value ? Number(existingLead.property_value) : undefined,
              propertyAddress: String(existingLead.property_postcode || ''),
              referenceCode: existingQuote?.reference_code || undefined,
              items: existingItems as { description: string; amount: number; is_vatable?: boolean }[],
              subtotal: notifyTotals ? Number(notifyTotals.subtotal || 0) : undefined,
              vatTotal: notifyTotals ? Number(notifyTotals.vatTotal || 0) : undefined,
              grandTotal: notifyTotals?.grandTotal != null ? Number(notifyTotals.grandTotal) : undefined,
              instructionLink: undefined,
              hasPdf: false,
              includeIntro: false,
              compactHeader: true,
            })
            const pdfBase64 = (await renderPdfFromHtmlBase64(pdfHtml)) || await generateQuotePdfBase64({
              firmName: notifyFirm.name,
              leadName: existingLead.full_name,
              leadEmail: existingLead.email,
              serviceType: existingLead.service_type,
              propertyValue: existingLead.property_value ? Number(existingLead.property_value) : undefined,
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
            propertyAddress: String(existingLead.property_postcode || ''),
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
            const pdfHtml = customerThankYouHtml({
              firmName: firm.name,
              leadName: lead.full_name,
              leadEmail: lead.email,
              serviceType: lead.service_type,
              propertyValue: lead.property_value ? Number(lead.property_value) : undefined,
              propertyAddress: String(lead.property_postcode || ''),
              referenceCode: referenceCode || undefined,
              items: quoteItems,
              subtotal: totals?.subtotal != null ? Number(totals.subtotal) : undefined,
              vatTotal: totals?.vatTotal != null ? Number(totals.vatTotal) : undefined,
              grandTotal: totals?.grandTotal != null ? Number(totals.grandTotal) : undefined,
              instructionLink: undefined,
              hasPdf: false,
              includeIntro: false,
              compactHeader: true,
            })
            const pdfBase64 = (await renderPdfFromHtmlBase64(pdfHtml)) || await generateQuotePdfBase64({
              firmName: firm.name,
              leadName: lead.full_name,
              leadEmail: lead.email,
              serviceType: lead.service_type,
              propertyValue: lead.property_value ? Number(lead.property_value) : undefined,
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
          propertyAddress: String(lead.property_postcode || ''),
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
