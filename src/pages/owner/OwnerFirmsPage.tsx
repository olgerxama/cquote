import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { formatDate } from '@/lib/utils'
import { Building2, ExternalLink } from 'lucide-react'
import type { Firm } from '@/types'

const PAGE_SIZE = 25

export default function OwnerFirmsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const querySearch = search.trim()

  const { data, isLoading } = useQuery({
    queryKey: ['owner-firms', page, querySearch],
    queryFn: async () => {
      let query = supabase
        .from('firms')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
      if (querySearch) {
        const safe = querySearch.replace(/,/g, ' ')
        query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`)
      }
      const { data, count, error } = await query
      if (error) throw error
      return { rows: (data ?? []) as Firm[], total: count ?? 0 }
    },
  })

  const firms = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const firmIds = useMemo(() => (data?.rows ?? []).map((f) => f.id), [data?.rows])

  const { data: leadsMap = {} } = useQuery({
    queryKey: ['owner-leads-counts-page', firmIds.join(',')],
    queryFn: async () => {
      if (firmIds.length === 0) return {}
      const { data } = await supabase.from('leads').select('firm_id').in('firm_id', firmIds)
      const map: Record<string, number> = {}
      data?.forEach((l) => { map[l.firm_id] = (map[l.firm_id] || 0) + 1 })
      return map
    },
    enabled: firmIds.length > 0,
  })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">All Firms</h1>
        <p className="text-muted-foreground mt-1">Paginated platform-wide firm management.</p>
      </div>
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search firm name or slug..."
          className="w-full md:max-w-sm rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : firms.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No firms registered yet.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Firm</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Plan</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Active</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Leads</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Created</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase"></th>
                </tr>
              </thead>
              <tbody>
                {firms.map((firm) => (
                  <tr key={firm.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-foreground">{firm.name}</div>
                      <div className="text-xs text-muted-foreground">{firm.slug}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        firm.plan_type === 'professional' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {firm.plan_type}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex h-2 w-2 rounded-full ${firm.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                    </td>
                    <td className="px-5 py-3 text-sm text-foreground">{leadsMap[firm.id] || 0}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{formatDate(firm.created_at)}</td>
                    <td className="px-5 py-3">
                      <Link to={`/owner/firms/${firm.id}`} className="text-primary hover:underline text-sm flex items-center gap-1">
                        View <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground">Showing page {page} of {totalPages} ({total} firms)</p>
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
        </div>
      )}
    </div>
  )
}
