import { Link } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function NoFirmAccessPage() {
  const { user, noFirmMessage, signOut } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="text-center mb-6">
          <Scale className="h-10 w-10 text-primary mx-auto" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">No firm access</h1>
          <p className="mt-2 text-muted-foreground">
            {noFirmMessage || 'Your account currently has no firm membership.'}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          Logged in as <span className="font-mono">{user?.email}</span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => signOut()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign out
          </button>
          <Link
            to="/admin/login"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
