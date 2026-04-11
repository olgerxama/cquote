import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Users, FileText, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import type { Lead } from '@/types'

export default function DashboardPage() {
  const { firmId } = useAuth()

  const { data: leads = [] } = useQuery({
    queryKey: ['leads', firmId],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('firm_id', firmId!)
        .order('created_at', { ascending: false })
        .limit(50)
      return (data ?? []) as Lead[]
    },
    enabled: !!firmId,
  })

  const { data: quoteCount = 0 } = useQuery({
    queryKey: ['quote-count', firmId],
    queryFn: async () => {
      const { count } = await supabase
        .from('quotes')
        .select('*', { count: 'exact', head: true })
        .eq('firm_id', firmId!)
      return count ?? 0
    },
    enabled: !!firmId,
  })

  const totalLeads = leads.length
  const newLeads = leads.filter((l) => l.status === 'new').length
  const reviewLeads = leads.filter((l) => l.status === 'review').length
  const recentLeads = leads.slice(0, 10)

  const stats = [
    { label: 'Total Leads', value: totalLeads, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'New Enquiries', value: newLeads, icon: FileText, color: 'text-green-600 bg-green-50' },
    { label: 'Needs Review', value: reviewLeads, icon: AlertCircle, color: 'text-amber-600 bg-amber-50' },
    { label: 'Quotes Sent', value: quoteCount, icon: CheckCircle2, color: 'text-purple-600 bg-purple-50' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your conveyancing pipeline.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{stat.label}</span>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Leads */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Recent Leads</h2>
          <Link to="/admin/leads" className="text-sm text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {recentLeads.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No leads yet. Share your quote form to start receiving enquiries.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Service</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Value</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-3">
                      <div className="text-sm font-medium text-foreground">{lead.full_name}</div>
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground capitalize">{lead.service_type.replace('_', ' & ')}</td>
                    <td className="px-5 py-3 text-sm text-foreground">{formatCurrency(lead.property_value)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        lead.status === 'new' ? 'bg-blue-100 text-blue-700' :
                        lead.status === 'review' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{formatDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
