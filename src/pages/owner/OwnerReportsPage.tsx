import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'

type OwnerSummaryRow = {
  total_firms: number
  active_firms: number
  pro_firms: number
  total_leads: number
  leads_30_days: number
  instructed_leads: number
  instruction_rate: number
  total_quotes: number
  quote_revenue: number
  team_members: number
  avg_members_per_firm: number
}

type TopFirmRow = {
  firm_id: string
  name: string
  plan_type: string
  is_active: boolean
  leads: number
  instructions: number
  members: number
  conversion: number
}

const PAGE_SIZE = 20

export default function OwnerReportsPage() {
  const [page, setPage] = useState(1)

  const { data: summary } = useQuery({
    queryKey: ['owner-report-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_owner_report_summary')
      if (error) throw error
      return (data?.[0] ?? null) as OwnerSummaryRow | null
    },
  })

  const { data: topFirms = [], isLoading } = useQuery({
    queryKey: ['owner-report-top-firms', page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_owner_top_firms', {
        _limit: PAGE_SIZE,
        _offset: (page - 1) * PAGE_SIZE,
      })
      if (error) throw error
      return (data ?? []) as TopFirmRow[]
    },
  })

  const statItems: Array<[string, string | number]> = [
    ['Firms', summary?.total_firms ?? 0],
    ['Active firms', summary?.active_firms ?? 0],
    ['Professional firms', summary?.pro_firms ?? 0],
    ['Leads', summary?.total_leads ?? 0],
    ['Leads (30 days)', summary?.leads_30_days ?? 0],
    ['Instructions', summary?.instructed_leads ?? 0],
    ['Instruction rate', `${summary?.instruction_rate ?? 0}%`],
    ['Quotes', summary?.total_quotes ?? 0],
    ['Quote revenue', formatCurrency(summary?.quote_revenue ?? 0)],
    ['Team members', summary?.team_members ?? 0],
    ['Avg members/firm', summary?.avg_members_per_firm ?? 0],
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Owner Reports</h1>
        <p className="text-muted-foreground mt-1">Scalable platform reporting for firms, leads, instructions, team and revenue.</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {statItems.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-xl font-bold text-foreground">{String(value)}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Top Firms</h2>
          <span className="text-xs text-muted-foreground">Page {page}</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Loading report rows...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Firm</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Plan</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Active</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Leads</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Instructions</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Conversion</th>
                    <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Team</th>
                  </tr>
                </thead>
                <tbody>
                  {topFirms.map((row) => (
                    <tr key={row.firm_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{row.name}</td>
                      <td className="px-4 py-3 text-sm capitalize">{row.plan_type}</td>
                      <td className="px-4 py-3 text-sm">{row.is_active ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3 text-sm">{row.leads}</td>
                      <td className="px-4 py-3 text-sm">{row.instructions}</td>
                      <td className="px-4 py-3 text-sm">{row.conversion}%</td>
                      <td className="px-4 py-3 text-sm">{row.members}</td>
                    </tr>
                  ))}
                  {topFirms.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No report data yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-input px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={topFirms.length < PAGE_SIZE}
                className="rounded-md border border-input px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
