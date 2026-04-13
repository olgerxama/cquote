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

interface QuotePdfItem {
  description: string
  amount: number
}

function formatCurrency(amount: number): string {
  return `£${Math.abs(amount).toFixed(2)}`
}

async function buildQuotePdfAttachment(p: {
  firmName: string
  leadName: string
  serviceType?: string | null
  referenceCode?: string | null
  documentType: string
  items: QuotePdfItem[]
  totals: { subtotal: number; discountTotal: number; vatAmount: number; grandTotal: number }
  filename: string
}): Promise<EmailAttachment> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842]) // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const text = rgb(0.1, 0.1, 0.1)
  const muted = rgb(0.42, 0.46, 0.52)
  const accent = rgb(0.12, 0.23, 0.37)
  const green = rgb(0.06, 0.56, 0.29)

  let y = 800
  const left = 48
  const right = 547
  const draw = (value: string, x: number, yy: number, size = 11, isBold = false, color = text) => {
    page.drawText(value, { x, y: yy, size, font: isBold ? bold : font, color })
  }
  const rightAlignedX = (value: string, size = 11, isBold = false) => {
    const usedFont = isBold ? bold : font
    return right - usedFont.widthOfTextAtSize(value, size)
  }

  const title = p.documentType === 'invoice' ? 'Invoice' : 'Estimate'
  draw(p.firmName, left, y, 20, true, accent)
  draw(title, rightAlignedX(title, 24, true), y - 2, 24, true)
  y -= 30
  if (p.referenceCode) {
    const ref = `Ref: ${p.referenceCode}`
    draw(ref, rightAlignedX(ref, 10), y, 10, false, muted)
  }

  y -= 34
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: rgb(0.9, 0.92, 0.95) })
  y -= 20
  draw('Prepared for', left, y, 10, true, muted)
  draw(p.leadName, left, y - 16, 12, false)
  if (p.serviceType) {
    const cleanService = p.serviceType.replaceAll('_', ' ').replaceAll('&', '& ')
    draw('Service', rightAlignedX('Service', 10, true), y, 10, true, muted)
    draw(cleanService, rightAlignedX(cleanService, 12), y - 16, 12)
  }

  y -= 44
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: rgb(0.9, 0.92, 0.95) })
  y -= 18
  draw('Description', left, y, 10, true, muted)
  draw('Amount', rightAlignedX('Amount', 10, true), y, 10, true, muted)
  y -= 8
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: rgb(0.92, 0.94, 0.96) })
  y -= 18

  const items = p.items.length
    ? p.items
    : [{ description: p.documentType === 'invoice' ? 'Invoice total' : 'Estimate total', amount: p.totals.grandTotal }]
  for (const item of items) {
    draw(item.description, left, y, 11)
    const amountText = `${item.amount < 0 ? '−' : ''}${formatCurrency(item.amount)}`
    draw(amountText, rightAlignedX(amountText, 11, true), y, 11, true, item.amount < 0 ? green : text)
    y -= 20
    if (y < 220) break
  }

  y -= 6
  page.drawLine({ start: { x: 330, y }, end: { x: right, y }, thickness: 1, color: rgb(0.9, 0.92, 0.95) })
  y -= 18
  const totalsRows: Array<{ label: string; value: string; color?: ReturnType<typeof rgb>; bold?: boolean }> = [
    { label: 'Subtotal', value: formatCurrency(p.totals.subtotal) },
  ]
  if (p.totals.discountTotal > 0) {
    totalsRows.push({ label: 'Discount', value: `−${formatCurrency(p.totals.discountTotal)}`, color: green })
  }
  totalsRows.push({ label: 'VAT', value: formatCurrency(p.totals.vatAmount) })
  totalsRows.push({ label: 'Grand Total', value: formatCurrency(p.totals.grandTotal), bold: true })
  for (const row of totalsRows) {
    const size = row.bold ? 13 : 11
    draw(row.label, 330, y, size, row.bold)
    draw(row.value, rightAlignedX(row.value, size, row.bold), y, size, row.bold, row.color || text)
    y -= row.bold ? 24 : 18
  }

  const bytes = await pdf.save()
  const binary = String.fromCharCode(...bytes)
  return { filename: p.filename, content: btoa(binary), encoding: 'base64' }
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
      supabase
        .from('quote_items')
        .select('description, amount, sort_order')
        .eq('quote_id', quoteId)
        .order('sort_order', { ascending: true }),
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
    const quoteItems = (itemsRes.data || []) as Array<{ description: string; amount: number }>

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

    const totalsPayload = {
      subtotal: Number(totals.subtotal || quote.subtotal || 0),
      discountTotal: Number(totals.discountTotal || quote.discount_total || 0),
      vatAmount: Number(totals.vatAmount || totals.vatTotal || quote.vat_total || 0),
      grandTotal: Number(totals.grandTotal || quote.grand_total || 0),
    }
    const generatedPdf = await buildQuotePdfAttachment({
      firmName: firm.name,
      leadName: lead.full_name,
      serviceType: lead.service_type,
      referenceCode: quote.reference_code,
      documentType,
      items: quoteItems,
      totals: totalsPayload,
      filename: pdfAttachment?.filename || `${documentType}-${quote.reference_code || quoteId}.pdf`,
    })
    emailOptions.attachments = [generatedPdf]

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
