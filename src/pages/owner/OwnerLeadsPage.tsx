import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'

type LeadRow = {
  id: string
  firm_id: string
  full_name: string
  email: string
  service_type: string
  status: 'new' | 'review' | 'quoted'
  property_value: number
  created_at: string
  instruction_submitted_at: string | null
}

const PAGE_SIZE = 50

export default function OwnerLeadsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'new' | 'review' | 'quoted'>('all')
  const [page, setPage] = useState(1)

  const { data: firms = [] } = useQuery({
    queryKey: ['owner-leads-firms'],
    queryFn: async () => {
      const { data } = await supabase.from('firms').select('id, name')
      return data ?? []
    },
  })

  const querySearch = search.trim()
  const { data, isLoading } = useQuery({
    queryKey: ['owner-leads-page', page, status, querySearch],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('id, firm_id, full_name, email, service_type, status, property_value, created_at, instruction_submitted_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (status !== 'all') query = query.eq('status', status)
      if (querySearch) {
        const safe = querySearch.replace(/,/g, ' ')
        query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,service_type.ilike.%${safe}%`)
      }

      const { data, count, error } = await query
      if (error) throw error
      return { rows: (data ?? []) as LeadRow[], total: count ?? 0 }
    },
  })

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const firmNameById = useMemo(() => {
    const map: Record<string, string> = {}
    firms.forEach((f) => { map[f.id] = f.name })
    return map
  }, [firms])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Platform Leads</h1>
        <p className="text-muted-foreground mt-1">Paginated cross-firm lead feed designed for large datasets.</p>
      </div>

      <div className="mb-4 flex flex-col md:flex-row gap-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search lead name, email, or service..."
          className="w-full md:max-w-sm rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1) }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="review">Review</option>
          <option value="quoted">Quoted</option>
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading leads...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Lead</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Firm</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Service</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Value</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Created</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Instructed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((lead) => (
                    <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">{lead.full_name}</div>
                        <div className="text-xs text-muted-foreground">{lead.email}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{firmNameById[lead.firm_id] || 'Unknown firm'}</td>
                      <td className="px-4 py-3 text-sm capitalize">{lead.service_type.replace('_', ' & ')}</td>
                      <td className="px-4 py-3 text-sm capitalize">{lead.status}</td>
                      <td className="px-4 py-3 text-sm">{formatCurrency(lead.property_value)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(lead.created_at)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{lead.instruction_submitted_at ? formatDate(lead.instruction_submitted_at) : '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No leads found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <p className="text-xs text-muted-foreground">Showing page {page} of {totalPages} ({total} leads)</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md border border-input px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-input px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
