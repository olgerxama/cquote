import { useState, useMemo, useEffect } from 'react'
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
  ArrowUpDown,
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
  const { firmId, firmRole, isPlatformOwner } = useAuth()
  const canManage = firmRole === 'admin' || isPlatformOwner

  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateSortOrder, setDateSortOrder] = useState<'latest' | 'earliest'>('latest')
  const [page, setPage] = useState(0)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // ---- Leads query ----
  // Search matches name / email AND any quote reference_code on the firm's quotes,
  // so staff can paste a CQ-XXXX reference and land straight on the correct lead.
  // Leads with a submitted instruction are surfaced first.
  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['admin-leads', firmId, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*, quotes(reference_code)')
        .eq('firm_id', firmId!)
        // Instructed leads first, then newest.
        .order('instruction_submitted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`)
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`)

      const { data } = await query
      return (data ?? []) as Lead[]
    },
    enabled: !!firmId,
  })

  const leads = leadsData ?? []

  const filteredLeads = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return leads

    return leads.filter((lead) => {
      const quotes = (lead as unknown as Record<string, unknown>).quotes as { reference_code: string | null }[] | null
      const ref = quotes?.[0]?.reference_code ?? ''
      const createdDate = formatDate(lead.created_at).toLowerCase()
      const instructionDate = lead.instruction_submitted_at ? formatDate(lead.instruction_submitted_at).toLowerCase() : ''
      const price = formatCurrency(lead.property_value || 0).toLowerCase()
      const rawPrice = String(lead.property_value ?? '').toLowerCase()

      return [
        lead.full_name,
        lead.email,
        lead.service_type,
        ref,
        createdDate,
        instructionDate,
        price,
        rawPrice,
      ]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(term))
    })
  }, [leads, searchTerm])

  const sortedLeads = useMemo(() => {
    const copy = [...filteredLeads]
    copy.sort((a, b) => {
      const aTime = new Date(a.created_at).getTime()
      const bTime = new Date(b.created_at).getTime()
      return dateSortOrder === 'latest' ? bTime - aTime : aTime - bTime
    })
    return copy
  }, [filteredLeads, dateSortOrder])

  const totalCount = sortedLeads.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const pagedLeads = useMemo(
    () => sortedLeads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sortedLeads, page]
  )

  const selectedLead = useMemo(
    () => sortedLeads.find((l) => l.id === selectedLeadId) ?? null,
    [sortedLeads, selectedLeadId]
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground mt-1">Manage enquiries and generate quotes.</p>
          {!canManage && (
            <p className="mt-2 text-sm text-amber-700">
              You have read-only access. Editing, quote sending, and manual lead creation are disabled.
            </p>
          )}
        </div>
        <button
          onClick={() => {
            if (!canManage) {
              toast.error('Read-only accounts cannot create leads.')
              return
            }
            setShowCreateDialog(true)
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          disabled={!canManage}
        >
          <Plus className="h-4 w-4" />
          Create Manual Lead
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3 mb-5">
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
            placeholder="Search name, email, ref, date, or price..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          type="button"
          onClick={() => { setDateFrom(''); setDateTo(''); setPage(0) }}
          className="self-start rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading leads...</div>
        ) : pagedLeads.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No leads found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Ref</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase hidden sm:table-cell">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Service</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Value</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">
                    <button
                      type="button"
                      onClick={() => {
                        setDateSortOrder((prev) => (prev === 'latest' ? 'earliest' : 'latest'))
                        setPage(0)
                      }}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      title={`Sort by ${dateSortOrder === 'latest' ? 'earliest' : 'latest'}`}
                    >
                      Date
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      <span className="text-[10px] normal-case text-muted-foreground">
                        {dateSortOrder === 'latest' ? 'latest' : 'earliest'}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={cn(
                      'border-b border-border last:border-0 cursor-pointer transition-colors',
                      selectedLeadId === lead.id ? 'bg-primary/5' : 'hover:bg-muted/50'
                    )}
                  >
                    <td className="px-5 py-3 text-sm text-muted-foreground font-mono">
                      {(() => {
                        const quotes = (lead as unknown as Record<string, unknown>).quotes as { reference_code: string | null }[] | null
                        const ref = quotes?.[0]?.reference_code
                        return ref ? <span className="text-xs">{ref}</span> : <span className="text-xs text-muted-foreground/50">—</span>
                      })()}
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span>{lead.full_name}</span>
                        {lead.instruction_submitted_at && (
                          <span
                            title={`Instructed ${formatDate(lead.instruction_submitted_at)}`}
                            className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 uppercase tracking-wide"
                          >
                            Instructed
                          </span>
                        )}
                      </div>
                    </td>
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
          canManage={canManage}
          onClose={() => setSelectedLeadId(null)}
        />
      )}

      {/* Create Lead Dialog */}
      {showCreateDialog && (
        <CreateLeadDialog
          firmId={firmId!}
          canManage={canManage}
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
  canManage,
  onClose,
}: {
  lead: Lead
  firmId: string
  canManage: boolean
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
    if (!canManage) {
      toast.error('Read-only accounts cannot change lead status.')
      return
    }
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
              disabled={!canManage}
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
            canManage={canManage}
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
  canManage,
}: {
  lead: Lead
  firmId: string
  existingQuote: Quote | null
  existingItems: QuoteItem[]
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<QuoteLineItem[]>([])
  const [dirty, setDirty] = useState(false)
  const [sending, setSending] = useState(false)

  // Hydrate local items from existing quote so admin can edit saved quotes.
  useEffect(() => {
    if (existingItems.length > 0) {
      setItems(
        existingItems.map((qi) => ({
          description: qi.description,
          amount: qi.amount,
          is_vatable: qi.is_vatable,
          item_type: qi.item_type,
          source_type: qi.source_type,
          source_reference_id: qi.source_reference_id,
          sort_order: qi.sort_order,
          is_manual: qi.is_manual,
          is_discount: qi.is_discount,
        }))
      )
      setDirty(false)
    }
  }, [existingItems])

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
        full_address: a.full_address ?? '',
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
    setDirty(true)

    if (result.noMatchFallback) {
      toast.warning('No matching price band found. Only extras were applied.')
    }
  }

  // Edit item inline
  function updateItem(idx: number, field: keyof QuoteLineItem, value: any) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
    setDirty(true)
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
    setDirty(true)
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
    setDirty(true)
  }

  // Save quote — returns the quote id so callers can chain follow-up actions.
  const saveMut = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!canManage) {
        throw new Error('Read-only accounts cannot save quotes.')
      }
      const totals = recalculateTotals(items)

      const quotePayload = {
        lead_id: lead.id,
        firm_id: firmId,
        status: (existingQuote?.status ?? 'draft') as Quote['status'],
        subtotal: totals.subtotal,
        vat_total: totals.vatAmount,
        grand_total: totals.grandTotal,
        discount_total: totals.discountTotal,
      }

      let quoteId = existingQuote?.id
      if (quoteId) {
        const { error } = await supabase.from('quotes').update(quotePayload).eq('id', quoteId)
        if (error) throw error
        await supabase.from('quote_items').delete().eq('quote_id', quoteId)
      } else {
        const { data, error } = await supabase
          .from('quotes')
          .insert(quotePayload)
          .select('id')
          .single()
        if (error) throw error
        quoteId = data!.id
      }

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
        const { error } = await supabase.from('quote_items').insert(itemRows)
        if (error) throw error
      }

      await supabase.from('leads').update({ status: 'quoted' }).eq('id', lead.id)
      return quoteId!
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-quote'] })
      queryClient.invalidateQueries({ queryKey: ['lead-quote-items'] })
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] })
      setDirty(false)
      toast.success('Quote saved')
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save quote'),
  })

  async function handleSendEmail() {
    if (!canManage) {
      toast.error('Read-only accounts cannot send quotes to customers.')
      return
    }
    if (items.length === 0) {
      toast.error('Add at least one line item before sending')
      return
    }
    setSending(true)
    try {
      // Persist any unsaved edits first so the email reflects current state.
      let quoteId = existingQuote?.id
      if (dirty || !quoteId) {
        quoteId = await saveMut.mutateAsync()
      }
      const totals = recalculateTotals(items)
      // Hard client-side timeout so the button can never appear "stuck" — even
      // if the edge function or network misbehaves the user gets a clear error.
      const invokePromise = supabase.functions.invoke('send-quote-email', {
        body: {
          quoteId,
          leadId: lead.id,
          documentType: 'quote',
          totals: {
            subtotal: totals.subtotal,
            vatTotal: totals.vatAmount,
            grandTotal: totals.grandTotal,
          },
        },
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Email request timed out after 45s. Please try again.')), 45000),
      )
      const { data, error } = await Promise.race([invokePromise, timeoutPromise])
      if (error) throw error
      if (data && data.ok === false) {
        throw new Error(data?.error?.message || 'Send failed')
      }
      queryClient.invalidateQueries({ queryKey: ['lead-quote'] })
      toast.success(`Quote email sent to ${lead.email}`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send quote email')
    } finally {
      setSending(false)
    }
  }

  const totals = items.length > 0 ? recalculateTotals(items) : null
  const referenceCode =
    (existingQuote as { reference_code?: string } | null)?.reference_code ||
    (existingQuote ? `CQ-${existingQuote.id.substring(0, 8).toUpperCase()}` : null)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Quote / Invoice
        </h3>
        <div className="flex items-center gap-2">
          {existingQuote && (
            <>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  existingQuote.status === 'sent'
                    ? 'bg-green-100 text-green-700'
                    : existingQuote.status === 'draft'
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-blue-100 text-blue-700',
                )}
              >
                {existingQuote.status}
              </span>
              <span className="text-xs text-muted-foreground">
                Created {formatDate(existingQuote.created_at)}
              </span>
            </>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center bg-muted/20">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No quote yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            Generate a quote from the customer's answers and your firm's pricing.
          </p>
          <button
            onClick={handleGenerate}
            disabled={!canManage}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Generate Quote
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Invoice header */}
          <div className="bg-gradient-to-br from-primary/5 to-transparent px-6 py-5 border-b border-border">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quote Estimate
                </p>
                <p className="text-lg font-bold text-foreground mt-0.5">
                  {referenceCode || 'New quote'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Issued</p>
                <p className="text-sm font-medium text-foreground mt-0.5">
                  {existingQuote?.created_at ? formatDate(existingQuote.created_at) : 'Today'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Billed To
                </p>
                <p className="text-sm font-medium text-foreground">{lead.full_name}</p>
                <p className="text-xs text-muted-foreground">{lead.email}</p>
                {lead.phone && <p className="text-xs text-muted-foreground">{lead.phone}</p>}
              </div>
              <div className="sm:text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Service
                </p>
                <p className="text-sm font-medium text-foreground">
                  {ServiceLabels[lead.service_type as ServiceType] || lead.service_type}
                </p>
                <p className="text-xs text-muted-foreground">
                  Property value: {formatCurrency(lead.property_value || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Line items table */}
          <div className="px-6 pt-5">
            <div className="grid grid-cols-[1fr_70px_110px_28px] items-center gap-3 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              <div>Description</div>
              <div className="text-center">VAT</div>
              <div className="text-right">Amount</div>
              <div></div>
            </div>
            <div className="divide-y divide-border">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_70px_110px_28px] items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors group"
                >
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    disabled={!canManage}
                    className="text-sm bg-transparent border-0 border-b border-transparent group-hover:border-dashed group-hover:border-border focus:outline-none focus:border-primary focus:border-solid px-0 py-0.5"
                  />
                  <label className="flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.is_vatable}
                      onChange={(e) => updateItem(idx, 'is_vatable', e.target.checked)}
                      disabled={!canManage}
                      className="h-4 w-4 rounded border-border"
                    />
                  </label>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-sm text-muted-foreground">£</span>
                    <input
                      type="number"
                      step="0.01"
                      value={item.amount}
                      onChange={(e) => updateItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                      disabled={!canManage}
                      className="w-20 text-sm text-right bg-transparent border-0 border-b border-transparent group-hover:border-dashed group-hover:border-border focus:outline-none focus:border-primary focus:border-solid px-0 py-0.5"
                    />
                  </div>
                  <button
                    onClick={() => removeItem(idx)}
                    disabled={!canManage}
                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addItem}
              disabled={!canManage}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add line item
            </button>
          </div>

          {/* Totals */}
          {totals && (
            <div className="px-6 pb-5 mt-3">
              <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="text-foreground tabular-nums">{formatCurrency(totals.subtotal)}</span>
                </div>
                {totals.discountTotal > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount</span>
                    <span className="tabular-nums">-{formatCurrency(totals.discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>VAT</span>
                  <span className="text-foreground tabular-nums">{formatCurrency(totals.vatAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 mt-2 text-base font-bold text-foreground">
                  <span>Total (inc VAT)</span>
                  <span className="tabular-nums">{formatCurrency(totals.grandTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="border-t border-border bg-muted/30 px-6 py-4 flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => saveMut.mutate()}
                disabled={!canManage || saveMut.isPending || !dirty}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Save className="h-4 w-4" />
                {saveMut.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
              </button>
              <button
                onClick={handleGenerate}
                disabled={!canManage}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-muted transition-colors"
                title="Recalculate from firm pricing"
              >
                <Zap className="h-4 w-4" />
                Regenerate
              </button>
            </div>
            <button
              onClick={handleSendEmail}
              disabled={!canManage || sending || saveMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending…' : 'Send to customer'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------- Create Lead Dialog ----------
function CreateLeadDialog({
  firmId,
  canManage,
  onClose,
}: {
  firmId: string
  canManage: boolean
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
      if (!canManage) {
        throw new Error('Read-only accounts cannot create leads.')
      }
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
    if (!canManage) {
      toast.error('Read-only accounts cannot create leads.')
      return
    }
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
              disabled={!canManage || createMut.isPending}
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
