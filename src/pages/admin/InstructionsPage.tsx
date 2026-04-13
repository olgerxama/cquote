import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Lead, Quote, QuoteItem, ServiceType } from '@/types'
import { SERVICE_TYPE_LABELS as ServiceLabels, ANSWER_LABELS as AnswerLabels } from '@/types'
import { ClipboardList, X } from 'lucide-react'

export default function InstructionsPage() {
  const { firmId } = useAuth()
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['instructions', firmId],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('*, quotes(reference_code)')
        .eq('firm_id', firmId!)
        .not('instruction_submitted_at', 'is', null)
        .order('instruction_submitted_at', { ascending: false })
      return (data ?? []) as Lead[]
    },
    enabled: !!firmId,
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Instructions</h1>
        <p className="text-muted-foreground mt-1">Leads that have submitted instruction forms.</p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading instructions...</div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No instructions received yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Ref</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Service</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Instruction Date</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const instructionDate = lead.instruction_submitted_at
                    ? formatDate(lead.instruction_submitted_at)
                    : '—'

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-5 py-3 text-sm text-muted-foreground font-mono">
                        {(() => {
                          const quotes = (lead as unknown as Record<string, unknown>).quotes as { reference_code: string | null }[] | null
                          const ref = quotes?.[0]?.reference_code
                          return ref ? <span className="text-xs">{ref}</span> : <span className="text-xs text-muted-foreground/50">—</span>
                        })()}
                      </td>
                      <td className="px-5 py-3 text-sm font-medium text-foreground">{lead.full_name}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{lead.email}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground capitalize">
                        {ServiceLabels[lead.service_type as ServiceType] ?? lead.service_type}
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{instructionDate}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedLead && (
        <InstructionDetailDialog
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </div>
  )
}

// ---------- Instruction Detail Dialog ----------
function InstructionDetailDialog({
  lead,
  onClose,
}: {
  lead: Lead
  onClose: () => void
}) {
  const answers = lead.answers as Record<string, any>
  const instructionData = answers.instruction_data as Record<string, any> | undefined

  // Fetch quote for this lead
  const { data: quote } = useQuery({
    queryKey: ['instruction-quote', lead.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('quotes')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as Quote | null
    },
  })

  const { data: quoteItems = [] } = useQuery({
    queryKey: ['instruction-quote-items', quote?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quote!.id)
        .order('sort_order')
      return (data ?? []) as QuoteItem[]
    },
    enabled: !!quote?.id,
  })

  // Collect instruction fields (exclude meta keys)
  const instrEntries = instructionData
    ? Object.entries(instructionData).filter(([k]) => k !== 'submitted_at')
    : []

  // All answer entries
  const allAnswers = Object.entries(answers).filter(
    ([k]) => !['instruction_submitted_at', 'instruction_data'].includes(k)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] bg-card rounded-xl border border-border shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-foreground">Instruction Details</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Contact */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Contact</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Name</span>
                <p className="font-medium text-foreground">{lead.full_name}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Email</span>
                <p className="font-medium text-foreground">{lead.email}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Phone</span>
                <p className="font-medium text-foreground">{lead.phone || '—'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Service</span>
                <p className="font-medium text-foreground capitalize">
                  {ServiceLabels[lead.service_type as ServiceType] ?? lead.service_type}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Instruction Date</span>
                <p className="font-medium text-foreground">
                  {lead.instruction_submitted_at
                    ? formatDate(lead.instruction_submitted_at)
                    : '—'}
                </p>
              </div>
            </div>
          </section>

          {/* Instruction Data */}
          {instrEntries.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Instruction Information</h3>
              <div className="rounded-lg border border-border divide-y divide-border">
                {instrEntries.map(([key, val]) => (
                  <div key={key} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{AnswerLabels[key] || key.replace(/_/g, ' ')}</span>
                    <span className="text-foreground font-medium text-right max-w-[60%]">{String(val)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Form Answers */}
          {allAnswers.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Form Answers</h3>
              <div className="rounded-lg border border-border divide-y divide-border">
                {allAnswers.map(([key, val]) => (
                  <div key={key} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{AnswerLabels[key] || key}</span>
                    <span className="text-foreground font-medium">{String(val)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Quote Preview */}
          {quote && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Quote Preview</h3>
              <div className="rounded-lg border border-border divide-y divide-border">
                {quoteItems.map((item) => (
                  <div key={item.id} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-foreground">{item.description}</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(item.amount)}
                      {item.is_vatable && <span className="text-xs text-muted-foreground ml-1">+VAT</span>}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-muted/50 p-4 mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(quote.subtotal)}</span>
                </div>
                {quote.discount_total > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(quote.discount_total)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT</span>
                  <span className="font-medium">{formatCurrency(quote.vat_total)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold border-t border-border pt-1 mt-1">
                  <span>Grand Total</span>
                  <span>{formatCurrency(quote.grand_total)}</span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
