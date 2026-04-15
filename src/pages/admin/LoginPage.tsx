import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [mode, setMode] = useState<'password' | 'otp'>('otp')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      toast.error(error.message)
    } else {
      navigate('/admin')
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setOtpSent(true)
    toast.success('OTP sent to your email')
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode.trim(),
      type: 'email',
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Signed in successfully')
    navigate('/admin')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <Scale className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">ConveyQuote</span>
          </Link>
          <p className="mt-2 text-muted-foreground">Sign in to your dashboard</p>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-border p-1 bg-card">
          <button
            type="button"
            onClick={() => setMode('otp')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === 'otp' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Email OTP
          </button>
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === 'password' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Password
          </button>
        </div>

        <form
          onSubmit={mode === 'password' ? handleLogin : otpSent ? handleVerifyOtp : handleSendOtp}
          className="bg-card rounded-xl border border-border p-8 shadow-sm space-y-4"
        >
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
          {mode === 'password' ? (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Enter your password"
              />
            </div>
          ) : otpSent ? (
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-foreground mb-1.5">One-time code</label>
              <input
                id="otp"
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Enter 6-digit code"
              />
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading
              ? 'Please wait...'
              : mode === 'password'
                ? 'Sign In'
                : otpSent
                  ? 'Verify Code'
                  : 'Send OTP'}
          </button>
          {mode === 'otp' && otpSent && (
            <button
              type="button"
              onClick={() => {
                setOtpSent(false)
                setOtpCode('')
              }}
              className="w-full rounded-lg border border-input py-2 text-sm font-medium hover:bg-muted"
            >
              Use a different email
            </button>
          )}
          {mode === 'password' && (
            <p className="text-center text-sm text-muted-foreground">
              Forgot your password?{' '}
              <Link to="/admin/reset-password" className="text-primary hover:underline font-medium">Reset with OTP</Link>
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/admin/signup" className="text-primary hover:underline font-medium">Sign up</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
