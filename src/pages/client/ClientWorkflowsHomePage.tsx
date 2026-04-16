import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import type { ClientWorkflow, WorkflowStep, WorkflowStepStatus, WorkflowStepSubmission } from '@/types'

export default function ClientWorkflowsHomePage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [textResponse, setTextResponse] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const { data: workflows = [] } = useQuery({
    queryKey: ['client-my-workflows', user?.id],
    queryFn: async () => {
      const { data: myClientRows } = await supabase.from('workflow_clients').select('id').eq('auth_user_id', user!.id)
      const ids = (myClientRows || []).map((row) => row.id)
      if (ids.length === 0) return [] as ClientWorkflow[]
      const { data, error } = await supabase.from('client_workflows').select('*').in('workflow_client_id', ids).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ClientWorkflow[]
    },
    enabled: !!user,
  })

  const selected = workflows.find((w) => w.id === selectedId) ?? workflows[0] ?? null

  const { data: steps = [] } = useQuery({
    queryKey: ['client-workflow-steps', selected?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('workflow_steps').select('*').eq('workflow_id', selected!.id).order('step_order')
      if (error) throw error
      return (data ?? []) as WorkflowStep[]
    },
    enabled: !!selected?.id,
  })

  const { data: submissions = [] } = useQuery({
    queryKey: ['client-workflow-subs', selected?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('workflow_step_submissions').select('*').eq('workflow_id', selected!.id).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as WorkflowStepSubmission[]
    },
    enabled: !!selected?.id,
  })

  const latestByStep = useMemo(() => {
    const map = new Map<string, WorkflowStepSubmission>()
    submissions.forEach((s) => {
      if (!map.has(s.step_id)) map.set(s.step_id, s)
    })
    return map
  }, [submissions])

  async function submitStep(step: WorkflowStep) {
    if (!selected || !user) return
    if (step.input_type === 'text' && !textResponse.trim()) return toast.error('Enter text before submitting')

    let filePath: string | null = null
    if ((step.input_type === 'file' || step.input_type === 'image') && file) {
      filePath = `workflow/${selected.id}/step/${step.id}/${crypto.randomUUID()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('workflow-documents').upload(filePath, file)
      if (uploadError) return toast.error(uploadError.message)
    }

    const { error } = await supabase.from('workflow_step_submissions').insert({
      workflow_id: selected.id,
      step_id: step.id,
      submitted_by_user_id: user.id,
      submitted_by_role: 'client',
      text_response: step.input_type === 'text' ? textResponse : null,
      file_path: filePath,
      file_name: file?.name || null,
      file_mime_type: file?.type || null,
      file_size: file?.size || null,
    })
    if (error) return toast.error(error.message)

    const { error: stepError } = await supabase.from('workflow_steps').update({ status: 'for_review' as WorkflowStepStatus }).eq('id', step.id)
    if (stepError) return toast.error(stepError.message)

    await supabase.functions.invoke('workflow-status-email', {
      body: { workflowId: selected.id, stepId: step.id, eventType: 'for_review' },
    })

    setTextResponse('')
    setFile(null)
    toast.success('Submitted for review')
    queryClient.invalidateQueries({ queryKey: ['client-workflow-steps', selected.id] })
    queryClient.invalidateQueries({ queryKey: ['client-workflow-subs', selected.id] })
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">My Workflow</h1>
      <div className="rounded-xl border border-border bg-card p-4">
        <select value={selected?.id || ''} onChange={(e) => setSelectedId(e.target.value || null)} className="rounded border border-input px-3 py-2 text-sm min-w-80">
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>{w.title}</option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="space-y-3">
          <p className="text-muted-foreground">{selected.description}</p>
          {steps.map((step) => (
            <div key={step.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">{step.step_order}. {step.title}</h3>
                <span className="text-xs text-muted-foreground">{step.status}</span>
              </div>
              {step.description && <p className="text-sm text-muted-foreground">{step.description}</p>}
              {step.input_type === 'text' ? (
                <textarea value={textResponse} onChange={(e) => setTextResponse(e.target.value)} className="w-full rounded border border-input px-3 py-2 text-sm" rows={3} />
              ) : (
                <input type="file" accept={step.input_type === 'image' ? 'image/*' : undefined} onChange={(e) => setFile(e.target.files?.[0] || null)} />
              )}
              <button className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => submitStep(step)}>Submit</button>
              {latestByStep.get(step.id)?.created_at && (
                <p className="text-xs text-muted-foreground">Last submitted: {new Date(latestByStep.get(step.id)!.created_at).toLocaleString()}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
