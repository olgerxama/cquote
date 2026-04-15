import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const flow = searchParams.get('flow')
  const initialEmail = searchParams.get('email') || ''
  const isSignupFlow = flow === 'signup'
  const [email, setEmail] = useState(initialEmail)
  const [otpCode, setOtpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [step, setStep] = useState<'request' | 'verify' | 'setPassword'>(isSignupFlow ? 'verify' : 'request')
  const [loading, setLoading] = useState(false)

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
    setStep('verify')
    toast.success('Password reset OTP sent')
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
    setStep('setPassword')
    toast.success('Code verified. Set your new password.')
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }

    if (isSignupFlow) {
      toast.success('Password set. Let’s finish your onboarding.')
      navigate('/admin/onboarding')
      return
    }

    toast.success('Password updated. You can now sign in.')
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
          <p className="mt-2 text-muted-foreground">Reset password using email OTP</p>
        </div>

        <form
          onSubmit={step === 'request' ? handleSendOtp : step === 'verify' ? handleVerifyOtp : handleSetPassword}
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
              disabled={step !== 'request' || isSignupFlow}
            />
          </div>

          {step === 'verify' && (
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
          )}

          {step === 'setPassword' && (
            <>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">New password</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-foreground mb-1.5">Confirm password</label>
                <input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading
              ? 'Please wait...'
              : step === 'request'
                ? 'Send OTP'
                : step === 'verify'
                  ? 'Verify code'
                  : 'Set new password'}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            {isSignupFlow ? (
              <>
                Need a different email?{' '}
                <Link to="/admin/signup" className="text-primary hover:underline font-medium">Start signup again</Link>
              </>
            ) : (
              <>
                Back to{' '}
                <Link to="/admin/login" className="text-primary hover:underline font-medium">Sign in</Link>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
