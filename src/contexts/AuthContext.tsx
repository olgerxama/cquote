import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  firmId: string | null
  isPlatformOwner: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  firmId: null,
  isPlatformOwner: false,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [firmId, setFirmId] = useState<string | null>(null)
  const [isPlatformOwner, setIsPlatformOwner] = useState(false)
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setLoading(true)
        resolveUserContext(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (!session?.user) {
        lastUserIdRef.current = null
        setFirmId(null)
        setIsPlatformOwner(false)
        setLoading(false)
        return
      }

      // Avoid context "refresh flashes" when the browser tab regains focus.
      // Supabase emits TOKEN_REFRESHED frequently; re-resolving firm context
      // on each token rotation makes the app feel like it reloads.
      const shouldResolve =
        event === 'SIGNED_IN' ||
        lastUserIdRef.current !== session.user.id

      if (!shouldResolve) return

      setLoading(true)
      resolveUserContext(session.user.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function resolveUserContext(userId: string) {
    lastUserIdRef.current = userId
    try {
      // Look up firm membership. Queries are independent so failures don't cascade.
      const firmResult = await supabase
        .from('firm_users')
        .select('firm_id')
        .eq('user_id', userId)
        .maybeSingle()

      let resolvedFirmId: string | null = firmResult.data?.firm_id ?? null

      // Fallback: if no firm_users row found (e.g. row exists but SELECT
      // errored, or row was genuinely missing), look up via owner_user_id.
      // This ensures the owner is never stuck on the onboarding screen.
      if (!resolvedFirmId) {
        const ownedFirmResult = await supabase
          .from('firms')
          .select('id')
          .eq('owner_user_id', userId)
          .maybeSingle()
        resolvedFirmId = ownedFirmResult.data?.id ?? null
      }

      setFirmId(resolvedFirmId)

      // platform_owner check is best-effort: failure must not block login
      try {
        const roleResult = await supabase.rpc('has_role', {
          _user_id: userId,
          _role: 'platform_owner',
        })
        setIsPlatformOwner(roleResult.data === true)
      } catch {
        setIsPlatformOwner(false)
      }
    } catch {
      setFirmId(null)
      setIsPlatformOwner(false)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setFirmId(null)
    setIsPlatformOwner(false)
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, firmId, isPlatformOwner, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
