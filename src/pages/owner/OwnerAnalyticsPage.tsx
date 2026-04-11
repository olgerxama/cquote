import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, Building2, Users, FileText } from 'lucide-react'

export default function OwnerAnalyticsPage() {
  const { data: firms = [] } = useQuery({
    queryKey: ['owner-analytics-firms'],
    queryFn: async () => {
      const { data } = await supabase.from('firms').select('id, name, plan_type, is_active')
      return data ?? []
    },
  })

  const { data: leads = [] } = useQuery({
    queryKey: ['owner-analytics-leads'],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('id, firm_id, status, estimated_total, created_at')
      return data ?? []
    },
  })

  const { data: quotes = [] } = useQuery({
    queryKey: ['owner-analytics-quotes'],
    queryFn: async () => {
      const { data } = await supabase.from('quotes').select('id, firm_id, status, grand_total')
      return data ?? []
    },
  })

  const totalFirms = firms.length
  const activeFirms = firms.filter((f) => f.is_active).length
  const proFirms = firms.filter((f) => f.plan_type === 'professional').length
  const totalLeads = leads.length
  const totalQuotes = quotes.length
  const totalRevenue = quotes
    .filter((q) => q.status === 'sent' || q.status === 'accepted')
    .reduce((s, q) => s + (q.grand_total || 0), 0)

  // Top firms by lead count
  const firmLeadCounts: Record<string, number> = {}
  leads.forEach((l) => { firmLeadCounts[l.firm_id] = (firmLeadCounts[l.firm_id] || 0) + 1 })
  const topFirms = Object.entries(firmLeadCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([firmId, count]) => ({
      firm: firms.find((f) => f.id === firmId),
      count,
    }))

  const stats = [
    { label: 'Total Firms', value: totalFirms, icon: Building2, color: 'text-blue-600 bg-blue-50' },
    { label: 'Active Firms', value: activeFirms, icon: Building2, color: 'text-green-600 bg-green-50' },
    { label: 'Pro Firms', value: proFirms, icon: Building2, color: 'text-purple-600 bg-purple-50' },
    { label: 'Total Leads', value: totalLeads, icon: Users, color: 'text-amber-600 bg-amber-50' },
    { label: 'Total Quotes', value: totalQuotes, icon: FileText, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'Quote Revenue', value: formatCurrency(totalRevenue), icon: BarChart3, color: 'text-emerald-600 bg-emerald-50' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Platform Analytics</h1>
        <p className="text-muted-foreground mt-1">Aggregate metrics across all firms.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Top Firms by Leads</h3>
        {topFirms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-3">
            {topFirms.map(({ firm, count }, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground">{firm?.name || 'Unknown'}</span>
                </div>
                <span className="text-sm text-muted-foreground">{count} leads</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
