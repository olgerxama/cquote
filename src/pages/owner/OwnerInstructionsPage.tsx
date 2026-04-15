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

export default function OwnerInstructionsPage() {
  const [search, setSearch] = useState('')

  const { data: instructions = [], isLoading } = useQuery({
    queryKey: ['owner-instructions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, firm_id, full_name, email, service_type, instruction_submitted_at, quotes(reference_code)')
        .not('instruction_submitted_at', 'is', null)
        .order('instruction_submitted_at', { ascending: false })
        .limit(1000)
      return (data ?? []) as InstructionRow[]
    },
  })

  const { data: firms = [] } = useQuery({
    queryKey: ['owner-instructions-firms'],
    queryFn: async () => {
      const { data } = await supabase.from('firms').select('id, name')
      return data ?? []
    },
  })

  const firmNameById = useMemo(() => {
    const map: Record<string, string> = {}
    firms.forEach((f) => { map[f.id] = f.name })
    return map
  }, [firms])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return instructions
    return instructions.filter((lead) => {
      const quotes = lead.quotes
      const ref = quotes?.[0]?.reference_code || ''
      return [lead.full_name, lead.email, lead.service_type, firmNameById[lead.firm_id] || '', ref]
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [instructions, search, firmNameById])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Platform Instructions</h1>
        <p className="text-muted-foreground mt-1">All instruction submissions across firms.</p>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by reference, person, firm, service..."
        className="mb-4 w-full md:max-w-sm rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading instructions...</div>
        ) : (
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
                {filtered.map((lead) => {
                  const quotes = lead.quotes
                  return (
                    <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{quotes?.[0]?.reference_code || '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">{lead.full_name}</div>
                        <div className="text-xs text-muted-foreground">{lead.email}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{firmNameById[lead.firm_id] || 'Unknown firm'}</td>
                      <td className="px-4 py-3 text-sm capitalize">{lead.service_type.replace('_', ' & ')}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{lead.instruction_submitted_at ? formatDate(lead.instruction_submitted_at) : '—'}</td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No instructions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
