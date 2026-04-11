import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, X } from 'lucide-react'
import type { PricingBand, PricingExtra, DiscountCode, ServiceType } from '@/types'

const CONDITION_FIELDS = [
  'tenure', 'is_newbuild', 'is_shared_ownership', 'has_mortgage', 'is_first_time_buyer',
  'gifted_deposit', 'uses_help_to_buy_isa', 'uses_right_to_buy', 'uses_help_to_buy_equity_loan',
  'has_existing_mortgage', 'is_buy_to_let', 'transfer_of_equity', 'buy_to_let',
  'second_home', 'company_purchase', 'auction_purchase', 'probate_related', 'speed_essential',
  'buyer_count', 'seller_count', 'remortgagor_count', 'service_type',
]

const COMMON_EXTRAS = [
  { name: 'Local Authority Search', amount: 150, vat_applicable: true },
  { name: 'Land Registry Search', amount: 40, vat_applicable: true },
  { name: 'Environmental Search', amount: 65, vat_applicable: true },
  { name: 'Drainage & Water Search', amount: 70, vat_applicable: true },
  { name: 'Chancel Repair Search', amount: 25, vat_applicable: true },
  { name: 'Bankruptcy Search', amount: 10, vat_applicable: true },
  { name: 'Land Registry Fee', amount: 295, vat_applicable: false },
  { name: 'Leasehold Supplement', amount: 250, vat_applicable: true },
  { name: 'Help to Buy ISA / Lifetime ISA Fee', amount: 75, vat_applicable: true },
  { name: 'Mortgage Fee', amount: 150, vat_applicable: true },
]

type Tab = 'bands' | 'extras' | 'codes'

export default function PricingPage() {
  const { firmId } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('bands')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pricing</h1>
        <p className="text-muted-foreground mt-1">Configure fee bands, extras, and discount codes.</p>
      </div>

      <div className="flex gap-1 border-b border-border mb-6">
        {(['bands', 'extras', 'codes'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'bands' ? 'Fee Bands' : t === 'extras' ? 'Extras' : 'Discount Codes'}
          </button>
        ))}
      </div>

      {tab === 'bands' && <BandsTab firmId={firmId!} queryClient={queryClient} />}
      {tab === 'extras' && <ExtrasTab firmId={firmId!} queryClient={queryClient} />}
      {tab === 'codes' && <CodesTab firmId={firmId!} queryClient={queryClient} />}
    </div>
  )
}

function BandsTab({ firmId, queryClient }: { firmId: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<PricingBand | null>(null)
  const [form, setForm] = useState({ service_type: 'purchase' as ServiceType, min_value: 0, max_value: 500000, base_fee: 0 })

  const { data: bands = [] } = useQuery({
    queryKey: ['pricing-bands', firmId],
    queryFn: async () => {
      const { data } = await supabase.from('pricing_bands').select('*').eq('firm_id', firmId).order('service_type').order('min_value')
      return (data ?? []) as PricingBand[]
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from('pricing_bands').update(form).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('pricing_bands').insert({ ...form, firm_id: firmId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-bands', firmId] })
      toast.success('Saved')
      setShowDialog(false)
      setEditing(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pricing_bands').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-bands', firmId] })
      toast.success('Deleted')
    },
  })

  function openNew() {
    setEditing(null)
    setForm({ service_type: 'purchase', min_value: 0, max_value: 500000, base_fee: 0 })
    setShowDialog(true)
  }

  function openEdit(b: PricingBand) {
    setEditing(b)
    setForm({
      service_type: b.service_type as ServiceType,
      min_value: Number(b.min_value),
      max_value: Number(b.max_value),
      base_fee: Number(b.base_fee),
    })
    setShowDialog(true)
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Band
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Service</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Min Value</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Max Value</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Base Fee</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {bands.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-sm">No bands configured. Add your first fee band to start generating quotes.</td></tr>
            ) : bands.map((b) => (
              <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-5 py-3 text-sm capitalize">{b.service_type.replace('_', ' & ')}</td>
                <td className="px-5 py-3 text-sm">{formatCurrency(Number(b.min_value))}</td>
                <td className="px-5 py-3 text-sm">{formatCurrency(Number(b.max_value))}</td>
                <td className="px-5 py-3 text-sm font-medium">{formatCurrency(Number(b.base_fee))}</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => openEdit(b)} className="text-muted-foreground hover:text-foreground mr-2"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del.mutate(b.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showDialog && (
        <Dialog title={editing ? 'Edit Band' : 'Add Band'} onClose={() => setShowDialog(false)}>
          <div className="space-y-4">
            <Field label="Service Type">
              <select value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value as ServiceType })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="purchase">Purchase</option>
                <option value="sale">Sale</option>
                <option value="sale_purchase">Sale & Purchase</option>
                <option value="remortgage">Remortgage</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Min Value (£)">
                <input type="number" value={form.min_value} onChange={(e) => setForm({ ...form, min_value: Number(e.target.value) })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="Max Value (£)">
                <input type="number" value={form.max_value} onChange={(e) => setForm({ ...form, max_value: Number(e.target.value) })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </Field>
            </div>
            <Field label="Base Fee (£)">
              <input type="number" value={form.base_fee} onChange={(e) => setForm({ ...form, base_fee: Number(e.target.value) })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </Field>
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setShowDialog(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button>
              <button onClick={() => save.mutate()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Save</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function ExtrasTab({ firmId, queryClient }: { firmId: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<PricingExtra | null>(null)
  const [form, setForm] = useState({
    name: '',
    amount: 0,
    apply_mode: 'automatic' as 'automatic' | 'manual_optional',
    condition_field: '',
    condition_value: '',
    trigger_operator: 'equals' as 'equals' | 'not_equals',
    vat_applicable: true,
    is_active: true,
    service_type: '' as string,
  })

  const { data: extras = [] } = useQuery({
    queryKey: ['pricing-extras', firmId],
    queryFn: async () => {
      const { data } = await supabase.from('pricing_extras').select('*').eq('firm_id', firmId).order('name')
      return (data ?? []) as PricingExtra[]
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        service_type: form.service_type || null,
        condition_field: form.condition_field || null,
        condition_value: form.condition_value || null,
      }
      if (editing) {
        const { error } = await supabase.from('pricing_extras').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('pricing_extras').insert({ ...payload, firm_id: firmId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-extras', firmId] })
      toast.success('Saved')
      setShowDialog(false)
      setEditing(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pricing_extras').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-extras', firmId] })
      toast.success('Deleted')
    },
  })

  const bulkAdd = useMutation({
    mutationFn: async () => {
      const payload = COMMON_EXTRAS.map((e) => ({
        ...e,
        firm_id: firmId,
        apply_mode: 'manual_optional' as const,
        trigger_operator: 'equals' as const,
        is_active: true,
      }))
      const { error } = await supabase.from('pricing_extras').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-extras', firmId] })
      toast.success('Common extras added')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function openNew() {
    setEditing(null)
    setForm({ name: '', amount: 0, apply_mode: 'automatic', condition_field: '', condition_value: '', trigger_operator: 'equals', vat_applicable: true, is_active: true, service_type: '' })
    setShowDialog(true)
  }

  function openEdit(e: PricingExtra) {
    setEditing(e)
    setForm({
      name: e.name,
      amount: Number(e.amount),
      apply_mode: e.apply_mode,
      condition_field: e.condition_field || '',
      condition_value: e.condition_value || '',
      trigger_operator: e.trigger_operator,
      vat_applicable: e.vat_applicable,
      is_active: e.is_active,
      service_type: e.service_type || '',
    })
    setShowDialog(true)
  }

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        <button onClick={() => bulkAdd.mutate()} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
          Add Common Set
        </button>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Extra
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Name</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Amount</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Mode</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Condition</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Active</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {extras.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-sm">No extras configured.</td></tr>
            ) : extras.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-5 py-3 text-sm font-medium">{e.name}</td>
                <td className="px-5 py-3 text-sm">{formatCurrency(Number(e.amount))}</td>
                <td className="px-5 py-3 text-sm capitalize">{e.apply_mode.replace('_', ' ')}</td>
                <td className="px-5 py-3 text-sm text-muted-foreground">
                  {e.condition_field ? `${e.condition_field} ${e.trigger_operator} ${e.condition_value}` : '—'}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex h-2 w-2 rounded-full ${e.is_active ? 'bg-green-500' : 'bg-muted'}`} />
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => openEdit(e)} className="text-muted-foreground hover:text-foreground mr-2"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del.mutate(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showDialog && (
        <Dialog title={editing ? 'Edit Extra' : 'Add Extra'} onClose={() => setShowDialog(false)}>
          <div className="space-y-4">
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount (£)">
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="Apply Mode">
                <select value={form.apply_mode} onChange={(e) => setForm({ ...form, apply_mode: e.target.value as 'automatic' | 'manual_optional' })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="automatic">Automatic</option>
                  <option value="manual_optional">Manual Optional</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Condition Field">
                <select value={form.condition_field} onChange={(e) => setForm({ ...form, condition_field: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="">— None —</option>
                  {CONDITION_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Operator">
                <select value={form.trigger_operator} onChange={(e) => setForm({ ...form, trigger_operator: e.target.value as 'equals' | 'not_equals' })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="equals">equals</option>
                  <option value="not_equals">not equals</option>
                </select>
              </Field>
              <Field label="Value">
                <input value={form.condition_value} onChange={(e) => setForm({ ...form, condition_value: e.target.value })} placeholder="e.g. yes" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </Field>
            </div>
            <Field label="Service Type (optional)">
              <select value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">All services</option>
                <option value="purchase">Purchase</option>
                <option value="sale">Sale</option>
                <option value="sale_purchase">Sale & Purchase</option>
                <option value="remortgage">Remortgage</option>
              </select>
            </Field>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.vat_applicable} onChange={(e) => setForm({ ...form, vat_applicable: e.target.checked })} className="h-4 w-4" />
                VAT Applicable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4" />
                Active
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setShowDialog(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button>
              <button onClick={() => save.mutate()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Save</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function CodesTab({ firmId, queryClient }: { firmId: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<DiscountCode | null>(null)
  const [form, setForm] = useState({
    code: '', description: '',
    discount_type: 'fixed' as 'fixed' | 'percentage',
    discount_value: 0, is_active: true,
    valid_from: '', valid_until: '', max_uses: '' as string | number,
  })

  const { data: codes = [] } = useQuery({
    queryKey: ['discount-codes', firmId],
    queryFn: async () => {
      const { data } = await supabase.from('discount_codes').select('*').eq('firm_id', firmId).order('code')
      return (data ?? []) as DiscountCode[]
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.toUpperCase(),
        description: form.description || null,
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        is_active: form.is_active,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
      }
      if (editing) {
        const { error } = await supabase.from('discount_codes').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('discount_codes').insert({ ...payload, firm_id: firmId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount-codes', firmId] })
      toast.success('Saved')
      setShowDialog(false)
      setEditing(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('discount_codes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount-codes', firmId] })
      toast.success('Deleted')
    },
  })

  function openNew() {
    setEditing(null)
    setForm({ code: '', description: '', discount_type: 'fixed', discount_value: 0, is_active: true, valid_from: '', valid_until: '', max_uses: '' })
    setShowDialog(true)
  }

  function openEdit(c: DiscountCode) {
    setEditing(c)
    setForm({
      code: c.code,
      description: c.description || '',
      discount_type: c.discount_type,
      discount_value: Number(c.discount_value),
      is_active: c.is_active,
      valid_from: c.valid_from?.split('T')[0] || '',
      valid_until: c.valid_until?.split('T')[0] || '',
      max_uses: c.max_uses || '',
    })
    setShowDialog(true)
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Code
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Code</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Type</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Value</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Uses</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase">Active</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-sm">No discount codes.</td></tr>
            ) : codes.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-5 py-3 text-sm font-mono font-medium">{c.code}</td>
                <td className="px-5 py-3 text-sm capitalize">{c.discount_type}</td>
                <td className="px-5 py-3 text-sm">
                  {c.discount_type === 'fixed' ? formatCurrency(Number(c.discount_value)) : `${c.discount_value}%`}
                </td>
                <td className="px-5 py-3 text-sm">{c.use_count}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex h-2 w-2 rounded-full ${c.is_active ? 'bg-green-500' : 'bg-muted'}`} />
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => openEdit(c)} className="text-muted-foreground hover:text-foreground mr-2"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del.mutate(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showDialog && (
        <Dialog title={editing ? 'Edit Code' : 'Add Code'} onClose={() => setShowDialog(false)}>
          <div className="space-y-4">
            <Field label="Code">
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono" />
            </Field>
            <Field label="Description">
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type">
                <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value as 'fixed' | 'percentage' })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="fixed">Fixed amount</option>
                  <option value="percentage">Percentage</option>
                </select>
              </Field>
              <Field label={`Value ${form.discount_type === 'fixed' ? '(£)' : '(%)'}`}>
                <input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Valid From">
                <input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="Valid Until">
                <input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </Field>
            </div>
            <Field label="Max Uses (optional)">
              <input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4" />
              Active
            </label>
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setShowDialog(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button>
              <button onClick={() => save.mutate()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Save</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
