import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export default function ClientAcceptInvitePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return toast.error('Password must be at least 8 characters')
    if (password !== confirm) return toast.error('Passwords do not match')

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setLoading(false)
      return toast.error(error.message)
    }

    const workflowId = params.get('workflowId')
    const { error: acceptError } = await supabase.functions.invoke('accept-workflow-client-invite', {
      body: { workflowId },
    })
    setLoading(false)

    if (acceptError) return toast.error(acceptError.message)
    toast.success('Invite accepted. Welcome!')
    navigate('/client/workflows')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-xl border border-border bg-card p-8 space-y-4">
        <h1 className="text-2xl font-bold">Accept client invite</h1>
        <p className="text-sm text-muted-foreground">Set your password to access your workflow portal.</p>
        <input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded border border-input px-3 py-2" placeholder="New password" />
        <input type="password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded border border-input px-3 py-2" placeholder="Confirm password" />
        <button disabled={loading} className="w-full rounded bg-primary py-2 text-primary-foreground">{loading ? 'Saving...' : 'Set password & continue'}</button>
      </form>
    </div>
  )
}
