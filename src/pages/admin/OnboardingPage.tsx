import { useState } from 'react'
import { Scale } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { generateSlug } from '@/lib/utils'

export default function OnboardingPage() {
  const { user } = useAuth()
  const [firmName, setFirmName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!user) {
      setError('Not logged in. Please refresh and try again.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      // ── Self-repair: check if this user already has a firm via firm_users ──
      // This handles accounts that previously created a firm but whose
      // firm_users link was never written (e.g. RLS race on first signup).
      const { data: existingLink } = await supabase
        .from('firm_users')
        .select('firm_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (existingLink?.firm_id) {
        // firm_users link already exists — just reload into admin
        window.location.href = '/admin'
        return
      }

      // Check if the user owns a firm directly (firm_users row may be missing)
      const { data: ownedFirm } = await supabase
        .from('firms')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle()

      if (ownedFirm?.id) {
        // Firm exists but firm_users link is missing — repair it
        const { error: repairError } = await supabase
          .from('firm_users')
          .insert({ user_id: user.id, firm_id: ownedFirm.id, role: 'admin' })

        if (repairError) {
          console.error('firm_users repair error:', repairError)
          setError(repairError.message)
          return
        }
        window.location.href = '/admin'
        return
      }

      // ── Normal path: create a brand-new firm ──
      const slug = generateSlug(firmName)

      const { data: firm, error: firmError } = await supabase
        .from('firms')
        .insert({ name: firmName, slug, owner_user_id: user.id })
        .select('id')
        .single()

      if (firmError) {
        console.error('firms insert error:', firmError)
        setError(firmError.message)
        return
      }

      const { error: linkError } = await supabase
        .from('firm_users')
        .insert({ user_id: user.id, firm_id: firm.id, role: 'admin' })

      if (linkError) {
        console.error('firm_users insert error:', linkError)
        setError(linkError.message)
        return
      }

      // Full reload so AuthContext re-resolves firmId from the new firm_users row
      window.location.href = '/admin'
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Scale className="h-10 w-10 text-primary mx-auto" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Set Up Your Firm</h1>
          <p className="mt-2 text-muted-foreground">Tell us about your practice to get started.</p>
        </div>

        <form
          onSubmit={handleCreate}
          className="bg-card rounded-xl border border-border p-8 shadow-sm space-y-4"
        >
          <div>
            <label htmlFor="firmName" className="block text-sm font-medium text-foreground mb-1.5">
              Firm Name
            </label>
            <input
              id="firmName"
              type="text"
              value={firmName}
              onChange={(e) => {
                setFirmName(e.target.value)
                setError(null)
              }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Smith & Partners Solicitors"
            />
            {firmName && (
              <p className="mt-1 text-xs text-muted-foreground">
                Your quote page URL: /quote/
                <span className="font-mono">{generateSlug(firmName)}</span>
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
              <strong>Error:</strong> {error}
              {error.includes('does not exist') && (
                <p className="mt-1 text-xs">
                  The database schema has not been applied yet. Please follow the setup steps in the README.
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Checking…' : firmName.trim() ? 'Create Firm & Continue' : 'Continue →'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Logged in as <span className="font-mono">{user?.email}</span>
        </p>
      </div>
    </div>
  )
}
