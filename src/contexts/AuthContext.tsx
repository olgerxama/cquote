import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  firmId: string | null
  firmRole: 'admin' | 'read_only' | null
  noFirmMessage: string | null
  isPlatformOwner: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  firmId: null,
  firmRole: null,
  noFirmMessage: null,
  isPlatformOwner: false,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [firmId, setFirmId] = useState<string | null>(null)
  const [firmRole, setFirmRole] = useState<'admin' | 'read_only' | null>(null)
  const [noFirmMessage, setNoFirmMessage] = useState<string | null>(null)
  const [isPlatformOwner, setIsPlatformOwner] = useState(false)
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        setLoading(true)
        resolveUserContext(session.user.id, session.user.user_metadata || {})
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      if (!session?.user) {
        lastUserIdRef.current = null
        setFirmId(null)
        setFirmRole(null)
        setNoFirmMessage(null)
        setIsPlatformOwner(false)
        setLoading(false)
        return
      }

      // Avoid context "refresh flashes" when the browser tab regains focus.
      // Supabase emits TOKEN_REFRESHED frequently; re-resolving firm context
      // on each token rotation makes the app feel like it reloads.
      // Only resolve context when the authenticated user identity changes.
      // This avoids "auto refresh" behavior on tab focus/token refresh cycles.
      const shouldResolve = lastUserIdRef.current !== session.user.id

      if (!shouldResolve) return

      setLoading(true)
      resolveUserContext(session.user.id, session.user.user_metadata || {})
    })

    return () => subscription.unsubscribe()
  }, [])

  async function resolveUserContext(userId: string, userMetadata: Record<string, unknown>) {
    lastUserIdRef.current = userId
    try {
      const preferredFirmId = localStorage.getItem('cq_preferred_firm_id')
      let resolvedFirmId: string | null = null
      let isOwnerForResolvedFirm = false

      // 1) If a preferred firm was recently set (e.g. invite accept), honor it
      // only if the user is actually linked to it.
      if (preferredFirmId) {
        const preferredMembershipResult = await supabase
          .from('firm_users')
          .select('firm_id')
          .eq('user_id', userId)
          .eq('firm_id', preferredFirmId)
          .limit(1)
          .maybeSingle()

        if (preferredMembershipResult.data?.firm_id) {
          resolvedFirmId = preferredFirmId
        }
      }

      // 2) Robust fallback: use security-definer RPC (bypasses RLS edge cases).
      if (!resolvedFirmId) {
        const rpcResult = await supabase.rpc('get_user_firm_id', { _user_id: userId })
        resolvedFirmId = (rpcResult.data as string | null) ?? null
      }

      // 3) Secondary fallback: plain query for membership rows.
      if (!resolvedFirmId) {
        const membershipResult = await supabase
          .from('firm_users')
          .select('firm_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        resolvedFirmId = membershipResult.data?.firm_id ?? null
      }

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
        isOwnerForResolvedFirm = !!ownedFirmResult.data?.id
      }

      // If we resolved a firm via membership/RPC, still verify owner status so
      // owners are always treated as admin-capable even without a firm_users row.
      if (resolvedFirmId && !isOwnerForResolvedFirm) {
        const ownerCheck = await supabase
          .from('firms')
          .select('id')
          .eq('id', resolvedFirmId)
          .eq('owner_user_id', userId)
          .maybeSingle()
        isOwnerForResolvedFirm = !!ownerCheck.data?.id
      }

      setFirmId(resolvedFirmId)
      if (resolvedFirmId) {
        localStorage.setItem('cq_preferred_firm_id', resolvedFirmId)
        setNoFirmMessage(null)
      } else {
        localStorage.removeItem('cq_preferred_firm_id')
        const invitedFirmId = typeof userMetadata.firm_id === 'string' ? userMetadata.firm_id : null
        if (invitedFirmId || preferredFirmId) {
          setNoFirmMessage('Your account is no longer attached to a firm. Please contact your firm admin to be re-invited.')
        } else {
          setNoFirmMessage(null)
        }
      }

      let resolvedFirmRole: 'admin' | 'read_only' | null = null
      if (resolvedFirmId) {
        const activeCheck = await supabase
          .from('firms')
          .select('is_active')
          .eq('id', resolvedFirmId)
          .maybeSingle()

        if (activeCheck.data?.is_active === false) {
          setFirmId(null)
          setFirmRole(null)
          setNoFirmMessage('This firm account has been deactivated by the platform owner.')
          localStorage.removeItem('cq_preferred_firm_id')
          resolvedFirmId = null
        }
      }

      if (resolvedFirmId) {
        if (isOwnerForResolvedFirm) {
          resolvedFirmRole = 'admin'
        } else {
          const roleResult = await supabase
            .from('firm_users')
            .select('role')
            .eq('firm_id', resolvedFirmId)
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle()
          resolvedFirmRole = (roleResult.data?.role as 'admin' | 'read_only' | null) ?? null
        }
      }
      setFirmRole(resolvedFirmRole)

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
      setFirmRole(null)
      setNoFirmMessage(null)
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
    setFirmRole(null)
    setNoFirmMessage(null)
    setIsPlatformOwner(false)
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, firmId, firmRole, noFirmMessage, isPlatformOwner, signOut }}>
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
