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
      if (!error && data?.[0]) return (data[0] as OwnerSummaryRow)

      // Fallback path if RPC is unavailable in an environment.
      const [firmsRes, leadsRes, quotesRes, membersRes] = await Promise.all([
        supabase.from('firms').select('id, is_active, plan_type', { count: 'exact' }),
        supabase.from('leads').select('id, created_at, instruction_submitted_at', { count: 'exact' }),
        supabase.from('quotes').select('id, status, grand_total', { count: 'exact' }),
        supabase.from('firm_users').select('id', { count: 'exact' }),
      ])

      const firms = firmsRes.data ?? []
      const leads = leadsRes.data ?? []
      const quotes = quotesRes.data ?? []
      const now = new Date()
      const cutoff = new Date(now)
      cutoff.setDate(now.getDate() - 30)

      const instructed = leads.filter((l) => !!l.instruction_submitted_at).length
      return {
        total_firms: firmsRes.count ?? 0,
        active_firms: firms.filter((f) => f.is_active).length,
        pro_firms: firms.filter((f) => f.plan_type === 'professional').length,
        total_leads: leadsRes.count ?? 0,
        leads_30_days: leads.filter((l) => new Date(l.created_at) >= cutoff).length,
        instructed_leads: instructed,
        instruction_rate: (leadsRes.count ?? 0) > 0 ? Number(((instructed / (leadsRes.count ?? 1)) * 100).toFixed(2)) : 0,
        total_quotes: quotesRes.count ?? 0,
        quote_revenue: quotes.filter((q) => q.status === 'sent' || q.status === 'accepted').reduce((sum, q) => sum + Number(q.grand_total || 0), 0),
        team_members: membersRes.count ?? 0,
        avg_members_per_firm: (firmsRes.count ?? 0) > 0 ? Number(((membersRes.count ?? 0) / (firmsRes.count ?? 1)).toFixed(2)) : 0,
      } as OwnerSummaryRow
    },
  })

  const { data: topFirms = [], isLoading } = useQuery({
    queryKey: ['owner-report-top-firms', page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_owner_top_firms', {
        _limit: PAGE_SIZE,
        _offset: (page - 1) * PAGE_SIZE,
      })
      if (!error) return (data ?? []) as TopFirmRow[]

      // Fallback aggregation when RPC is unavailable.
      const [{ data: firmsData }, { data: leadsData }, { data: membersData }] = await Promise.all([
        supabase.from('firms').select('id, name, plan_type, is_active'),
        supabase.from('leads').select('firm_id, instruction_submitted_at'),
        supabase.from('firm_users').select('firm_id'),
      ])
      const firms = firmsData ?? []
      const leads = leadsData ?? []
      const members = membersData ?? []
      const leadMap: Record<string, number> = {}
      const instructionMap: Record<string, number> = {}
      const memberMap: Record<string, number> = {}
      leads.forEach((l) => {
        leadMap[l.firm_id] = (leadMap[l.firm_id] || 0) + 1
        if (l.instruction_submitted_at) instructionMap[l.firm_id] = (instructionMap[l.firm_id] || 0) + 1
      })
      members.forEach((m) => { memberMap[m.firm_id] = (memberMap[m.firm_id] || 0) + 1 })

      return firms
        .map((f) => {
          const firmLeads = leadMap[f.id] || 0
          const firmInstructions = instructionMap[f.id] || 0
          return {
            firm_id: f.id,
            name: f.name,
            plan_type: f.plan_type,
            is_active: f.is_active,
            leads: firmLeads,
            instructions: firmInstructions,
            members: memberMap[f.id] || 0,
            conversion: firmLeads > 0 ? Number(((firmInstructions / firmLeads) * 100).toFixed(2)) : 0,
          }
        })
        .sort((a, b) => b.leads - a.leads)
        .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) as TopFirmRow[]
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
