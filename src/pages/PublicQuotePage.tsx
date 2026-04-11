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
import QuoteResultDisplay from '@/components/quote/QuoteResultDisplay'
import EstimateDocument from '@/components/quote/EstimateDocument'
import { formatCurrency } from '@/lib/utils'
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
  const isEmbed = searchParams.get('embed') === 'true'

  const form = useQuoteForm()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [validatedDiscount, setValidatedDiscount] = useState<DiscountCode | null>(null)
  const [quoteResult, setQuoteResult] = useState<ReturnType<typeof calculateQuoteWithFallback> | null>(null)
  const [showEstimate, setShowEstimate] = useState(false)
  const [, setLeadRef] = useState<string | null>(null)

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

  const availableServices = useMemo(() => {
    const services: ServiceType[] = []
    if (config.show_purchase_section) services.push('purchase')
    if (config.show_sale_section) services.push('sale')
    if (config.show_purchase_section && config.show_sale_section) services.push('sale_purchase')
    if (config.show_remortgage_section) services.push('remortgage')
    return services
  }, [config])

  // Embed height publishing
  useEffect(() => {
    if (!isEmbed) return
    const interval = setInterval(() => {
      const height = document.body.scrollHeight
      window.parent.postMessage({ type: 'conveyquote-resize', height }, '*')
    }, 500)
    return () => clearInterval(interval)
  }, [isEmbed])

  function checkManualReview(): boolean {
    if (!firm) return false
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
    const result = calculateQuoteWithFallback(formData, bands, extras, validatedDiscount)
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
      discount_code_id: validatedDiscount?.id || null,
    }

    try {
      const { data, error } = await supabase.functions.invoke('create-public-lead', {
        body: {
          lead: leadPayload,
          discountCodeId: validatedDiscount?.id || null,
          totals: isReview ? undefined : {
            subtotal: result.breakdown.subtotal,
            vatTotal: result.breakdown.vatAmount,
            grandTotal: result.breakdown.grandTotal,
          },
          quoteItems: isReview ? undefined : result.breakdown.items.map((item, i) => ({
            description: item.description,
            amount: item.amount,
            is_vatable: item.is_vatable,
            item_type: item.item_type,
            sort_order: i,
          })),
        },
      })

      if (error) throw error

      setQuoteResult(result)
      setLeadRef(data?.instructionRef || data?.id || null)
      setSubmitted(true)
    } catch (err) {
      // Fallback: insert lead directly if edge function unavailable
      const { data: lead, error: insertError } = await supabase
        .from('leads')
        .insert(leadPayload)
        .select('id')
        .single()

      if (insertError) {
        toast.error('Failed to submit. Please try again.')
        setSubmitting(false)
        return
      }

      setQuoteResult(result)
      setLeadRef(lead?.id || null)
      setSubmitted(true)
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

  // Submitted state
  if (submitted && quoteResult) {
    return (
      <div className={`min-h-screen bg-muted/30 ${isEmbed ? 'p-4' : 'py-8 px-4'}`}>
        <div className="max-w-2xl mx-auto">
          {!isEmbed && (
            <div className="text-center mb-8">
              <Scale className="h-8 w-8 mx-auto mb-2" style={{ color: primaryColor }} />
              <h1 className="text-2xl font-bold" style={{ color: primaryColor }}>{firm.name}</h1>
            </div>
          )}
          <div className="bg-card rounded-xl border border-border p-8 shadow-sm">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 mb-4">
                <Send className="h-7 w-7 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {quoteResult.noMatchFallback ? 'Enquiry Submitted' : 'Your Quote'}
              </h2>
              <p className="text-muted-foreground mt-1">
                {quoteResult.noMatchFallback
                  ? 'We will review your details and get in touch shortly.'
                  : 'Here is your conveyancing quote estimate.'}
              </p>
            </div>

            <QuoteResultDisplay
              breakdown={quoteResult.breakdown}
              noMatchFallback={quoteResult.noMatchFallback}
              firmName={firm.name}
            />

            {!quoteResult.noMatchFallback && firm.show_estimate_document && (
              <div className="mt-6 flex gap-3 justify-center">
                <button
                  onClick={() => setShowEstimate(!showEstimate)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  <FileText className="h-4 w-4" />
                  {showEstimate ? 'Hide' : 'View'} Estimate
                </button>
              </div>
            )}

            {showEstimate && (
              <div className="mt-6">
                <EstimateDocument
                  firmName={firm.name}
                  leadName={`${form.contact.first_name} ${form.contact.surname}`}
                  items={quoteResult.breakdown.items}
                  totals={{
                    subtotal: quoteResult.breakdown.subtotal,
                    discountTotal: quoteResult.breakdown.discountTotal,
                    vatAmount: quoteResult.breakdown.vatAmount,
                    grandTotal: quoteResult.breakdown.grandTotal,
                  }}
                  documentType="estimate"
                  serviceType={form.serviceType}
                />
              </div>
            )}

            {firm.disclaimer_text && (
              <p className="mt-6 text-xs text-muted-foreground text-center">{firm.disclaimer_text}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-muted/30 ${isEmbed ? 'p-4' : 'py-8 px-4'}`}>
      <div className="max-w-2xl mx-auto">
        {!isEmbed && (
          <div className="text-center mb-8">
            {firm.logo_url ? (
              <img src={firm.logo_url} alt={firm.name} className="h-12 mx-auto mb-2" />
            ) : (
              <Scale className="h-8 w-8 mx-auto mb-2" style={{ color: primaryColor }} />
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
          {config.show_discount_code && (
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
