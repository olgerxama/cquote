import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Scale, CheckCircle2 } from 'lucide-react'
import { DEFAULT_PUBLIC_FORM_CONFIG } from '@/types'
import type { Firm, Lead, PublicFormConfig, Quote, QuoteItem } from '@/types'

interface InstructionContext {
  firm: Firm
  lead: Lead
  quote: Quote | null
  items: QuoteItem[]
  reference: string
}

export default function InstructPage() {
  const { firmSlug } = useParams<{ firmSlug: string }>()
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref') || ''

  const [submitted, setSubmitted] = useState(false)
  const [details, setDetails] = useState({
    client_type: 'individual',
    full_name: '',
    email: '',
    phone: '',
    full_address: '',
    address_line_1: '',
    address_line_2: '',
    town_city: '',
    postcode: '',
    date_of_birth: '',
    national_insurance: '',
    id_type: 'passport',
    id_number: '',
    id_check_consent: false,
    source_of_funds: '',
    additional_notes: '',
  })

  const { data: context, isLoading } = useQuery({
    queryKey: ['instruction-context', firmSlug, ref],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('resolve-instruction-context', {
        body: { firmSlug, ref },
      })
      if (error) throw error
      return data as InstructionContext
    },
    enabled: !!firmSlug && !!ref,
    retry: false,
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!context) throw new Error('No context')
      const { error } = await supabase.functions.invoke('submit-instruction', {
        body: {
          firmSlug,
          leadId: context.lead.id,
          details,
        },
      })
      if (error) throw error
    },
    onSuccess: () => {
      setSubmitted(true)
      toast.success('Instruction submitted successfully')
    },
    onError: () => {
      toast.error('Failed to submit. Please try again.')
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!context) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Instruction Not Found</h1>
          <p className="mt-2 text-muted-foreground">This instruction link may have expired or is invalid.</p>
        </div>
      </div>
    )
  }

  const { firm, quote, items } = context
  const primaryColor = firm.primary_color || '#1e3a5f'
  const instructionConfig = {
    ...DEFAULT_PUBLIC_FORM_CONFIG,
    ...((firm.public_form_config as Partial<PublicFormConfig> | null) || {}),
  }
  const hiddenFields = new Set(instructionConfig.instruction_hidden_fields || [])
  const requiredFields = new Set(instructionConfig.instruction_required_fields || [])

  if (submitted) {
    return (
      <div className="min-h-screen bg-muted/30 py-8 px-4">
        <div className="max-w-xl mx-auto text-center">
          <Scale className="h-8 w-8 mx-auto mb-2" style={{ color: primaryColor }} />
          <h1 className="text-2xl font-bold mb-4" style={{ color: primaryColor }}>{firm.name}</h1>
          <div className="bg-card rounded-xl border border-border p-8 shadow-sm">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground">Instruction Submitted</h2>
            <p className="mt-2 text-muted-foreground">
              Thank you. Your instruction details have been sent to {firm.name}. They will be in touch shortly.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <Scale className="h-8 w-8 mx-auto mb-2" style={{ color: primaryColor }} />
          <h1 className="text-2xl font-bold" style={{ color: primaryColor }}>{firm.name}</h1>
          <p className="text-muted-foreground mt-1">Complete your instruction details</p>
        </div>

        {/* Quote summary */}
        {quote && items.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Your Quote Summary</h3>
            <div className="space-y-1">
              {items.filter((i) => i.amount > 0).map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.description}</span>
                  <span className="text-foreground">{formatCurrency(item.amount)}</span>
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2 flex justify-between text-sm font-semibold">
                <span>Total (inc. VAT)</span>
                <span>{formatCurrency(quote.grand_total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Instruction form */}
        <form
          onSubmit={(e) => { e.preventDefault(); submitMutation.mutate() }}
          className="bg-card rounded-xl border border-border p-6 sm:p-8 shadow-sm space-y-4"
        >
          <h2 className="text-lg font-semibold text-foreground">Instruction Details</h2>
          <p className="text-sm text-muted-foreground">
            Please provide the following details to proceed with your instruction to {firm.name}.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!hiddenFields.has('client_type') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Client Type {requiredFields.has('client_type') ? '*' : ''}
                </label>
                <select
                  required={requiredFields.has('client_type')}
                  value={details.client_type}
                  onChange={(e) => setDetails({ ...details, client_type: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="individual">Individual</option>
                  <option value="joint">Joint</option>
                  <option value="company">Company</option>
                </select>
              </div>
            )}
            {!hiddenFields.has('full_name') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Full Name {requiredFields.has('full_name') ? '*' : ''}
                </label>
                <input
                  required={requiredFields.has('full_name')}
                  value={details.full_name}
                  onChange={(e) => setDetails({ ...details, full_name: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={context.lead.full_name || ''}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!hiddenFields.has('email') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Email {requiredFields.has('email') ? '*' : ''}
                </label>
                <input
                  type="email"
                  required={requiredFields.has('email')}
                  value={details.email}
                  onChange={(e) => setDetails({ ...details, email: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={context.lead.email || ''}
                />
              </div>
            )}
            {!hiddenFields.has('phone') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Phone {requiredFields.has('phone') ? '*' : ''}
                </label>
                <input
                  required={requiredFields.has('phone')}
                  value={details.phone}
                  onChange={(e) => setDetails({ ...details, phone: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={context.lead.phone || ''}
                />
              </div>
            )}
          </div>

          {!hiddenFields.has('full_address') && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Full Address {requiredFields.has('full_address') ? '*' : ''}
              </label>
              <textarea
                required={requiredFields.has('full_address')}
                rows={3}
                value={details.full_address}
                onChange={(e) => setDetails({ ...details, full_address: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Enter your full address"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!hiddenFields.has('address_line_1') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Address Line 1 {requiredFields.has('address_line_1') ? '*' : ''}
                </label>
                <input
                  required={requiredFields.has('address_line_1')}
                  value={details.address_line_1}
                  onChange={(e) => setDetails({ ...details, address_line_1: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            {!hiddenFields.has('address_line_2') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Address Line 2 {requiredFields.has('address_line_2') ? '*' : ''}
                </label>
                <input
                  required={requiredFields.has('address_line_2')}
                  value={details.address_line_2}
                  onChange={(e) => setDetails({ ...details, address_line_2: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!hiddenFields.has('town_city') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Town / City {requiredFields.has('town_city') ? '*' : ''}
                </label>
                <input
                  required={requiredFields.has('town_city')}
                  value={details.town_city}
                  onChange={(e) => setDetails({ ...details, town_city: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            {!hiddenFields.has('postcode') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Postcode {requiredFields.has('postcode') ? '*' : ''}
                </label>
                <input
                  required={requiredFields.has('postcode')}
                  value={details.postcode}
                  onChange={(e) => setDetails({ ...details, postcode: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!hiddenFields.has('date_of_birth') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Date of Birth {requiredFields.has('date_of_birth') ? '*' : ''}
                </label>
                <input
                  type="date"
                  required={requiredFields.has('date_of_birth')}
                  value={details.date_of_birth}
                  onChange={(e) => setDetails({ ...details, date_of_birth: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            {!hiddenFields.has('national_insurance') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  National Insurance Number {requiredFields.has('national_insurance') ? '*' : ''}
                </label>
                <input
                  required={requiredFields.has('national_insurance')}
                  value={details.national_insurance}
                  onChange={(e) => setDetails({ ...details, national_insurance: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g. QQ 12 34 56 A"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!hiddenFields.has('id_type') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  ID Type {requiredFields.has('id_type') ? '*' : ''}
                </label>
                <select
                  required={requiredFields.has('id_type')}
                  value={details.id_type}
                  onChange={(e) => setDetails({ ...details, id_type: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="passport">Passport</option>
                  <option value="driving_licence">Driving Licence</option>
                  <option value="national_id">National ID Card</option>
                </select>
              </div>
            )}
            {!hiddenFields.has('id_number') && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  ID Number {requiredFields.has('id_number') ? '*' : ''}
                </label>
                <input
                  required={requiredFields.has('id_number')}
                  value={details.id_number}
                  onChange={(e) => setDetails({ ...details, id_number: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
          </div>

          {!hiddenFields.has('additional_notes') && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Additional Notes {requiredFields.has('additional_notes') ? '*' : ''}
              </label>
              <textarea
                rows={3}
                required={requiredFields.has('additional_notes')}
                value={details.additional_notes}
                onChange={(e) => setDetails({ ...details, additional_notes: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Anything else we should know..."
              />
            </div>
          )}

          {!hiddenFields.has('source_of_funds') && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Source of Funds {requiredFields.has('source_of_funds') ? '*' : ''}
              </label>
              <textarea
                rows={3}
                required={requiredFields.has('source_of_funds')}
                value={details.source_of_funds}
                onChange={(e) => setDetails({ ...details, source_of_funds: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="How will the transaction be funded?"
              />
            </div>
          )}

          {!hiddenFields.has('id_check_consent') && (
            <label className="flex items-start gap-3 rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <input
                type="checkbox"
                required={requiredFields.has('id_check_consent')}
                checked={details.id_check_consent}
                onChange={(e) => setDetails({ ...details, id_check_consent: e.target.checked })}
                className="mt-1"
              />
              <span>
                I consent to electronic identity and AML checks
                {requiredFields.has('id_check_consent') ? ' *' : ''}
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="w-full rounded-lg py-3 text-base font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {submitMutation.isPending ? 'Submitting...' : 'Submit Instruction'}
          </button>
        </form>
      </div>
    </div>
  )
}
