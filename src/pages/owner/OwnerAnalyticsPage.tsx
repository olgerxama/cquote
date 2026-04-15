import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, Building2, Users, FileText } from 'lucide-react'

type OwnerSummaryRow = {
  total_firms: number
  active_firms: number
  pro_firms: number
  total_leads: number
  instructed_leads: number
  total_quotes: number
  quote_revenue: number
}

type TopFirmRow = { firm_id: string; name: string; leads: number }

export default function OwnerAnalyticsPage() {
  const { data: summary } = useQuery({
    queryKey: ['owner-analytics-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_owner_report_summary')
      if (error) throw error
      return (data?.[0] ?? null) as OwnerSummaryRow | null
    },
  })

  const { data: topFirms = [] } = useQuery({
    queryKey: ['owner-analytics-top-firms'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_owner_top_firms', { _limit: 5, _offset: 0 })
      if (error) throw error
      return (data ?? []) as TopFirmRow[]
    },
  })

  const stats = [
    { label: 'Total Firms', value: summary?.total_firms ?? 0, icon: Building2, color: 'text-blue-600 bg-blue-50' },
    { label: 'Active Firms', value: summary?.active_firms ?? 0, icon: Building2, color: 'text-green-600 bg-green-50' },
    { label: 'Pro Firms', value: summary?.pro_firms ?? 0, icon: Building2, color: 'text-purple-600 bg-purple-50' },
    { label: 'Total Leads', value: summary?.total_leads ?? 0, icon: Users, color: 'text-amber-600 bg-amber-50' },
    { label: 'Instructed Leads', value: summary?.instructed_leads ?? 0, icon: FileText, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'Quote Revenue', value: formatCurrency(summary?.quote_revenue ?? 0), icon: BarChart3, color: 'text-emerald-600 bg-emerald-50' },
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
            <p className="mt-2 text-2xl font-bold text-foreground">{String(s.value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Top Firms by Leads</h3>
        {topFirms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-3">
            {topFirms.map((firm, i) => (
              <div key={firm.firm_id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground">{firm.name || 'Unknown'}</span>
                </div>
                <span className="text-sm text-muted-foreground">{firm.leads} leads</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
