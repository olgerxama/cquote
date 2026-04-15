import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'

export default function OwnerReportsPage() {
  const { data: firms = [] } = useQuery({
    queryKey: ['owner-reports-firms'],
    queryFn: async () => {
      const { data } = await supabase.from('firms').select('id, name, plan_type, is_active, created_at')
      return data ?? []
    },
  })

  const { data: leads = [] } = useQuery({
    queryKey: ['owner-reports-leads'],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('id, firm_id, status, property_value, instruction_submitted_at, created_at')
      return data ?? []
    },
  })

  const { data: quotes = [] } = useQuery({
    queryKey: ['owner-reports-quotes'],
    queryFn: async () => {
      const { data } = await supabase.from('quotes').select('id, firm_id, status, grand_total, created_at')
      return data ?? []
    },
  })

  const { data: members = [] } = useQuery({
    queryKey: ['owner-reports-members'],
    queryFn: async () => {
      const { data } = await supabase.from('firm_users').select('id, firm_id, role')
      return data ?? []
    },
  })

  const metrics = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)

    const leads30 = leads.filter((l) => new Date(l.created_at) >= thirtyDaysAgo).length
    const instructed = leads.filter((l) => !!l.instruction_submitted_at).length
    const sentOrAccepted = quotes.filter((q) => q.status === 'sent' || q.status === 'accepted')
    const revenue = sentOrAccepted.reduce((sum, q) => sum + Number(q.grand_total || 0), 0)

    return {
      totalFirms: firms.length,
      activeFirms: firms.filter((f) => f.is_active).length,
      proFirms: firms.filter((f) => f.plan_type === 'professional').length,
      totalLeads: leads.length,
      leads30,
      instructed,
      instructionRate: leads.length ? Math.round((instructed / leads.length) * 100) : 0,
      totalQuotes: quotes.length,
      totalRevenue: revenue,
      teamMembers: members.length,
      avgMembersPerFirm: firms.length ? (members.length / firms.length).toFixed(1) : '0.0',
    }
  }, [firms, leads, quotes, members])

  const topFirms = useMemo(() => {
    const leadMap: Record<string, number> = {}
    const instructionMap: Record<string, number> = {}
    const memberMap: Record<string, number> = {}

    leads.forEach((l) => {
      leadMap[l.firm_id] = (leadMap[l.firm_id] || 0) + 1
      if (l.instruction_submitted_at) instructionMap[l.firm_id] = (instructionMap[l.firm_id] || 0) + 1
    })
    members.forEach((m) => {
      memberMap[m.firm_id] = (memberMap[m.firm_id] || 0) + 1
    })

    return firms
      .map((firm) => ({
        id: firm.id,
        name: firm.name,
        plan: firm.plan_type,
        leads: leadMap[firm.id] || 0,
        instructions: instructionMap[firm.id] || 0,
        members: memberMap[firm.id] || 0,
        conversion: leadMap[firm.id] ? Math.round(((instructionMap[firm.id] || 0) / leadMap[firm.id]) * 100) : 0,
      }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 12)
  }, [firms, leads, members])

  const statItems = [
    ['Firms', metrics.totalFirms],
    ['Active firms', metrics.activeFirms],
    ['Professional firms', metrics.proFirms],
    ['Leads', metrics.totalLeads],
    ['Leads (30 days)', metrics.leads30],
    ['Instructions', metrics.instructed],
    ['Instruction rate', `${metrics.instructionRate}%`],
    ['Quotes', metrics.totalQuotes],
    ['Quote revenue', formatCurrency(metrics.totalRevenue)],
    ['Team members', metrics.teamMembers],
    ['Avg members/firm', metrics.avgMembersPerFirm],
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Owner Reports</h1>
        <p className="text-muted-foreground mt-1">Deep platform reporting across firms, leads, instructions, team, and revenue.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statItems.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-xl font-bold text-foreground">{String(value)}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Top Firms (Leads, Instructions, Team)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Firm</th>
                <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Plan</th>
                <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Leads</th>
                <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Instructions</th>
                <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Conversion</th>
                <th className="text-left px-4 py-3 text-xs uppercase text-muted-foreground">Team</th>
              </tr>
            </thead>
            <tbody>
              {topFirms.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{row.name}</td>
                  <td className="px-4 py-3 text-sm capitalize">{row.plan}</td>
                  <td className="px-4 py-3 text-sm">{row.leads}</td>
                  <td className="px-4 py-3 text-sm">{row.instructions}</td>
                  <td className="px-4 py-3 text-sm">{row.conversion}%</td>
                  <td className="px-4 py-3 text-sm">{row.members}</td>
                </tr>
              ))}
              {topFirms.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No report data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
