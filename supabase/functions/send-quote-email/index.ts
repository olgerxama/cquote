// Self-contained edge function: send-quote-email
// Admin-triggered: sends a quote/invoice email to the lead with an optional
// PDF attachment, then marks the quote as sent.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

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

interface PdfQuoteItem {
  description: string
  amount: number
}

function formatCurrency(amount: number): string {
  return `£${Number(amount || 0).toFixed(2)}`
}

function formatServiceLabel(serviceType: string): string {
  return serviceType.replace(/_/g, ' & ').replace(/\b\w/g, (ch) => ch.toUpperCase())
}

async function generateQuotePdfAttachment(p: {
  firmName: string
  leadName: string
  serviceType: string
  documentType: 'estimate' | 'invoice'
  referenceCode?: string | null
  items: PdfQuoteItem[]
  totals: {
    subtotal: number
    discountTotal: number
    vatAmount: number
    grandTotal: number
  }
}): Promise<EmailAttachment> {
  const pdfDoc = await PDFDocument.create()
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const PAGE_W = 595
  const PAGE_H = 842
  const MARGIN = 48
  const CONTENT_W = PAGE_W - MARGIN * 2

  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN
  let isFirstPage = true

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
  }

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    size = 11,
    bold = false,
    color = rgb(0.13, 0.13, 0.13),
  ) => {
    page.drawText(text, {
      x,
      y: yPos,
      size,
      font: bold ? fontBold : fontRegular,
      color,
    })
  }

  if (isFirstPage) {
    page.drawRectangle({
      x: MARGIN,
      y: y - 74,
      width: CONTENT_W,
      height: 74,
      color: rgb(0.94, 0.96, 0.99),
      borderColor: rgb(0.85, 0.88, 0.94),
      borderWidth: 1,
    })
    drawText(p.firmName, MARGIN + 16, y - 28, 19, true, rgb(0.12, 0.23, 0.37))
    drawText(
      p.documentType === 'invoice' ? 'Invoice' : 'Estimate',
      PAGE_W - MARGIN - 120,
      y - 28,
      18,
      true,
      rgb(0.12, 0.23, 0.37),
    )
    if (p.referenceCode) {
      drawText(`Ref: ${p.referenceCode}`, PAGE_W - MARGIN - 120, y - 46, 10, false, rgb(0.35, 0.35, 0.35))
    }
    y -= 96

    page.drawRectangle({
      x: MARGIN,
      y: y - 56,
      width: CONTENT_W,
      height: 56,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1,
    })
    drawText('Prepared for', MARGIN + 14, y - 20, 9, true, rgb(0.45, 0.45, 0.45))
    drawText(p.leadName, MARGIN + 14, y - 36, 11, false)
    drawText('Service', MARGIN + CONTENT_W - 170, y - 20, 9, true, rgb(0.45, 0.45, 0.45))
    drawText(formatServiceLabel(p.serviceType), MARGIN + CONTENT_W - 170, y - 36, 11, false)
    y -= 76
    isFirstPage = false
  }

  ensureSpace(32)
  page.drawRectangle({
    x: MARGIN,
    y: y - 28,
    width: CONTENT_W,
    height: 28,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.9, 0.9, 0.9),
    borderWidth: 1,
  })
  drawText('Description', MARGIN + 12, y - 18, 10, true, rgb(0.36, 0.36, 0.36))
  drawText('Amount', PAGE_W - MARGIN - 84, y - 18, 10, true, rgb(0.36, 0.36, 0.36))
  y -= 30

  const wrapText = (text: string, maxChars = 62): string[] => {
    if (text.length <= maxChars) return [text]
    const words = text.split(' ')
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (next.length <= maxChars) {
        line = next
      } else {
        if (line) lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
    return lines
  }

  for (const item of p.items) {
    const lines = wrapText(item.description || 'Item')
    const rowHeight = Math.max(24, 16 + lines.length * 12)
    ensureSpace(rowHeight + 6)

    page.drawRectangle({
      x: MARGIN,
      y: y - rowHeight,
      width: CONTENT_W,
      height: rowHeight,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.92, 0.92, 0.92),
      borderWidth: 1,
    })

    lines.forEach((line, idx) => {
      drawText(line, MARGIN + 12, y - 16 - idx * 12, 10, false)
    })
    drawText(formatCurrency(item.amount), PAGE_W - MARGIN - 84, y - 16, 10, false)
    y -= rowHeight
  }

  ensureSpace(118)
  const totalsBoxW = 240
  const totalsX = PAGE_W - MARGIN - totalsBoxW
  page.drawRectangle({
    x: totalsX,
    y: y - 98,
    width: totalsBoxW,
    height: 98,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.9, 0.9, 0.9),
    borderWidth: 1,
  })
  drawText('Subtotal', totalsX + 12, y - 20, 10, false, rgb(0.35, 0.35, 0.35))
  drawText(formatCurrency(p.totals.subtotal), totalsX + totalsBoxW - 90, y - 20, 10, true)

  if (p.totals.discountTotal > 0) {
    drawText('Discount', totalsX + 12, y - 38, 10, false, rgb(0.35, 0.35, 0.35))
    drawText(`-${formatCurrency(p.totals.discountTotal)}`, totalsX + totalsBoxW - 90, y - 38, 10, true, rgb(0.03, 0.45, 0.22))
  }

  drawText('VAT', totalsX + 12, y - 56, 10, false, rgb(0.35, 0.35, 0.35))
  drawText(formatCurrency(p.totals.vatAmount), totalsX + totalsBoxW - 90, y - 56, 10, true)

  page.drawLine({
    start: { x: totalsX + 10, y: y - 68 },
    end: { x: totalsX + totalsBoxW - 10, y: y - 68 },
    color: rgb(0.85, 0.85, 0.85),
    thickness: 1,
  })
  drawText('Grand Total', totalsX + 12, y - 84, 12, true)
  drawText(formatCurrency(p.totals.grandTotal), totalsX + totalsBoxW - 104, y - 84, 12, true)

  const bytes = await pdfDoc.save()
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  const base64 = btoa(binary)

  return {
    filename: `${p.documentType}-${p.referenceCode || 'quote'}.pdf`,
    content: base64,
    encoding: 'base64',
  }
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

    const boundary = `boundary_${Date.now()}`
    let msg = `From: ${opts.fromName || 'ConveyQuote'} <${opts.from}>\r\n`
    msg += `To: ${opts.to}\r\n`
    msg += `Subject: ${opts.subject}\r\n`
    msg += `MIME-Version: 1.0\r\n`
    if (opts.attachments?.length) {
      msg += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`
      msg += `--${boundary}\r\n`
      msg += `Content-Type: text/html; charset=utf-8\r\n\r\n`
      msg += `${opts.html}\r\n`
      for (const att of opts.attachments) {
        msg += `--${boundary}\r\n`
        msg += `Content-Type: application/pdf; name="${att.filename}"\r\n`
        msg += `Content-Transfer-Encoding: base64\r\n`
        msg += `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n`
        msg += `${att.content}\r\n`
      }
      msg += `--${boundary}--\r\n`
    } else {
      msg += `Content-Type: text/html; charset=utf-8\r\n\r\n`
      msg += opts.html
    }
    msg += '\r\n.'
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

    const [quoteRes, leadRes, itemsRes] = await Promise.all([
      supabase.from('quotes').select('*').eq('id', quoteId).single(),
      supabase.from('leads').select('*').eq('id', leadId).single(),
      supabase.from('quote_items').select('description, amount, sort_order').eq('quote_id', quoteId).order('sort_order', { ascending: true }),
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
    const quoteItems = (itemsRes.data || []) as Array<{ description: string; amount: number; sort_order: number }>

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
      emailOptions.attachments = [{
        filename: pdfAttachment.filename || `${documentType}-${quote.reference_code || quoteId}.pdf`,
        content: pdfAttachment.base64,
        encoding: 'base64',
      }]
    } else {
      const autoPdf = await generateQuotePdfAttachment({
        firmName: firm.name,
        leadName: lead.full_name,
        serviceType: lead.service_type,
        documentType,
        referenceCode: quote.reference_code,
        items: quoteItems.map((it) => ({ description: it.description, amount: Number(it.amount) })),
        totals: {
          subtotal: Number(totals.subtotal || quote.subtotal || 0),
          discountTotal: Number(quote.discount_total || 0),
          vatAmount: Number(totals.vatAmount || totals.vatTotal || quote.vat_total || 0),
          grandTotal: Number(totals.grandTotal || quote.grand_total || 0),
        },
      })
      emailOptions.attachments = [autoPdf]
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
