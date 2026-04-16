import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export default function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/admin/onboarding`,
      },
    })
    setLoading(false)

    if (error) {
      if (error.message.toLowerCase().includes('security purposes')) {
        toast.success('Magic link already requested. Please check your inbox (and spam folder).')
        navigate('/admin/login')
        return
      }
      toast.error(error.message)
      return
    }

    toast.success('Magic link sent. Check your email to finish signup.')
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <Scale className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">ConveyQuote</span>
          </Link>
          <p className="mt-2 text-muted-foreground">Create your account</p>
        </div>
        <form onSubmit={handleSignup} className="bg-card rounded-xl border border-border p-8 shadow-sm space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@lawfirm.co.uk"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Continue'}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/admin/login" className="text-primary hover:underline font-medium">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
