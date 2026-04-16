import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import type { ClientWorkflow, WorkflowClient, WorkflowInputType, WorkflowStep, WorkflowStepStatus, WorkflowStepSubmission } from '@/types'

type AdminTab = 'progress' | 'setup' | 'review'

export default function ClientWorkflowsPage() {
  const { firmId, firmRole, user } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<AdminTab>('progress')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)

  const canManage = firmRole === 'admin'

  const { data: workflows = [] } = useQuery({
    queryKey: ['client-workflows', firmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_workflows')
        .select('*')
        .eq('firm_id', firmId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ClientWorkflow[]
    },
    enabled: !!firmId,
  })

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId) ?? workflows[0] ?? null

  const { data: clients = [] } = useQuery({
    queryKey: ['workflow-clients', firmId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_clients')
        .select('*')
        .eq('firm_id', firmId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as WorkflowClient[]
    },
    enabled: !!firmId,
  })

  const { data: steps = [] } = useQuery({
    queryKey: ['workflow-steps', selectedWorkflow?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_steps')
        .select('*')
        .eq('workflow_id', selectedWorkflow!.id)
        .order('step_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as WorkflowStep[]
    },
    enabled: !!selectedWorkflow?.id,
  })

  const { data: submissions = [] } = useQuery({
    queryKey: ['workflow-submissions', selectedWorkflow?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_step_submissions')
        .select('*')
        .eq('workflow_id', selectedWorkflow!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as WorkflowStepSubmission[]
    },
    enabled: !!selectedWorkflow?.id,
  })

  const latestByStep = useMemo(() => {
    const out = new Map<string, WorkflowStepSubmission>()
    for (const item of submissions) {
      if (!out.has(item.step_id)) out.set(item.step_id, item)
    }
    return out
  }, [submissions])

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['client-workflows', firmId] })
    queryClient.invalidateQueries({ queryKey: ['workflow-steps', selectedWorkflow?.id] })
    queryClient.invalidateQueries({ queryKey: ['workflow-submissions', selectedWorkflow?.id] })
  }

  const createWorkflow = useMutation({
    mutationFn: async () => {
      if (!firmId) return
      const { data, error } = await supabase
        .from('client_workflows')
        .insert({ firm_id: firmId, title: `New matter workflow ${new Date().toLocaleDateString()}` })
        .select('*')
        .single()
      if (error) throw error
      return data as ClientWorkflow
    },
    onSuccess: (workflow) => {
      if (!workflow) return
      setSelectedWorkflowId(workflow.id)
      refresh()
      toast.success('Workflow created')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  async function updateStepStatus(step: WorkflowStep, status: WorkflowStepStatus) {
    const { error } = await supabase.from('workflow_steps').update({ status }).eq('id', step.id)
    if (error) throw error

    const eventType = status === 'complete'
      ? 'complete'
      : status === 'needs_info'
        ? 'needs_info'
        : status === 'for_review'
          ? 'for_review'
          : 'updated'

    await supabase.functions.invoke('workflow-status-email', {
      body: { workflowId: step.workflow_id, stepId: step.id, eventType },
    })

    const allComplete = steps.every((s) => (s.id === step.id ? status === 'complete' : s.status === 'complete'))
    if (allComplete) {
      await supabase.functions.invoke('workflow-status-email', {
        body: { workflowId: step.workflow_id, eventType: 'workflow_complete' },
      })
    }

    refresh()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Client Workflows</h1>
        <p className="text-muted-foreground mt-1">Configure staged matter steps, collect docs, and review submissions.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-2 items-center">
        <select
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm min-w-72"
          value={selectedWorkflow?.id || ''}
          onChange={(e) => setSelectedWorkflowId(e.target.value || null)}
        >
          {workflows.length === 0 && <option value="">No workflows yet</option>}
          {workflows.map((wf) => (
            <option key={wf.id} value={wf.id}>{wf.title}</option>
          ))}
        </select>
        {canManage && (
          <button
            onClick={() => createWorkflow.mutate()}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            New workflow
          </button>
        )}
      </div>

      {selectedWorkflow && (
        <div className="space-y-4">
          <div className="flex gap-2 border-b border-border">
            {(['progress', 'setup', 'review'] as AdminTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'setup' && (
            <SetupTab
              workflow={selectedWorkflow}
              clients={clients}
              steps={steps}
              canManage={canManage}
              onChange={refresh}
            />
          )}

          {tab === 'progress' && (
            <ProgressTab
              workflow={selectedWorkflow}
              steps={steps}
              latestByStep={latestByStep}
              canManage={canManage}
              currentUserId={user?.id || null}
              onStepStatusChange={updateStepStatus}
              onChanged={refresh}
            />
          )}

          {tab === 'review' && (
            <ReviewTab
              steps={steps}
              latestByStep={latestByStep}
              canManage={canManage}
              onStepStatusChange={updateStepStatus}
            />
          )}
        </div>
      )}
    </div>
  )
}

function SetupTab({ workflow, clients, steps, canManage, onChange }: {
  workflow: ClientWorkflow
  clients: WorkflowClient[]
  steps: WorkflowStep[]
  canManage: boolean
  onChange: () => void
}) {
  const [title, setTitle] = useState(workflow.title)
  const [description, setDescription] = useState(workflow.description || '')
  const [stepTitle, setStepTitle] = useState('')
  const [stepDescription, setStepDescription] = useState('')
  const [stepInputType, setStepInputType] = useState<WorkflowInputType>('text')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')

  async function saveWorkflowMeta() {
    const { error } = await supabase
      .from('client_workflows')
      .update({ title, description: description || null })
      .eq('id', workflow.id)
    if (error) return toast.error(error.message)
    onChange()
    toast.success('Workflow settings saved')
  }

  async function addStep() {
    if (!stepTitle.trim()) return toast.error('Step title is required')
    if (steps.length >= 10) return toast.error('Maximum 10 steps allowed')

    const { error } = await supabase.from('workflow_steps').insert({
      workflow_id: workflow.id,
      title: stepTitle,
      description: stepDescription || null,
      input_type: stepInputType,
      step_order: steps.length + 1,
      status: 'not_started',
    })

    if (error) return toast.error(error.message)
    setStepTitle('')
    setStepDescription('')
    onChange()
  }

  async function inviteClient() {
    if (!inviteEmail.trim()) return toast.error('Client email is required')
    const { error } = await supabase.functions.invoke('invite-workflow-client', {
      body: { workflowId: workflow.id, email: inviteEmail, fullName: inviteName || null },
    })
    if (error) return toast.error(error.message)
    toast.success('Client invited and linked to workflow')
    setInviteEmail('')
    setInviteName('')
    onChange()
  }

  async function assignExistingClient(clientId: string) {
    const { error } = await supabase.from('client_workflows').update({ workflow_client_id: clientId || null }).eq('id', workflow.id)
    if (error) return toast.error(error.message)
    onChange()
  }

  async function reorder(step: WorkflowStep, direction: -1 | 1) {
    const target = steps.find((s) => s.step_order === step.step_order + direction)
    if (!target) return
    await supabase.from('workflow_steps').update({ step_order: -1 }).eq('id', step.id)
    await supabase.from('workflow_steps').update({ step_order: step.step_order }).eq('id', target.id)
    await supabase.from('workflow_steps').update({ step_order: target.step_order }).eq('id', step.id)
    onChange()
  }

  async function removeStep(stepId: string) {
    const { error } = await supabase.from('workflow_steps').delete().eq('id', stepId)
    if (error) return toast.error(error.message)
    onChange()
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Workflow setup</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border border-input px-3 py-2 text-sm" placeholder="Workflow title" disabled={!canManage} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded border border-input px-3 py-2 text-sm" rows={3} placeholder="Description / internal notes" disabled={!canManage} />
        <button onClick={saveWorkflowMeta} disabled={!canManage} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Save metadata</button>

        <div className="pt-2 border-t border-border space-y-2">
          <p className="text-sm font-medium">Assign / invite client</p>
          <select className="w-full rounded border border-input px-3 py-2 text-sm" value={workflow.workflow_client_id || ''} onChange={(e) => assignExistingClient(e.target.value)} disabled={!canManage}>
            <option value="">No client assigned</option>
            {clients.map((c) => <option value={c.id} key={c.id}>{c.full_name || c.email}</option>)}
          </select>
          <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="w-full rounded border border-input px-3 py-2 text-sm" placeholder="Client name (optional)" disabled={!canManage} />
          <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-full rounded border border-input px-3 py-2 text-sm" placeholder="client@example.com" disabled={!canManage} />
          <button onClick={inviteClient} disabled={!canManage} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Invite client</button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-semibold">Workflow steps ({steps.length}/10)</h3>
        <input value={stepTitle} onChange={(e) => setStepTitle(e.target.value)} className="w-full rounded border border-input px-3 py-2 text-sm" placeholder="Step title" disabled={!canManage} />
        <textarea value={stepDescription} onChange={(e) => setStepDescription(e.target.value)} className="w-full rounded border border-input px-3 py-2 text-sm" rows={2} placeholder="Instructions" disabled={!canManage} />
        <select value={stepInputType} onChange={(e) => setStepInputType(e.target.value as WorkflowInputType)} className="w-full rounded border border-input px-3 py-2 text-sm" disabled={!canManage}>
          <option value="text">Text response</option>
          <option value="file">File upload</option>
          <option value="image">Image upload</option>
        </select>
        <button onClick={addStep} disabled={!canManage} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Add step</button>

        <div className="space-y-2 pt-2 border-t border-border">
          {steps.map((step) => (
            <div key={step.id} className="rounded border border-border p-2 text-sm space-y-1">
              <div className="font-medium">{step.step_order}. {step.title}</div>
              <div className="text-muted-foreground text-xs">{step.input_type.toUpperCase()} · {step.status}</div>
              {canManage && (
                <div className="flex gap-2">
                  <button onClick={() => reorder(step, -1)} className="rounded border px-2 py-1 text-xs">↑</button>
                  <button onClick={() => reorder(step, 1)} className="rounded border px-2 py-1 text-xs">↓</button>
                  <button onClick={() => removeStep(step.id)} className="rounded border px-2 py-1 text-xs text-red-600">Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProgressTab({ workflow, steps, latestByStep, canManage, currentUserId, onStepStatusChange, onChanged }: {
  workflow: ClientWorkflow
  steps: WorkflowStep[]
  latestByStep: Map<string, WorkflowStepSubmission>
  canManage: boolean
  currentUserId: string | null
  onStepStatusChange: (step: WorkflowStep, status: WorkflowStepStatus) => Promise<void>
  onChanged: () => void
}) {
  const [activeStepId, setActiveStepId] = useState<string | null>(steps[0]?.id ?? null)
  const [textResponse, setTextResponse] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const activeStep = steps.find((s) => s.id === activeStepId) ?? null

  async function submitForReview() {
    if (!activeStep || !currentUserId) return

    let filePath: string | null = null
    if ((activeStep.input_type === 'file' || activeStep.input_type === 'image') && file) {
      const extension = file.name.split('.').pop() || 'bin'
      filePath = `workflow/${workflow.id}/step/${activeStep.id}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('workflow-documents').upload(filePath, file)
      if (uploadError) return toast.error(uploadError.message)
    }

    if (activeStep.input_type === 'text' && !textResponse.trim()) {
      return toast.error('Please enter a response before submitting')
    }

    const { error: insertError } = await supabase.from('workflow_step_submissions').insert({
      workflow_id: workflow.id,
      step_id: activeStep.id,
      submitted_by_user_id: currentUserId,
      submitted_by_role: 'firm_admin',
      text_response: activeStep.input_type === 'text' ? textResponse : null,
      file_path: filePath,
      file_name: file?.name || null,
      file_mime_type: file?.type || null,
      file_size: file?.size || null,
      note: note || null,
    })

    if (insertError) return toast.error(insertError.message)

    await onStepStatusChange(activeStep, 'for_review')
    setTextResponse('')
    setNote('')
    setFile(null)
    onChanged()
  }

  return (
    <div className="grid lg:grid-cols-[320px,1fr] gap-4">
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        {steps.map((step) => (
          <button
            key={step.id}
            onClick={() => setActiveStepId(step.id)}
            className={`w-full text-left rounded border px-3 py-2 ${activeStepId === step.id ? 'border-primary' : 'border-border'}`}
          >
            <div className="text-sm font-medium">{step.step_order}. {step.title}</div>
            <div className="text-xs text-muted-foreground">{step.status}</div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        {activeStep ? (
          <>
            <h3 className="font-semibold">{activeStep.title}</h3>
            {activeStep.description && <p className="text-sm text-muted-foreground">{activeStep.description}</p>}
            <p className="text-xs text-muted-foreground">Input type: {activeStep.input_type}</p>

            {activeStep.input_type === 'text' && (
              <textarea value={textResponse} onChange={(e) => setTextResponse(e.target.value)} rows={5} className="w-full rounded border border-input px-3 py-2 text-sm" placeholder="Enter your response" />
            )}
            {(activeStep.input_type === 'file' || activeStep.input_type === 'image') && (
              <input type="file" accept={activeStep.input_type === 'image' ? 'image/*' : undefined} onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
            )}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded border border-input px-3 py-2 text-sm" placeholder="Optional note" />

            <div className="flex gap-2 flex-wrap">
              <button onClick={submitForReview} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">Submit / move to review</button>
              {canManage && (
                <>
                  <button onClick={() => onStepStatusChange(activeStep, 'in_progress')} className="rounded border px-3 py-2 text-sm">Mark in progress</button>
                  <button onClick={() => onStepStatusChange(activeStep, 'complete')} className="rounded border px-3 py-2 text-sm">Mark complete</button>
                </>
              )}
            </div>

            {latestByStep.get(activeStep.id) && (
              <LatestSubmission submission={latestByStep.get(activeStep.id)!} />
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select or add a step.</p>
        )}
      </div>
    </div>
  )
}

function ReviewTab({ steps, latestByStep, canManage, onStepStatusChange }: {
  steps: WorkflowStep[]
  latestByStep: Map<string, WorkflowStepSubmission>
  canManage: boolean
  onStepStatusChange: (step: WorkflowStep, status: WorkflowStepStatus) => Promise<void>
}) {
  const reviewSteps = steps.filter((s) => s.status === 'for_review' || s.status === 'needs_info')

  return (
    <div className="space-y-3">
      {reviewSteps.length === 0 && <p className="text-sm text-muted-foreground">No steps awaiting review.</p>}
      {reviewSteps.map((step) => (
        <div key={step.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{step.step_order}. {step.title}</h3>
            <span className="text-xs text-muted-foreground">{step.status}</span>
          </div>
          {latestByStep.get(step.id) ? <LatestSubmission submission={latestByStep.get(step.id)!} /> : <p className="text-sm text-muted-foreground">No submission found.</p>}
          {canManage && (
            <div className="flex gap-2">
              <button onClick={() => onStepStatusChange(step, 'complete')} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">Mark complete</button>
              <button onClick={() => onStepStatusChange(step, 'needs_info')} className="rounded border px-3 py-2 text-sm">Request more info</button>
              <button onClick={() => onStepStatusChange(step, 'in_progress')} className="rounded border px-3 py-2 text-sm">Back to in progress</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function LatestSubmission({ submission }: { submission: WorkflowStepSubmission }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  async function loadUrl() {
    if (!submission.file_path) return
    const { data } = await supabase.storage.from('workflow-documents').createSignedUrl(submission.file_path, 60 * 30)
    setSignedUrl(data?.signedUrl || null)
  }

  return (
    <div className="rounded border border-border p-3 text-sm space-y-1">
      <p className="text-xs text-muted-foreground">Latest submission • {new Date(submission.created_at).toLocaleString()}</p>
      {submission.text_response && <p>{submission.text_response}</p>}
      {submission.note && <p className="text-muted-foreground">Note: {submission.note}</p>}
      {submission.file_path && (
        <button onClick={loadUrl} className="text-primary underline text-sm">
          {signedUrl ? <a href={signedUrl} target="_blank" rel="noreferrer">Open uploaded file</a> : 'Generate secure download link'}
        </button>
      )}
    </div>
  )
}
