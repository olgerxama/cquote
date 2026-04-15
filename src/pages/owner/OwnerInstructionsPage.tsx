import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { formatDate } from '@/lib/utils'

type InstructionRow = {
  id: string
  firm_id: string
  full_name: string
  email: string
  service_type: string
  instruction_submitted_at: string | null
  quotes?: Array<{ reference_code: string | null }>
}

const PAGE_SIZE = 50

export default function OwnerInstructionsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data: firms = [] } = useQuery({
    queryKey: ['owner-instructions-firms'],
    queryFn: async () => {
      const { data } = await supabase.from('firms').select('id, name')
      return data ?? []
    },
  })

  const querySearch = search.trim()
  const { data, isLoading } = useQuery({
    queryKey: ['owner-instructions', page, querySearch],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('id, firm_id, full_name, email, service_type, instruction_submitted_at, quotes(reference_code)', { count: 'exact' })
        .not('instruction_submitted_at', 'is', null)
        .order('instruction_submitted_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (querySearch) {
        const safe = querySearch.replace(/,/g, ' ')
        query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,service_type.ilike.%${safe}%`)
      }

      const { data, count, error } = await query
      if (error) throw error
      return { rows: (data ?? []) as InstructionRow[], total: count ?? 0 }
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
        <h1 className="text-2xl font-bold text-foreground">Platform Instructions</h1>
        <p className="text-muted-foreground mt-1">Paginated instruction submissions across firms.</p>
      </div>

      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        placeholder="Search by person, email or service..."
        className="mb-4 w-full md:max-w-sm rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading instructions...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Ref</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Firm</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Service</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((lead) => (
                    <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{lead.quotes?.[0]?.reference_code || '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">{lead.full_name}</div>
                        <div className="text-xs text-muted-foreground">{lead.email}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{firmNameById[lead.firm_id] || 'Unknown firm'}</td>
                      <td className="px-4 py-3 text-sm capitalize">{lead.service_type.replace('_', ' & ')}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{lead.instruction_submitted_at ? formatDate(lead.instruction_submitted_at) : '—'}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No instructions found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <p className="text-xs text-muted-foreground">Showing page {page} of {totalPages} ({total} instructions)</p>
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
