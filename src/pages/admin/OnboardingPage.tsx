import { useState } from 'react'
import { Scale } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { generateSlug } from '@/lib/utils'
import { toast } from 'sonner'

export default function OnboardingPage() {
  const { user } = useAuth()
  const [firmName, setFirmName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setLoading(true)

    const slug = generateSlug(firmName)

    const { data: firm, error: firmError } = await supabase
      .from('firms')
      .insert({ name: firmName, slug, owner_user_id: user.id })
      .select('id')
      .single()

    if (firmError) {
      toast.error(firmError.message)
      setLoading(false)
      return
    }

    const { error: linkError } = await supabase
      .from('firm_users')
      .insert({ user_id: user.id, firm_id: firm.id, role: 'admin' })

    setLoading(false)

    if (linkError) {
      toast.error(linkError.message)
      return
    }

    toast.success('Firm created! Redirecting to dashboard...')
    // Force a page reload so AuthContext re-resolves firmId
    window.location.href = '/admin'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Scale className="h-10 w-10 text-primary mx-auto" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Set Up Your Firm</h1>
          <p className="mt-2 text-muted-foreground">Tell us about your practice to get started.</p>
        </div>
        <form onSubmit={handleCreate} className="bg-card rounded-xl border border-border p-8 shadow-sm space-y-4">
          <div>
            <label htmlFor="firmName" className="block text-sm font-medium text-foreground mb-1.5">Firm Name</label>
            <input
              id="firmName"
              type="text"
              required
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Smith & Partners Solicitors"
            />
            {firmName && (
              <p className="mt-1 text-xs text-muted-foreground">
                Your quote page URL: /quote/<span className="font-mono">{generateSlug(firmName)}</span>
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating firm...' : 'Create Firm & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
