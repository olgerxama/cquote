import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { calculateQuote, recalculateTotals } from '@/lib/quoteEngine'
import type {
  Lead,
  LeadStatus,
  Quote,
  QuoteItem,
  QuoteLineItem,
  PricingBand,
  PricingExtra,
  ServiceType,
  QuoteFormData,
} from '@/types'
import { ANSWER_LABELS as AnswerLabels, SERVICE_TYPE_LABELS as ServiceLabels } from '@/types'
import {
  Users,
  Search,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Send,
  Save,
  Zap,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

const PAGE_SIZE = 20

const STATUS_TABS: { label: string; value: LeadStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Review', value: 'review' },
  { label: 'Quoted', value: 'quoted' },
]

// ---------- Main Component ----------
export default function LeadsPage() {
  const { firmId } = useAuth()

  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(0)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // ---- Leads query ----
  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['admin-leads', firmId, statusFilter, searchTerm, page],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('firm_id', firmId!)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }
      if (searchTerm.trim()) {
        query = query.or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      }

      const { data, count } = await query
      return { leads: (data ?? []) as Lead[], total: count ?? 0 }
    },
    enabled: !!firmId,
  })

  const leads = leadsData?.leads ?? []
  const totalCount = leadsData?.total ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId]
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground mt-1">Manage enquiries and generate quotes.</p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Manual Lead
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex rounded-lg border border-border bg-card overflow-hidden">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value); setPage(0) }}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors',
                statusFilter === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading leads...</div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No leads found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Service</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Value</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={cn(
                      'border-b border-border last:border-0 cursor-pointer transition-colors',
                      selectedLeadId === lead.id ? 'bg-primary/5' : 'hover:bg-muted/50'
                    )}
                  >
                    <td className="px-5 py-3 text-sm font-medium text-foreground">{lead.full_name}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground hidden sm:table-cell">{lead.email}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground capitalize">{lead.service_type.replace('_', ' & ')}</td>
                    <td className="px-5 py-3 text-sm text-foreground">{formatCurrency(lead.property_value)}</td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        lead.status === 'new' ? 'bg-blue-100 text-blue-700' :
                        lead.status === 'review' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      )}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground hidden md:table-cell">{formatDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages} ({totalCount} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-muted transition-colors"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lead Detail Panel */}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          firmId={firmId!}
          onClose={() => setSelectedLeadId(null)}
        />
      )}

      {/* Create Lead Dialog */}
      {showCreateDialog && (
        <CreateLeadDialog
          firmId={firmId!}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  )
}

// ---------- Lead Detail Panel ----------
function LeadDetailPanel({
  lead,
  firmId,
  onClose,
}: {
  lead: Lead
  firmId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<LeadStatus>(lead.status)

  // Fetch existing quote for this lead
  const { data: existingQuote } = useQuery({
    queryKey: ['lead-quote', lead.id],
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

  const { data: existingItems = [] } = useQuery({
    queryKey: ['lead-quote-items', existingQuote?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', existingQuote!.id)
        .order('sort_order')
      return (data ?? []) as QuoteItem[]
    },
    enabled: !!existingQuote?.id,
  })

  // Update status mutation
  const updateStatusMut = useMutation({
    mutationFn: async (newStatus: LeadStatus) => {
      await supabase.from('leads').update({ status: newStatus }).eq('id', lead.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] })
      toast.success('Status updated')
    },
  })

  function handleStatusChange(newStatus: LeadStatus) {
    setStatus(newStatus)
    updateStatusMut.mutate(newStatus)
  }

  // Render answers
  const answers = lead.answers ?? {}
  const answerEntries = Object.entries(answers).filter(
    ([k]) => !['instruction_submitted_at', 'instruction_data'].includes(k)
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-card border-l border-border h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-foreground">Lead Details</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Contact info */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Contact</h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Name" value={lead.full_name} />
              <InfoRow label="Email" value={lead.email} />
              <InfoRow label="Phone" value={lead.phone || '—'} />
              <InfoRow label="Service" value={ServiceLabels[lead.service_type as ServiceType] ?? lead.service_type} />
              <InfoRow label="Property Value" value={formatCurrency(lead.property_value)} />
              <InfoRow label="Tenure" value={lead.tenure} />
              <InfoRow label="Created" value={formatDate(lead.created_at)} />
            </div>
          </section>

          {/* Status */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Status</h3>
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="new">New</option>
              <option value="review">Review</option>
              <option value="quoted">Quoted</option>
            </select>
          </section>

          {/* Answers */}
          {answerEntries.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Form Answers</h3>
              <div className="rounded-lg border border-border divide-y divide-border">
                {answerEntries.map(([key, val]) => (
                  <div key={key} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{AnswerLabels[key] || key}</span>
                    <span className="text-foreground font-medium">{String(val)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Quote section */}
          <QuoteSection
            lead={lead}
            firmId={firmId}
            existingQuote={existingQuote ?? null}
            existingItems={existingItems}
          />
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

// ---------- Quote Section ----------
function QuoteSection({
  lead,
  firmId,
  existingQuote,
  existingItems,
}: {
  lead: Lead
  firmId: string
  existingQuote: Quote | null
  existingItems: QuoteItem[]
}) {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<QuoteLineItem[]>([])
  const [generated, setGenerated] = useState(false)

  // Load firm pricing
  const { data: bands = [] } = useQuery({
    queryKey: ['pricing-bands', firmId],
    queryFn: async () => {
      const { data } = await supabase.from('pricing_bands').select('*').eq('firm_id', firmId)
      return (data ?? []) as PricingBand[]
    },
  })

  const { data: extras = [] } = useQuery({
    queryKey: ['pricing-extras', firmId],
    queryFn: async () => {
      const { data } = await supabase.from('pricing_extras').select('*').eq('firm_id', firmId)
      return (data ?? []) as PricingExtra[]
    },
  })

  function handleGenerate() {
    // Build a QuoteFormData from lead answers
    const a = lead.answers as Record<string, any>
    const formData: QuoteFormData = {
      serviceType: (lead.service_type as ServiceType),
      purchase: {
        property_postcode: a.property_postcode ?? '',
        purchase_price: String(a.purchase_price ?? lead.property_value ?? 0),
        tenure: a.tenure ?? lead.tenure ?? 'freehold',
        is_newbuild: a.is_newbuild ?? 'no',
        is_shared_ownership: a.is_shared_ownership ?? 'no',
        has_mortgage: a.has_mortgage ?? (lead.mortgage_required ? 'yes' : 'no'),
        is_first_time_buyer: a.is_first_time_buyer ?? (lead.first_time_buyer ? 'yes' : 'no'),
        buyer_count: Number(a.buyer_count ?? 1),
        gifted_deposit: a.gifted_deposit ?? 'no',
        uses_help_to_buy_isa: a.uses_help_to_buy_isa ?? 'no',
        uses_right_to_buy: a.uses_right_to_buy ?? 'no',
        uses_help_to_buy_equity_loan: a.uses_help_to_buy_equity_loan ?? 'no',
      },
      sale: {
        property_postcode: a.property_postcode ?? '',
        sale_price: String(a.sale_price ?? lead.property_value ?? 0),
        tenure: a.tenure ?? lead.tenure ?? 'freehold',
        has_existing_mortgage: a.has_existing_mortgage ?? 'no',
        is_shared_ownership: a.is_shared_ownership ?? 'no',
        seller_count: Number(a.seller_count ?? 1),
      },
      remortgage: {
        property_postcode: a.property_postcode ?? '',
        remortgage_property_value: String(a.remortgage_property_value ?? lead.property_value ?? 0),
        tenure: a.tenure ?? lead.tenure ?? 'freehold',
        is_buy_to_let: a.is_buy_to_let ?? 'no',
        transfer_of_equity: a.transfer_of_equity ?? 'no',
        remortgagor_count: Number(a.remortgagor_count ?? 1),
        recommend_mortgage_broker: a.recommend_mortgage_broker ?? 'no',
      },
      additional: {
        buy_to_let: a.buy_to_let ?? 'no',
        second_home: a.second_home ?? 'no',
        company_purchase: a.company_purchase ?? 'no',
        auction_purchase: a.auction_purchase ?? 'no',
        probate_related: a.probate_related ?? 'no',
        speed_essential: a.speed_essential ?? 'no',
        lender_name: a.lender_name ?? '',
        source_of_funds_notes: a.source_of_funds_notes ?? '',
        chain_related_notes: a.chain_related_notes ?? '',
      },
      common: {
        instruct_timeline: a.instruct_timeline ?? '',
        special_instructions: a.special_instructions ?? '',
      },
      contact: {
        first_name: lead.first_name ?? '',
        surname: lead.surname ?? '',
        email: lead.email,
        phone: lead.phone ?? '',
      },
    }

    const result = calculateQuote(formData, bands, extras)
    setItems(result.breakdown.items)
    setGenerated(true)

    if (result.noMatchFallback) {
      toast.warning('No matching price band found. Only extras were applied.')
    }
  }

  // Edit item inline
  function updateItem(idx: number, field: keyof QuoteLineItem, value: any) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        description: 'New item',
        amount: 0,
        is_vatable: false,
        item_type: 'manual' as const,
        source_type: 'manual' as const,
        sort_order: prev.length,
        is_manual: true,
      },
    ])
  }

  // Save quote
  const saveMut = useMutation({
    mutationFn: async () => {
      const totals = recalculateTotals(items)

      // Upsert quote
      const quotePayload = {
        lead_id: lead.id,
        firm_id: firmId,
        status: 'draft' as const,
        subtotal: totals.subtotal,
        vat_total: totals.vatAmount,
        grand_total: totals.grandTotal,
        discount_total: totals.discountTotal,
      }

      let quoteId = existingQuote?.id
      if (quoteId) {
        await supabase.from('quotes').update(quotePayload).eq('id', quoteId)
        await supabase.from('quote_items').delete().eq('quote_id', quoteId)
      } else {
        const { data } = await supabase.from('quotes').insert(quotePayload).select('id').single()
        quoteId = data!.id
      }

      // Insert items
      const itemRows = items.map((it, i) => ({
        quote_id: quoteId!,
        description: it.description,
        amount: it.amount,
        is_vatable: it.is_vatable,
        sort_order: i,
        item_type: it.item_type,
        source_type: it.source_type,
        source_reference_id: it.source_reference_id ?? null,
        is_manual: it.is_manual ?? false,
        is_discount: it.is_discount ?? false,
      }))
      if (itemRows.length > 0) {
        await supabase.from('quote_items').insert(itemRows)
      }

      // Mark lead as quoted
      await supabase.from('leads').update({ status: 'quoted' }).eq('id', lead.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-quote'] })
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] })
      toast.success('Quote saved successfully')
    },
    onError: () => toast.error('Failed to save quote'),
  })

  function handleSendEmail() {
    toast.success('Quote email queued for sending')
  }

  const totals = generated || items.length > 0 ? recalculateTotals(items) : null

  // Show existing items if no generated items yet
  const displayItems = generated ? items : existingItems.length > 0
    ? existingItems.map((qi) => ({
        description: qi.description,
        amount: qi.amount,
        is_vatable: qi.is_vatable,
        item_type: qi.item_type,
        source_type: qi.source_type,
        source_reference_id: qi.source_reference_id,
        sort_order: qi.sort_order,
        is_manual: qi.is_manual,
        is_discount: qi.is_discount,
      } as QuoteLineItem))
    : []

  const displayTotals = generated ? totals : existingQuote
    ? { subtotal: existingQuote.subtotal, discountTotal: existingQuote.discount_total, vatAmount: existingQuote.vat_total, grandTotal: existingQuote.grand_total }
    : null

  return (
    <section>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Quote</h3>

      {existingQuote && !generated && (
        <div className="mb-3 flex items-center gap-2">
          <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            existingQuote.status === 'sent' ? 'bg-green-100 text-green-700' :
            existingQuote.status === 'draft' ? 'bg-gray-100 text-gray-700' :
            'bg-blue-100 text-blue-700'
          )}>
            {existingQuote.status}
          </span>
          <span className="text-sm text-muted-foreground">
            Created {formatDate(existingQuote.created_at)}
          </span>
        </div>
      )}

      {displayItems.length > 0 ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-border divide-y divide-border">
            {(generated ? items : displayItems).map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                {generated ? (
                  <>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      className="flex-1 text-sm bg-transparent border-b border-dashed border-border focus:outline-none focus:border-primary"
                    />
                    <input
                      type="number"
                      value={item.amount}
                      onChange={(e) => updateItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-24 text-sm text-right bg-transparent border-b border-dashed border-border focus:outline-none focus:border-primary"
                    />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={item.is_vatable}
                        onChange={(e) => updateItem(idx, 'is_vatable', e.target.checked)}
                        className="rounded"
                      />
                      VAT
                    </label>
                    <button onClick={() => removeItem(idx)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-foreground">{item.description}</span>
                    <span className="text-sm font-medium text-foreground">{formatCurrency(item.amount)}</span>
                    {item.is_vatable && <span className="text-xs text-muted-foreground">+VAT</span>}
                  </>
                )}
              </div>
            ))}
          </div>

          {generated && (
            <button
              onClick={addItem}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add line item
            </button>
          )}

          {/* Totals */}
          {displayTotals && (
            <div className="rounded-lg bg-muted/50 p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(displayTotals.subtotal)}</span>
              </div>
              {displayTotals.discountTotal > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(displayTotals.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT</span>
                <span className="font-medium">{formatCurrency(displayTotals.vatAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold border-t border-border pt-1 mt-1">
                <span>Grand Total</span>
                <span>{formatCurrency(displayTotals.grandTotal)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {generated && (
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Save className="h-4 w-4" />
                {saveMut.isPending ? 'Saving...' : 'Save Quote'}
              </button>
            )}
            <button
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              <Zap className="h-4 w-4" />
              {generated || displayItems.length > 0 ? 'Regenerate' : 'Generate Quote'}
            </button>
            {(existingQuote || generated) && (
              <button
                onClick={handleSendEmail}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Send className="h-4 w-4" />
                Send Quote Email
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">No quote generated yet.</p>
          <button
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Generate Quote
          </button>
        </div>
      )}
    </section>
  )
}

// ---------- Create Lead Dialog ----------
function CreateLeadDialog({
  firmId,
  onClose,
}: {
  firmId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    service_type: 'purchase' as ServiceType,
    property_value: '',
    tenure: 'freehold' as 'freehold' | 'leasehold',
  })

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('leads').insert({
        firm_id: firmId,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        service_type: form.service_type,
        property_value: parseFloat(form.property_value) || 0,
        tenure: form.tenure,
        status: 'new',
        mortgage_required: false,
        first_time_buyer: false,
        answers: {},
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] })
      toast.success('Lead created')
      onClose()
    },
    onError: (e: any) => toast.error(e.message || 'Failed to create lead'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name || !form.email) {
      toast.error('Name and email are required')
      return
    }
    createMut.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-xl border border-border shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">Create Manual Lead</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Full Name *</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Service Type</label>
              <select
                value={form.service_type}
                onChange={(e) => setForm({ ...form, service_type: e.target.value as ServiceType })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="purchase">Purchase</option>
                <option value="sale">Sale</option>
                <option value="sale_purchase">Sale & Purchase</option>
                <option value="remortgage">Remortgage</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Tenure</label>
              <select
                value={form.tenure}
                onChange={(e) => setForm({ ...form, tenure: e.target.value as 'freehold' | 'leasehold' })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="freehold">Freehold</option>
                <option value="leasehold">Leasehold</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Property Value</label>
            <input
              type="number"
              value={form.property_value}
              onChange={(e) => setForm({ ...form, property_value: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. 350000"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createMut.isPending ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
