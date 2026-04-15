import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { Plus, Trash2, Search, Copy, ExternalLink, CreditCard } from 'lucide-react'
import { PUBLIC_FORM_FIELDS } from '@/lib/publicFormFields'
import { DEFAULT_PUBLIC_FORM_CONFIG } from '@/types'
import { hasProfessionalAccess } from '@/lib/billing'
import type { Firm, FirmUser, ManualReviewCondition, PublicFormConfig } from '@/types'

const REVIEW_CONDITION_FIELDS = [
  { value: 'probate_related', label: 'Probate Related' },
  { value: 'auction_purchase', label: 'Auction Purchase' },
  { value: 'company_purchase', label: 'Company Purchase' },
  { value: 'is_shared_ownership', label: 'Shared Ownership' },
  { value: 'is_buy_to_let', label: 'Buy to Let' },
  { value: 'transfer_of_equity', label: 'Transfer of Equity' },
  { value: 'uses_right_to_buy', label: 'Right to Buy' },
  { value: 'uses_help_to_buy_equity_loan', label: 'HTB Equity Loan' },
  { value: 'speed_essential', label: 'Urgency Essential' },
  { value: 'gifted_deposit', label: 'Gifted Deposit' },
]

const CONDITION_VALUES = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not Sure' },
]

const SECTION_TOGGLES: Array<{ key: keyof PublicFormConfig; label: string; description: string }> = [
  { key: 'show_service_selector', label: 'Service selector', description: 'Let visitors pick the service type (purchase / sale / remortgage).' },
  { key: 'show_purchase_section', label: 'Purchase questions', description: 'Show the purchase-related questions section.' },
  { key: 'show_sale_section', label: 'Sale questions', description: 'Show the sale-related questions section.' },
  { key: 'show_remortgage_section', label: 'Remortgage questions', description: 'Show the remortgage-related questions section.' },
  { key: 'show_additional_info', label: 'Additional info block', description: 'Show buy-to-let, probate, urgency, etc.' },
  { key: 'show_timeline_notes', label: 'Timeline & notes', description: 'Show instruct timeline and special instructions.' },
  { key: 'show_phone_field', label: 'Phone field', description: 'Ask the visitor for a phone number.' },
  { key: 'show_discount_code', label: 'Discount code', description: 'Let the visitor enter a promo code.' },
  { key: 'show_instruct_button', label: 'Instruct button', description: 'Show the CTA to instruct after the quote.' },
]

const INSTRUCTION_FORM_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'client_type', label: 'Client Type' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'full_address', label: 'Full Address' },
  { key: 'address_line_1', label: 'Address Line 1' },
  { key: 'address_line_2', label: 'Address Line 2' },
  { key: 'town_city', label: 'Town / City' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'date_of_birth', label: 'Date of Birth' },
  { key: 'national_insurance', label: 'National Insurance Number' },
  { key: 'id_type', label: 'ID Type' },
  { key: 'id_number', label: 'ID Number' },
  { key: 'id_check_consent', label: 'ID Check Consent' },
  { key: 'source_of_funds', label: 'Source of Funds' },
  { key: 'additional_notes', label: 'Additional Notes' },
]

type Tab = 'firm' | 'form' | 'instruction' | 'team' | 'quote' | 'review' | 'email' | 'embed'

export default function SettingsPage() {
  const { firmId, user, firmRole, isPlatformOwner } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('firm')
  const [form, setForm] = useState<Partial<Firm>>({})

  const { data: firm, isLoading } = useQuery({
    queryKey: ['firm', firmId],
    queryFn: async () => {
      const { data, error } = await supabase.from('firms').select('*').eq('id', firmId!).single()
      if (error) throw error
      return data as Firm
    },
    enabled: !!firmId,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['firm-members', firmId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('list-firm-team-members', {
        body: { firmId: firmId! },
      })
      if (error) throw error
      return ((data?.members as FirmUser[]) ?? [])
    },
    enabled: !!firmId,
  })

  useEffect(() => {
    if (firm) {
      setForm({
        ...firm,
        public_form_config: { ...DEFAULT_PUBLIC_FORM_CONFIG, ...(firm.public_form_config || {}) },
      })
    }
  }, [firm])

  const save = useMutation({
    mutationFn: async (patch: Partial<Firm>) => {
      const canManage = isPlatformOwner || firmRole === 'admin'
      if (!canManage) {
        throw new Error('Read-only accounts cannot change settings.')
      }
      const { error } = await supabase.from('firms').update(patch).eq('id', firmId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Settings saved')
      queryClient.invalidateQueries({ queryKey: ['firm', firmId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function update<K extends keyof Firm>(key: K, value: Firm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateFormConfig<K extends keyof PublicFormConfig>(key: K, value: PublicFormConfig[K]) {
    setForm((prev) => {
      const current = (prev.public_form_config || DEFAULT_PUBLIC_FORM_CONFIG) as PublicFormConfig
      return {
        ...prev,
        public_form_config: { ...current, [key]: value },
      }
    })
  }

  function addReviewCondition() {
    const existing = (form.manual_review_conditions || []) as ManualReviewCondition[]
    update('manual_review_conditions', [...existing, { field: 'probate_related', value: 'yes' }])
  }

  function removeReviewCondition(idx: number) {
    const existing = (form.manual_review_conditions || []) as ManualReviewCondition[]
    update('manual_review_conditions', existing.filter((_, i) => i !== idx))
  }

  function updateReviewCondition(idx: number, patch: Partial<ManualReviewCondition>) {
    const existing = (form.manual_review_conditions || []) as ManualReviewCondition[]
    update(
      'manual_review_conditions',
      existing.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    )
  }

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>
  if (!firm) return <div className="text-muted-foreground">Firm not found</div>
  const canManageSettings = isPlatformOwner || user?.id === firm.owner_user_id || firmRole === 'admin'
  const isFirmOwner = user?.id === firm.owner_user_id
  const isProAccess = hasProfessionalAccess({
    plan_type: (form.plan_type || firm.plan_type) as Firm['plan_type'],
    stripe_subscription_status: (form.stripe_subscription_status || firm.stripe_subscription_status) as string | null,
  })

  function withPremiumGuard(nextValue: boolean, fallback: boolean): boolean {
    if (!isProAccess && nextValue) {
      toast.error('This feature is available on the Professional plan.')
      return fallback
    }
    return nextValue
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'firm', label: 'Firm' },
    { key: 'form', label: 'Public form' },
    { key: 'instruction', label: 'Instruction form' },
    { key: 'team', label: 'Team' },
    { key: 'quote', label: 'Quote behaviour' },
    { key: 'review', label: 'Manual review' },
    { key: 'email', label: 'Email' },
    { key: 'embed', label: 'Embed' },
  ]

  const isDirty = JSON.stringify(form) !== JSON.stringify(firm)

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your firm, quote form, and embedding options.</p>
        {!canManageSettings && (
          <p className="mt-2 text-sm text-amber-700">
            You have read-only access. Changes are disabled for this account.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {tab === 'firm' && (
          <>
            <Section title="Firm details">
              <Field label="Firm name">
                <Input value={form.name || ''} onChange={(v) => update('name', v)} />
              </Field>
              <Field label="Slug" hint="Used in your public quote URL: /quote/your-slug">
                <Input value={form.slug || ''} onChange={(v) => update('slug', v)} />
              </Field>
              <Field label="Plan">
                <div className="rounded-md border border-border px-3 py-2 text-sm bg-muted/40">
                  <div className="font-medium">{isProAccess ? 'Professional' : 'Free'}</div>
                  <p className="text-xs text-muted-foreground mt-1">Manage billing in the Billing section below.</p>
                </div>
              </Field>
              <Field label="Admin notes" hint="Internal notes (not shown to clients)">
                <Textarea
                  value={form.admin_notes || ''}
                  onChange={(v) => update('admin_notes', v)}
                  rows={3}
                />
              </Field>
            </Section>
            <BillingSection
              firm={firm}
              isFirmOwner={isFirmOwner}
              hasProAccess={isProAccess}
            />

            <Section title="Branding">
              <Field label="Logo URL">
                <Input value={form.logo_url || ''} onChange={(v) => update('logo_url', v)} />
              </Field>
              <Field label="Primary colour">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.primary_color || '#1e3a5f'}
                    onChange={(e) => update('primary_color', e.target.value)}
                    className="h-10 w-16 rounded border border-input cursor-pointer"
                  />
                  <Input
                    value={form.primary_color || ''}
                    onChange={(v) => update('primary_color', v)}
                  />
                </div>
              </Field>
              <Field label="Purchase disclaimer">
                <Textarea
                  value={form.disclaimer_purchase || ''}
                  onChange={(v) => update('disclaimer_purchase', v)}
                  rows={3}
                />
              </Field>
              <Field label="Sale disclaimer">
                <Textarea
                  value={form.disclaimer_sale || ''}
                  onChange={(v) => update('disclaimer_sale', v)}
                  rows={3}
                />
              </Field>
              <Field label="Remortgage disclaimer">
                <Textarea
                  value={form.disclaimer_remortgage || ''}
                  onChange={(v) => update('disclaimer_remortgage', v)}
                  rows={3}
                />
              </Field>
            </Section>
          </>
        )}

        {tab === 'form' && (
          <FormTab
            config={(form.public_form_config || DEFAULT_PUBLIC_FORM_CONFIG) as PublicFormConfig}
            enabled={!!form.public_quote_form_enabled}
            onEnabledChange={(v) => update('public_quote_form_enabled', v)}
            onConfigChange={updateFormConfig}
            canUsePremium={isProAccess}
          />
        )}

        {tab === 'instruction' && (
          <InstructionFormTab
            config={(form.public_form_config || DEFAULT_PUBLIC_FORM_CONFIG) as PublicFormConfig}
            onConfigChange={updateFormConfig}
            canUsePremium={isProAccess}
          />
        )}
        {tab === 'team' && (
          <TeamTab
            firm={firm}
            members={members}
            currentUserId={user?.id || null}
          />
        )}

        {tab === 'quote' && (
          <Section title="Quote behaviour">
            <Toggle
              label="Show instant quote"
              description="Display the calculated total on the public form immediately."
              checked={!!form.show_instant_quote}
              onChange={(v) => update('show_instant_quote', withPremiumGuard(v, !!form.show_instant_quote))}
              premiumOnly
              locked={!isProAccess}
            />
            <Toggle
              label="Show estimate document"
              description="Show a detailed PDF-style estimate document on completion."
              checked={!!form.show_estimate_document}
              onChange={(v) => update('show_estimate_document', withPremiumGuard(v, !!form.show_estimate_document))}
              premiumOnly
              locked={!isProAccess}
            />
            <Toggle
              label="Require admin review"
              description="All leads will be placed in review instead of auto-sending quotes."
              checked={!!form.require_admin_review}
              onChange={(v) => update('require_admin_review', v)}
            />
            <Toggle
              label="Auto-send quote emails"
              description="Automatically send quote emails to customers once a lead is captured."
              checked={!!form.auto_send_quote_emails}
              onChange={(v) => update('auto_send_quote_emails', withPremiumGuard(v, !!form.auto_send_quote_emails))}
              premiumOnly
              locked={!isProAccess}
            />
          </Section>
        )}

        {tab === 'review' && (
          <Section title="Manual review conditions">
            <p className="text-sm text-muted-foreground -mt-1 mb-3">
              If any of these answer conditions are matched, the lead will be flagged for manual review.
            </p>
            <div className="space-y-3">
              {((form.manual_review_conditions || []) as ManualReviewCondition[]).map((cond, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select
                    value={cond.field}
                    onChange={(v) => updateReviewCondition(i, { field: v })}
                    options={REVIEW_CONDITION_FIELDS}
                  />
                  <span className="text-sm text-muted-foreground">equals</span>
                  <Select
                    value={cond.value}
                    onChange={(v) => updateReviewCondition(i, { value: v })}
                    options={CONDITION_VALUES}
                  />
                  <button
                    onClick={() => removeReviewCondition(i)}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-md"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={addReviewCondition}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted"
              >
                <Plus className="h-4 w-4" /> Add condition
              </button>
            </div>
          </Section>
        )}

        {tab === 'email' && (
          <Section title="Email">
            <Field label="Sender display name" hint="Shown as the 'From' name on outgoing emails.">
              <Input
                value={form.sender_display_name || ''}
                onChange={(v) => update('sender_display_name', v)}
                placeholder={firm.name}
              />
            </Field>
            <Field label="Reply-to email" hint="Where customer replies to your quote emails will be delivered.">
              <Input
                value={form.reply_to_email || ''}
                onChange={(v) => update('reply_to_email', v)}
                placeholder="you@example.com"
              />
            </Field>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              Emails are sent via the platform's SMTP provider. The sending address domain is managed by the platform.
            </div>
          </Section>
        )}

        {tab === 'embed' && <EmbedTab firm={firm} />}
      </div>

      {tab !== 'embed' && (
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() =>
              firm &&
              setForm({
                ...firm,
                public_form_config: { ...DEFAULT_PUBLIC_FORM_CONFIG, ...(firm.public_form_config || {}) },
              })
            }
            disabled={!isDirty}
            className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50"
          >
            Reset
          </button>
          <button
            onClick={() => save.mutate(form)}
            disabled={!canManageSettings || save.isPending || !isDirty}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Tab: Public form ----------

function FormTab({
  config,
  enabled,
  onEnabledChange,
  onConfigChange,
  canUsePremium,
}: {
  config: PublicFormConfig
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  onConfigChange: <K extends keyof PublicFormConfig>(key: K, value: PublicFormConfig[K]) => void
  canUsePremium: boolean
}) {
  const [search, setSearch] = useState('')
  const PREMIUM_SECTION_KEYS = new Set<keyof PublicFormConfig>(['show_discount_code', 'show_instruct_button'])
  const hiddenSet = useMemo(() => new Set(config.hidden_fields), [config.hidden_fields])
  const requiredSet = useMemo(() => new Set(config.required_fields || []), [config.required_fields])

  const filteredFields = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return PUBLIC_FORM_FIELDS
    return PUBLIC_FORM_FIELDS.filter(
      (f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q),
    )
  }, [search])

  function setFieldMode(key: string, mode: 'mandatory' | 'optional' | 'hidden') {
    const nextHidden = new Set(hiddenSet)
    const nextRequired = new Set(requiredSet)

    if (mode === 'hidden') {
      nextHidden.add(key)
      nextRequired.delete(key)
    } else if (mode === 'mandatory') {
      nextHidden.delete(key)
      nextRequired.add(key)
    } else {
      nextHidden.delete(key)
      nextRequired.delete(key)
    }

    onConfigChange('hidden_fields', Array.from(nextHidden))
    onConfigChange('required_fields', Array.from(nextRequired))
  }

  return (
    <>
      <Section title="Availability">
        <Toggle
          label="Public quote form enabled"
          description="When disabled, the public quote URL returns a maintenance message."
          checked={enabled}
          onChange={onEnabledChange}
        />
      </Section>

      <Section title="Form sections">
        {SECTION_TOGGLES.map((t) => {
          const isPremiumToggle = PREMIUM_SECTION_KEYS.has(t.key)
          const locked = isPremiumToggle && !canUsePremium
          return (
          <Toggle
            key={t.key as string}
            label={t.label}
            description={t.description}
            checked={!!config[t.key]}
            onChange={(v) => onConfigChange(t.key, (locked && v ? false : v) as PublicFormConfig[typeof t.key])}
            premiumOnly={isPremiumToggle}
            locked={locked}
          />
          )
        })}
      </Section>

      <Section title="Individual fields">
        <div className="flex items-center justify-between -mt-2 mb-2">
          <p className="text-xs text-muted-foreground">
            Hide specific questions that you do not need on the public form.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fields…"
              className="pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-56"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          {filteredFields.map((f) => {
            const hidden = hiddenSet.has(f.key)
            return (
              <label
                key={f.key}
                className="flex items-center justify-between py-2 border-b border-border cursor-pointer hover:bg-muted/30 px-2 rounded"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{f.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{f.key}</div>
                </div>
                <select
                  value={hidden ? 'hidden' : requiredSet.has(f.key) ? 'mandatory' : 'optional'}
                  onChange={(e) => setFieldMode(f.key, e.target.value as 'mandatory' | 'optional' | 'hidden')}
                  className="ml-3 shrink-0 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  title="Set field mode"
                >
                  <option value="mandatory">Mandatory</option>
                  <option value="optional">Optional</option>
                  <option value="hidden">Hidden</option>
                </select>
              </label>
            )
          })}
          {filteredFields.length === 0 && (
            <div className="text-sm text-muted-foreground col-span-full py-4 text-center">
              No fields match your search.
            </div>
          )}
        </div>
      </Section>
    </>
  )
}

function InstructionFormTab({
  config,
  onConfigChange,
  canUsePremium,
}: {
  config: PublicFormConfig
  onConfigChange: <K extends keyof PublicFormConfig>(key: K, value: PublicFormConfig[K]) => void
  canUsePremium: boolean
}) {
  const [search, setSearch] = useState('')
  const hiddenSet = useMemo(() => new Set(config.instruction_hidden_fields || []), [config.instruction_hidden_fields])
  const requiredSet = useMemo(() => new Set(config.instruction_required_fields || []), [config.instruction_required_fields])

  const filteredFields = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return INSTRUCTION_FORM_FIELDS
    return INSTRUCTION_FORM_FIELDS.filter(
      (f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q),
    )
  }, [search])

  function setFieldMode(key: string, mode: 'mandatory' | 'optional' | 'hidden') {
    const nextHidden = new Set(hiddenSet)
    const nextRequired = new Set(requiredSet)

    if (mode === 'hidden') {
      nextHidden.add(key)
      nextRequired.delete(key)
    } else if (mode === 'mandatory') {
      nextHidden.delete(key)
      nextRequired.add(key)
    } else {
      nextHidden.delete(key)
      nextRequired.delete(key)
    }

    onConfigChange('instruction_hidden_fields', Array.from(nextHidden))
    onConfigChange('instruction_required_fields', Array.from(nextRequired))
  }

  return (
    <Section title="Instruction form fields">
      {!canUsePremium && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Professional feature:</strong> instruction workflow settings apply only on Professional plans.
        </div>
      )}
      <div className="flex items-center justify-between -mt-2 mb-2">
        <p className="text-xs text-muted-foreground">
          Configure what appears on the instruction form and whether each field is mandatory.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields…"
            className="pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-56"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
        {filteredFields.map((f) => {
          const hidden = hiddenSet.has(f.key)
          return (
            <label
              key={f.key}
              className="flex items-center justify-between py-2 border-b border-border px-2 rounded hover:bg-muted/30"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{f.label}</div>
                <div className="text-xs text-muted-foreground truncate">{f.key}</div>
              </div>
              <select
                value={hidden ? 'hidden' : requiredSet.has(f.key) ? 'mandatory' : 'optional'}
                onChange={(e) => setFieldMode(f.key, e.target.value as 'mandatory' | 'optional' | 'hidden')}
                className="ml-3 shrink-0 rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                <option value="mandatory">Mandatory</option>
                <option value="optional">Optional</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
          )
        })}
      </div>
    </Section>
  )
}

function TeamTab({
  firm,
  members,
  currentUserId,
}: {
  firm: Firm
  members: FirmUser[]
  currentUserId: string | null
}) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'read_only'>('read_only')
  const [pendingRemove, setPendingRemove] = useState<{ id: string; label: string } | null>(null)
  const currentMember = members.find((m) => m.user_id === currentUserId)
  const canManage = currentUserId === firm.owner_user_id || currentMember?.role === 'admin'

  const inviteMember = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('invite-firm-user', {
        body: { firmId: firm.id, email: email.trim(), role },
      })
      if (error) throw error
      return data as { message?: string }
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Invitation sent')
      setEmail('')
      queryClient.invalidateQueries({ queryKey: ['firm-members', firm.id] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateMemberRole = useMutation({
    mutationFn: async ({ memberId, nextRole }: { memberId: string; nextRole: 'admin' | 'read_only' }) => {
      const { error } = await supabase
        .from('firm_users')
        .update({ role: nextRole })
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Role updated')
      queryClient.invalidateQueries({ queryKey: ['firm-members', firm.id] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('firm_users').delete().eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Member removed')
      queryClient.invalidateQueries({ queryKey: ['firm-members', firm.id] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <>
      <Section title="Invite team member">
        <p className="text-sm text-muted-foreground mb-3">
          Admin members can manage data and settings (except subscription payments). Read-only members can view everything but cannot make changes.
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Invite emails are sent by Supabase Auth. You can fully customize that template in your Supabase dashboard and use metadata keys like
          <code className="mx-1 rounded bg-muted px-1 py-0.5">firm_name</code>,
          <code className="mx-1 rounded bg-muted px-1 py-0.5">inviter_name</code>, and
          <code className="mx-1 rounded bg-muted px-1 py-0.5">member_role</code>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
          <Input value={email} onChange={setEmail} placeholder="colleague@firm.com" />
          <Select
            value={role}
            onChange={(v) => setRole(v as 'admin' | 'read_only')}
            options={[
              { value: 'read_only', label: 'Read-only' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
          <button
            onClick={() => inviteMember.mutate()}
            disabled={!canManage || inviteMember.isPending || !email.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Invite
          </button>
        </div>
        {!canManage && (
          <p className="text-xs text-amber-600 mt-2">You have read-only access and cannot manage members.</p>
        )}
      </Section>

      <Section title="Current team">
        <div className="space-y-2">
          {members.map((m) => {
            const isOwner = m.user_id === firm.owner_user_id
            const isSelf = m.user_id === currentUserId
            return (
              <div key={m.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{m.email || m.user_id}{isSelf ? ' (You)' : ''}</div>
                  <div className="text-xs text-muted-foreground">{isOwner ? 'Owner' : 'Team member'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={isOwner ? 'admin' : m.role}
                    disabled={!canManage || isOwner}
                    onChange={(e) => updateMemberRole.mutate({ memberId: m.id, nextRole: e.target.value as 'admin' | 'read_only' })}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-50"
                  >
                    <option value="admin">Admin</option>
                    <option value="read_only">Read-only</option>
                  </select>
                  {!isOwner && (
                    <button
                      onClick={() => setPendingRemove({ id: m.id, label: m.email || m.user_id })}
                      disabled={!canManage || removeMember.isPending || isSelf}
                      className="px-2 py-1 text-xs rounded border border-input hover:bg-muted disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {members.length === 0 && (
            <p className="text-sm text-muted-foreground">No team members found yet.</p>
          )}
        </div>
      </Section>

      {pendingRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPendingRemove(null)} />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Remove team member?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Remove <span className="font-medium text-foreground">{pendingRemove.label}</span> from this firm? They will lose dashboard access immediately.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPendingRemove(null)}
                className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  removeMember.mutate(pendingRemove.id)
                  setPendingRemove(null)
                }}
                className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                Remove member
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---------- Tab: Embed ----------

function EmbedTab({ firm }: { firm: Firm }) {
  const [height, setHeight] = useState('900')

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://conveyquote.com'
  const quoteUrl = `${origin}/quote/${firm.slug}`
  const embedUrl = `${quoteUrl}?embed=1`

  const iframeSnippet = `<iframe
  src="${embedUrl}"
  width="100%"
  height="${height}"
  frameborder="0"
  style="border:0;max-width:100%;"
  title="${firm.name} — Instant Conveyancing Quote"
></iframe>`

  const autoResizeSnippet = `<iframe
  id="conveyquote-frame"
  src="${embedUrl}"
  width="100%"
  height="${height}"
  frameborder="0"
  scrolling="no"
  style="border:0;max-width:100%;"
  title="${firm.name} — Instant Conveyancing Quote"
></iframe>
<script>
  (function () {
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'conveyquote:height') return;
      var frame = document.getElementById('conveyquote-frame');
      if (frame && typeof e.data.height === 'number') {
        frame.style.height = e.data.height + 'px';
      }
    });
  })();
</script>`

  const widgetSnippet = `<a
  href="${quoteUrl}"
  target="_blank"
  rel="noopener"
  style="display:inline-block;background:${firm.primary_color || '#1e3a5f'};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:sans-serif;font-weight:600;"
>
  Get an Instant Quote
</a>`

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Unable to copy to clipboard')
    }
  }

  return (
    <>
      <Section title="Public quote URL">
        <p className="text-xs text-muted-foreground -mt-2 mb-3">
          The direct URL for your public quote form. Share it anywhere.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={quoteUrl}
            className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-muted font-mono focus:outline-none"
          />
          <button
            onClick={() => copy(quoteUrl, 'URL')}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted"
          >
            <Copy className="h-4 w-4" /> Copy
          </button>
          <a
            href={quoteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" /> Open
          </a>
        </div>
        {!firm.public_quote_form_enabled && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            The public quote form is currently <strong>disabled</strong>. Visitors will see a maintenance message until you enable it from the Public form tab.
          </div>
        )}
      </Section>

      <Section title="Embed iframe">
        <div className="flex items-center justify-between -mt-1 mb-3">
          <p className="text-xs text-muted-foreground">Paste this HTML into your website.</p>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-muted-foreground">Height (px)</label>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-24 px-2 py-1 text-sm rounded-md border border-input bg-background"
            />
          </div>
        </div>
        <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto font-mono mb-2">
          <code>{iframeSnippet}</code>
        </pre>
        <button
          onClick={() => copy(iframeSnippet, 'Iframe snippet')}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted"
        >
          <Copy className="h-4 w-4" /> Copy
        </button>
      </Section>

      <Section title="Auto-resizing iframe (recommended)">
        <p className="text-xs text-muted-foreground -mt-2 mb-3">
          Listens for height updates from the quote form and resizes automatically, avoiding inner scrollbars.
        </p>
        <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto font-mono mb-2 max-h-80">
          <code>{autoResizeSnippet}</code>
        </pre>
        <button
          onClick={() => copy(autoResizeSnippet, 'Auto-resize snippet')}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted"
        >
          <Copy className="h-4 w-4" /> Copy
        </button>
      </Section>

      <Section title='Simple "Get a Quote" button'>
        <p className="text-xs text-muted-foreground -mt-2 mb-3">
          Opens the quote form in a new tab. Great for navigation menus or email signatures.
        </p>
        <div className="rounded-md border border-border p-4 flex items-center justify-center mb-3 bg-background">
          <div dangerouslySetInnerHTML={{ __html: widgetSnippet }} />
        </div>
        <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto font-mono mb-2">
          <code>{widgetSnippet}</code>
        </pre>
        <button
          onClick={() => copy(widgetSnippet, 'Button snippet')}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-muted"
        >
          <Copy className="h-4 w-4" /> Copy
        </button>
      </Section>
    </>
  )
}

function BillingSection({
  firm,
  isFirmOwner,
  hasProAccess,
}: {
  firm: Firm
  isFirmOwner: boolean
  hasProAccess: boolean
}) {
  const [loadingCheckout, setLoadingCheckout] = useState(false)
  const [loadingPortal, setLoadingPortal] = useState(false)

  const status = (firm.stripe_subscription_status || 'none').toLowerCase()
  const periodEnd = firm.stripe_subscription_current_period_end
    ? new Date(firm.stripe_subscription_current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  async function openCheckout() {
    setLoadingCheckout(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout-session', {
        body: { returnUrl: `${window.location.origin}/admin/settings` },
      })
      if (error) throw error
      if (!data?.url) throw new Error('No checkout URL returned')
      window.location.href = data.url as string
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`Unable to open checkout: ${message}`)
    } finally {
      setLoadingCheckout(false)
    }
  }

  async function openPortal() {
    setLoadingPortal(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-customer-portal', {
        body: { returnUrl: `${window.location.origin}/admin/settings` },
      })
      if (error) throw error
      if (!data?.url) throw new Error('No portal URL returned')
      window.location.href = data.url as string
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`Unable to open billing portal: ${message}`)
    } finally {
      setLoadingPortal(false)
    }
  }

  return (
    <>
      <Section title="Billing">
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <div className="text-sm text-muted-foreground">Current plan</div>
          <div className="text-lg font-semibold text-foreground">{hasProAccess ? 'Professional (£49/month)' : 'Free'}</div>
          <div className="text-xs text-muted-foreground">Stripe status: <span className="font-medium text-foreground">{status}</span></div>
          {periodEnd && (
            <div className="text-xs text-muted-foreground">
              {firm.stripe_subscription_cancel_at_period_end ? 'Access ends on' : 'Renews on'}{' '}
              <span className="font-medium text-foreground">{periodEnd}</span>
            </div>
          )}
          {firm.stripe_subscription_cancel_at_period_end && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              Subscription is cancelled and set to end at the current billing period.
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3 pt-2">
          {!hasProAccess && (
            <button
              onClick={openCheckout}
              disabled={!isFirmOwner || loadingCheckout}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              {loadingCheckout ? 'Opening checkout…' : 'Upgrade to Professional'}
            </button>
          )}
          <button
            onClick={openPortal}
            disabled={!isFirmOwner || loadingPortal || !firm.stripe_customer_id}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            {loadingPortal ? 'Opening portal…' : 'Manage billing'}
          </button>
        </div>
        {!isFirmOwner && <p className="text-xs text-amber-700">Only the firm owner can access billing actions.</p>}
      </Section>
    </>
  )
}

// ---------- Shared inputs ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="font-semibold text-foreground mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
    />
  )
}

function Textarea({
  value,
  onChange,
  rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
    />
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  locked = false,
  premiumOnly = false,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  locked?: boolean
  premiumOnly?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-b-0">
      <div>
        <div className="font-medium text-sm text-foreground">
          {label}
          {premiumOnly && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Pro</span>}
        </div>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
        {locked && <div className="text-xs text-amber-700 mt-1">Upgrade to Professional to enable this.</div>}
      </div>
      <input
        type="checkbox"
        disabled={locked}
        className="h-5 w-9 mt-1 appearance-none rounded-full bg-muted transition-colors checked:bg-primary relative cursor-pointer before:content-[''] before:absolute before:h-4 before:w-4 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 before:transition-transform checked:before:translate-x-4 disabled:cursor-not-allowed disabled:opacity-50"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  )
}
