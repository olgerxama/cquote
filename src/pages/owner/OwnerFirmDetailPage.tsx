import { useParams } from 'react-router-dom'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Building2, Users, FileText, DollarSign, Trash2 } from 'lucide-react'
import type { Firm, Lead } from '@/types'

const LEADS_PAGE_SIZE = 20

export default function OwnerFirmDetailPage() {
  const { firmId } = useParams<{ firmId: string }>()
  const queryClient = useQueryClient()
  const [leadsPage, setLeadsPage] = useState(1)

  const { data: firm, isLoading } = useQuery({
    queryKey: ['owner-firm', firmId],
    queryFn: async () => {
      const { data } = await supabase.from('firms').select('*').eq('id', firmId!).single()
      return data as Firm
    },
    enabled: !!firmId,
  })

  const { data: leadsPageData } = useQuery({
    queryKey: ['owner-firm-leads', firmId, leadsPage],
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('firm_id', firmId!)
        .order('created_at', { ascending: false })
        .range((leadsPage - 1) * LEADS_PAGE_SIZE, leadsPage * LEADS_PAGE_SIZE - 1)
      if (error) throw error
      return { rows: (data ?? []) as Lead[], total: count ?? 0 }
    },
    enabled: !!firmId,
  })
  const leads = leadsPageData?.rows ?? []
  const totalLeads = leadsPageData?.total ?? 0
  const totalLeadPages = Math.max(1, Math.ceil(totalLeads / LEADS_PAGE_SIZE))

  const { data: members = [] } = useQuery({
    queryKey: ['owner-firm-members', firmId],
    queryFn: async () => {
      const { data } = await supabase.from('firm_users').select('*').eq('firm_id', firmId!)
      return data ?? []
    },
    enabled: !!firmId,
  })

  const updateFirm = useMutation({
    mutationFn: async (updates: Partial<Firm>) => {
      const { error } = await supabase.from('firms').update(updates).eq('id', firmId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-firm', firmId] })
      toast.success('Firm updated')
    },
    onError: () => toast.error('Failed to update firm'),
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('firm_users').delete().eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Member account removed from firm')
      queryClient.invalidateQueries({ queryKey: ['owner-firm-members', firmId] })
    },
    onError: () => toast.error('Failed to remove member'),
  })

  const deleteFirm = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('firms').delete().eq('id', firmId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Firm account deleted')
      window.location.href = '/owner'
    },
    onError: () => toast.error('Failed to delete firm account'),
  })

  if (isLoading || !firm) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">{firm.name}</h1>
        <p className="text-muted-foreground mt-1">Firm detail and controls</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Plan', value: firm.plan_type, icon: DollarSign },
          { label: 'Members', value: members.length, icon: Users },
          { label: 'Total Leads', value: totalLeads, icon: FileText },
          { label: 'Active', value: firm.is_active ? 'Yes' : 'No', icon: Building2 },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <s.icon className="h-4 w-4" />
              {s.label}
            </div>
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Firm Controls</h3>
          <div className="space-y-3">
            {[
              { key: 'is_active', label: 'Active' },
              { key: 'public_quote_form_enabled', label: 'Public Form Enabled' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{label}</span>
                <input
                  type="checkbox"
                  checked={firm[key as keyof Firm] as boolean}
                  onChange={(e) => {
                    const checked = e.target.checked
                    if (key === 'is_active' && !checked) {
                      updateFirm.mutate({ is_active: false, public_quote_form_enabled: false })
                      return
                    }
                    updateFirm.mutate({ [key]: checked })
                  }}
                  className="h-4 w-4 rounded border-input"
                />
              </label>
            ))}
            <div>
              <label className="block text-sm text-foreground mb-1">Plan Type</label>
              <select
                value={firm.plan_type}
                onChange={(e) => updateFirm.mutate({ plan_type: e.target.value as 'free' | 'professional' })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="free">Free</option>
                <option value="professional">Professional</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-foreground mb-1">Admin Notes</label>
              <textarea
                defaultValue={firm.admin_notes || ''}
                onBlur={(e) => updateFirm.mutate({ admin_notes: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Members</h3>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex justify-between text-sm border-b border-border pb-2 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-mono text-xs">{m.user_id}</span>
                    <span className="text-muted-foreground">{m.role}</span>
                  </div>
                  {m.user_id === firm.owner_user_id ? (
                    <span className="text-xs text-muted-foreground">Owner</span>
                  ) : (
                    <button
                      onClick={() => removeMember.mutate(m.id)}
                      className="text-xs text-destructive hover:underline disabled:opacity-50"
                      disabled={removeMember.isPending}
                    >
                      Delete member account
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 mb-8">
        <h3 className="text-lg font-semibold text-destructive mb-2">Danger zone</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Permanently delete this firm account and all related records.
        </p>
        <button
          onClick={() => {
            const confirmed = window.confirm(`Delete ${firm.name}? This cannot be undone.`)
            if (confirmed) deleteFirm.mutate()
          }}
          className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          disabled={deleteFirm.isPending}
        >
          <Trash2 className="h-4 w-4" />
          {deleteFirm.isPending ? 'Deleting…' : 'Delete firm account'}
        </button>
      </div>

      {/* Recent Leads */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-5 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Recent Leads</h3>
        </div>
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
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-sm text-foreground">{lead.full_name}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground capitalize">{lead.service_type.replace('_', ' & ')}</td>
                  <td className="px-5 py-3 text-sm text-foreground">{formatCurrency(lead.property_value)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      lead.status === 'new' ? 'bg-blue-100 text-blue-700' :
                      lead.status === 'review' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>{lead.status}</span>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{formatDate(lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground">Page {leadsPage} of {totalLeadPages} ({totalLeads} leads)</p>
          <div className="flex gap-2">
            <button
              onClick={() => setLeadsPage((p) => Math.max(1, p - 1))}
              disabled={leadsPage === 1}
              className="rounded-md border border-input px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setLeadsPage((p) => Math.min(totalLeadPages, p + 1))}
              disabled={leadsPage >= totalLeadPages}
              className="rounded-md border border-input px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
