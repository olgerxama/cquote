import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export default function ClientLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return toast.error(error.message)
    navigate('/client/workflows')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-xl border border-border bg-card p-8 space-y-4">
        <div className="text-center">
          <Scale className="h-8 w-8 text-primary mx-auto" />
          <h1 className="text-2xl font-bold mt-2">Client portal login</h1>
          <p className="text-sm text-muted-foreground mt-1">Access your matter workflow and required documents.</p>
        </div>
        <input className="w-full rounded border border-input px-3 py-2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <input className="w-full rounded border border-input px-3 py-2" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <button disabled={loading} className="w-full rounded bg-primary py-2 text-primary-foreground">{loading ? 'Signing in...' : 'Sign in'}</button>
        <p className="text-center text-sm text-muted-foreground">Need an account? Use your invitation email first.</p>
        <Link to="/" className="block text-center text-sm text-primary">Back to home</Link>
      </form>
    </div>
  )
}
