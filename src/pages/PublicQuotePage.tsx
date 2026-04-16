import { useState, useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useQuoteForm } from '@/hooks/useQuoteForm'
import { calculateQuoteWithFallback } from '@/lib/quoteEngine'
import PurchaseSection from '@/components/quote/PurchaseSection'
import SaleSection from '@/components/quote/SaleSection'
import RemortgageSection from '@/components/quote/RemortgageSection'
import AdditionalInfoSection from '@/components/quote/AdditionalInfoSection'
import { formatCurrency } from '@/lib/utils'
import { hasProfessionalAccess } from '@/lib/billing'
import { toast } from 'sonner'
import { Scale, Send, FileText } from 'lucide-react'
import type {
  Firm,
  PricingBand,
  PricingExtra,
  DiscountCode,
  ServiceType,
  PublicFormConfig,
  ManualReviewCondition,
} from '@/types'

const DEFAULT_CONFIG: PublicFormConfig = {
  show_service_selector: true,
  show_sale_section: true,
  show_purchase_section: true,
  show_remortgage_section: true,
  show_additional_info: true,
  show_timeline_notes: true,
  show_phone_field: true,
  show_discount_code: true,
  show_instruct_button: true,
  hidden_fields: [],
  required_fields: [],
  instruction_hidden_fields: [],
  instruction_required_fields: [],
}

const TIMELINE_OPTS = [
  { value: 'asap', label: 'As soon as possible' },
  { value: '1_month', label: 'Within 1 month' },
  { value: '1_3_months', label: '1-3 months' },
  { value: '3_6_months', label: '3-6 months' },
  { value: 'not_sure', label: 'Not sure yet' },
]

export default function PublicQuotePage() {
  const { firmSlug } = useParams<{ firmSlug: string }>()
  const [searchParams] = useSearchParams()
  const embedParam = searchParams.get('embed')
  const isEmbed = embedParam === '1' || embedParam === 'true'

  const form = useQuoteForm()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [validatedDiscount, setValidatedDiscount] = useState<DiscountCode | null>(null)
  const [quoteResult, setQuoteResult] = useState<ReturnType<typeof calculateQuoteWithFallback> | null>(null)
  const [referenceCode, setReferenceCode] = useState<string | null>(null)

  // Load firm
  const { data: firm, isLoading: firmLoading } = useQuery({
    queryKey: ['public-firm', firmSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('firms')
        .select('*')
        .eq('slug', firmSlug!)
        .eq('is_active', true)
        .eq('public_quote_form_enabled', true)
        .single()
      if (error) throw error
      return data as Firm
    },
    enabled: !!firmSlug,
  })

  // Load pricing
  const { data: bands = [] } = useQuery({
    queryKey: ['public-bands', firm?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('pricing_bands')
        .select('*')
        .eq('firm_id', firm!.id)
      return (data ?? []) as PricingBand[]
    },
    enabled: !!firm?.id,
  })

  const { data: extras = [] } = useQuery({
    queryKey: ['public-extras', firm?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('pricing_extras')
        .select('*')
        .eq('firm_id', firm!.id)
        .eq('is_active', true)
      return (data ?? []) as PricingExtra[]
    },
    enabled: !!firm?.id,
  })

  const config: PublicFormConfig = useMemo(() => {
    return { ...DEFAULT_CONFIG, ...(firm?.public_form_config as Partial<PublicFormConfig> | null) }
  }, [firm])
  const hasProPlanAccess = useMemo(() => (firm ? hasProfessionalAccess(firm) : false), [firm])
  const canUseDiscountCode = hasProPlanAccess && config.show_discount_code

  const availableServices = useMemo(() => {
    const services: ServiceType[] = []
    if (config.show_purchase_section) services.push('purchase')
    if (config.show_sale_section) services.push('sale')
    if (config.show_purchase_section && config.show_sale_section) services.push('sale_purchase')
    if (config.show_remortgage_section) services.push('remortgage')
    return services
  }, [config])

  // Embed height publishing — use ResizeObserver to push height changes to parent
  // so auto-resizing iframe snippets can adapt. Matches the `conveyquote:height`
  // message contract documented in Settings → Embed.
  useEffect(() => {
    if (!isEmbed) return
    let lastHeight = 0
    const publish = () => {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      )
      if (height !== lastHeight) {
        lastHeight = height
        window.parent.postMessage({ type: 'conveyquote:height', height }, '*')
      }
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(document.body)
    window.addEventListener('load', publish)
    const interval = setInterval(publish, 1000) // safety net for late renders
    return () => {
      ro.disconnect()
      window.removeEventListener('load', publish)
      clearInterval(interval)
    }
  }, [isEmbed])

  function checkManualReview(): boolean {
    if (!firm) return false
    if (!hasProPlanAccess) return true
    if (firm.require_admin_review) return true
    const conditions = (firm.manual_review_conditions ?? []) as ManualReviewCondition[]
    if (conditions.length === 0) return false

    const answers = form.getAnswersJson()
    return conditions.some((c) => {
      const val = String(answers[c.field] ?? '')
      return val.toLowerCase() === c.value.toLowerCase()
    })
  }

  async function validateDiscount() {
    if (!discountInput.trim() || !firm) return
    const { data, error } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('firm_id', firm.id)
      .eq('code', discountInput.trim().toUpperCase())
      .eq('is_active', true)
      .single()

    if (error || !data) {
      toast.error('Invalid discount code')
      setValidatedDiscount(null)
      return
    }

    const code = data as DiscountCode
    const now = new Date()
    if (code.valid_from && new Date(code.valid_from) > now) {
      toast.error('Discount code not yet valid')
      return
    }
    if (code.valid_until && new Date(code.valid_until) < now) {
      toast.error('Discount code has expired')
      return
    }
    if (code.max_uses && code.use_count >= code.max_uses) {
      toast.error('Discount code usage limit reached')
      return
    }

    setValidatedDiscount(code)
    toast.success(`Discount "${code.code}" applied!`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firm) return

    // Validate required fields
    if (!form.contact.first_name || !form.contact.email) {
      toast.error('Please fill in your name and email')
      return
    }

    setSubmitting(true)

    const formData = form.getFormData()
    const effectiveDiscount = canUseDiscountCode ? validatedDiscount : null
    const result = calculateQuoteWithFallback(formData, bands, extras, effectiveDiscount)
    const isReview = checkManualReview() || result.noMatchFallback

    const leadPayload = {
      firm_id: firm.id,
      full_name: `${form.contact.first_name} ${form.contact.surname}`.trim(),
      first_name: form.contact.first_name,
      surname: form.contact.surname,
      email: form.contact.email,
      phone: form.contact.phone || null,
      service_type: form.serviceType,
      property_value: form.getPropertyValue(),
      tenure: formData.purchase.tenure || formData.sale.tenure || formData.remortgage.tenure || 'freehold',
      mortgage_required: formData.purchase.has_mortgage === 'yes',
      first_time_buyer: formData.purchase.is_first_time_buyer === 'yes',
      estimated_total: isReview ? null : result.breakdown.grandTotal,
      status: isReview ? 'review' : 'new',
      answers: form.getAnswersJson(),
      discount_code_id: effectiveDiscount?.id || null,
    }

    try {
      // Use supabase.rpc() instead of edge functions to avoid CORS issues.
      // The RPC goes through the REST API (PostgREST) which has CORS
      // handled by the Supabase gateway — works from any embedded origin.
      // Emails are triggered server-side via pg_net (no browser involved).
      const rpcPromise = supabase.rpc('create_public_lead', {
        p_lead: leadPayload,
        p_discount_code_id: effectiveDiscount?.id || null,
        p_totals: isReview ? null : {
          subtotal: result.breakdown.subtotal,
          vatTotal: result.breakdown.vatAmount,
          grandTotal: result.breakdown.grandTotal,
        },
        p_quote_items: isReview ? null : result.breakdown.items.map((item, i) => ({
          description: item.description,
          amount: item.amount,
          is_vatable: item.is_vatable,
          item_type: item.item_type,
          sort_order: i,
        })),
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), 45000),
      )
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise])

      if (error) {
        throw new Error(error.message || 'Submission failed')
      }

      setQuoteResult(result)
      setReferenceCode(data?.referenceCode || null)
      setSubmitted(true)

      // Fire email notification via edge function (fire-and-forget).
      // The RPC only creates data — emails are sent by the edge function.
      // This is non-blocking: if it fails, the lead is already saved.
      if (data?.id) {
        supabase.functions.invoke('create-public-leads', {
          body: { notifyLeadId: data.id, firmId: firm.id },
        }).then(({ error: fnErr }) => {
          if (fnErr) console.warn('Email notification failed (lead still saved):', fnErr)
          else console.log('Email notification sent successfully')
        }).catch((fnErr) => {
          console.warn('Email notification request failed (lead still saved):', fnErr)
        })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('create-public-leads RPC failed:', err)
      toast.error(`Failed to submit: ${message}`)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
  }

  if (firmLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!firm) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Form Not Available</h1>
          <p className="mt-2 text-muted-foreground">This quote form is not currently active.</p>
        </div>
      </div>
    )
  }

  const primaryColor = firm.primary_color || '#1e3a5f'

  // Submitted state — invoice-style layout
  if (submitted && quoteResult) {
    const serviceLabel = form.serviceType.replace(/_/g, ' & ').replace(/\b\w/g, c => c.toUpperCase())
    const isManualReview = quoteResult.noMatchFallback || !hasProPlanAccess || !firm.show_instant_quote

    return (
      <div className={`bg-muted/30 ${isEmbed ? 'p-4' : 'min-h-screen py-8 px-4'}`}>
        <div className="max-w-2xl mx-auto">
          {!isEmbed && (
            <div className="text-center mb-6">
              <Scale className="h-7 w-7 mx-auto mb-2" style={{ color: primaryColor }} />
              <h1 className="text-xl font-bold" style={{ color: primaryColor }}>{firm.name}</h1>
            </div>
          )}

          {/* Success banner */}
          <div className="rounded-xl border border-green-200 bg-green-50/60 p-4 mb-4 flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Send className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-green-900 text-sm">
                {isManualReview ? 'Enquiry Submitted Successfully' : 'Quote Submitted Successfully'}
              </p>
              <p className="text-green-700 text-xs mt-0.5">
                {isManualReview
                  ? 'We will review your details and be in touch shortly.'
                  : 'A copy has been sent to your email. A member of our team will be in touch soon.'}
              </p>
            </div>
          </div>

          {isManualReview ? (
            <div className="bg-card rounded-xl border border-border p-8 shadow-sm text-center">
              <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <h2 className="text-lg font-bold text-foreground">Under Review</h2>
              <p className="text-muted-foreground text-sm mt-2 max-w-sm mx-auto">
                Your enquiry requires a manual review. We&apos;ll prepare a personalised quote and contact you shortly.
              </p>
            </div>
          ) : (
            /* Invoice-style document */
            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
              {/* Header band */}
              <div className="px-8 py-6" style={{ background: primaryColor }}>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">{firm.name}</h2>
                    {referenceCode && (
                      <p className="text-sm text-white/70 mt-1 font-mono">{referenceCode}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold tracking-wider text-white/60 uppercase">Quote Estimate</span>
                    <p className="text-sm text-white/80 mt-0.5">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                </div>
              </div>

              {/* Info grid */}
              <div className="px-8 py-5 border-b border-border grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Prepared For</p>
                  <p className="text-sm font-medium text-foreground">{form.contact.first_name} {form.contact.surname}</p>
                  <p className="text-xs text-muted-foreground">{form.contact.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Service</p>
                  <p className="text-sm font-medium text-foreground">{serviceLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    Property value: {formatCurrency(form.getPropertyValue())}
                  </p>
                </div>
              </div>

              {/* Line items */}
              <div className="px-8 py-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2" style={{ borderColor: primaryColor }}>
                      <th className="pb-2 text-left font-semibold text-foreground text-xs uppercase tracking-wider">Description</th>
                      <th className="pb-2 text-right font-semibold text-foreground text-xs uppercase tracking-wider w-24">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quoteResult.breakdown.items.map((item, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                        <td className="py-2.5 px-2 text-foreground">{item.description}</td>
                        <td className={`py-2.5 px-2 text-right font-medium tabular-nums ${item.amount < 0 ? 'text-green-600' : 'text-foreground'}`}>
                          {item.amount < 0 && '\u2212'}{formatCurrency(Math.abs(item.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="px-8 py-5 border-t border-border">
                <div className="ml-auto max-w-xs space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quoteResult.breakdown.subtotal)}</span>
                  </div>
                  {quoteResult.breakdown.discountTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="font-medium text-green-600 tabular-nums">&minus;{formatCurrency(quoteResult.breakdown.discountTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT (20%)</span>
                    <span className="font-medium tabular-nums">{formatCurrency(quoteResult.breakdown.vatAmount)}</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t-2 text-base" style={{ borderColor: primaryColor }}>
                    <span className="font-bold" style={{ color: primaryColor }}>Total (inc. VAT)</span>
                    <span className="font-bold text-lg tabular-nums" style={{ color: primaryColor }}>{formatCurrency(quoteResult.breakdown.grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-4 bg-muted/30 border-t border-border">
                <p className="text-[11px] text-muted-foreground text-center">
                  This is an estimate only and may be subject to change. Please contact us for a full breakdown.
                </p>
              </div>
            </div>
          )}

          {firm.disclaimer_text && (
            <p className="mt-4 text-xs text-muted-foreground text-center">{firm.disclaimer_text}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-muted/30 ${isEmbed ? 'p-4' : 'min-h-screen py-8 px-4'}`}>
      <div className="max-w-2xl mx-auto">
        {!isEmbed && (
          <div className="mb-8 px-1 sm:px-2">
            {firm.logo_url ? (
              <img src={firm.logo_url} alt={firm.name} className="h-12 mb-2" />
            ) : (
              <Scale className="h-8 w-8 mb-2" style={{ color: primaryColor }} />
            )}
            <h1 className="text-2xl font-bold" style={{ color: primaryColor }}>{firm.name}</h1>
            <p className="text-muted-foreground mt-1">Get your instant conveyancing quote</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border p-6 sm:p-8 shadow-sm space-y-6">
          {/* Service Type */}
          {config.show_service_selector && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">What do you need?</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {availableServices.map((svc) => (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => form.setServiceType(svc)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                      form.serviceType === svc
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {svc === 'purchase' ? 'Purchase' :
                     svc === 'sale' ? 'Sale' :
                     svc === 'sale_purchase' ? 'Sale & Purchase' :
                     'Remortgage'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Service Sections */}
          {(form.serviceType === 'purchase' || form.serviceType === 'sale_purchase') && config.show_purchase_section && (
            <PurchaseSection data={form.purchase} onChange={form.updatePurchase} hiddenFields={config.hidden_fields} />
          )}

          {(form.serviceType === 'sale' || form.serviceType === 'sale_purchase') && config.show_sale_section && (
            <SaleSection data={form.sale} onChange={form.updateSale} hiddenFields={config.hidden_fields} />
          )}

          {form.serviceType === 'remortgage' && config.show_remortgage_section && (
            <RemortgageSection data={form.remortgage} onChange={form.updateRemortgage} hiddenFields={config.hidden_fields} />
          )}

          {config.show_additional_info && (
            <AdditionalInfoSection data={form.additional} onChange={form.updateAdditional} hiddenFields={config.hidden_fields} />
          )}

          {/* Timeline & Notes */}
          {config.show_timeline_notes && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground border-b border-border pb-2">Timeline</h3>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">When do you need to instruct?</label>
                <select
                  value={form.common.instruct_timeline}
                  onChange={(e) => form.updateCommon({ instruct_timeline: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select timeline</option>
                  {TIMELINE_OPTS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Special Instructions</label>
                <textarea
                  value={form.common.special_instructions}
                  onChange={(e) => form.updateCommon({ special_instructions: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Any additional information..."
                />
              </div>
            </div>
          )}

          {/* Discount Code */}
          {canUseDiscountCode && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Discount Code</label>
              <div className="flex gap-2">
                <input
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter code"
                />
                <button
                  type="button"
                  onClick={validateDiscount}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                >
                  Apply
                </button>
              </div>
              {validatedDiscount && (
                <p className="mt-1 text-sm text-green-600">
                  Discount applied: {validatedDiscount.discount_type === 'fixed'
                    ? formatCurrency(validatedDiscount.discount_value)
                    : `${validatedDiscount.discount_value}%`} off
                </p>
              )}
            </div>
          )}

          {/* Contact Details */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-foreground border-b border-border pb-2">Your Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">First Name *</label>
                <input
                  required
                  value={form.contact.first_name}
                  onChange={(e) => form.updateContact({ first_name: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Surname *</label>
                <input
                  required
                  value={form.contact.surname}
                  onChange={(e) => form.updateContact({ surname: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email *</label>
              <input
                type="email"
                required
                value={form.contact.email}
                onChange={(e) => form.updateContact({ email: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {config.show_phone_field && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={form.contact.phone}
                  onChange={(e) => form.updateContact({ phone: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg py-3 text-base font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {submitting ? 'Submitting...' : 'Get My Quote'}
          </button>
        </form>
      </div>
    </div>
  )
}
