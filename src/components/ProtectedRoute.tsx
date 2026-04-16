import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'

export function ProtectedRoute() {
  const { user, loading, firmId, signOut } = useAuth()

  const { data: firmIsActive, isLoading: firmCheckLoading } = useQuery({
    queryKey: ['firm-active-status', firmId],
    queryFn: async () => {
      const { data } = await supabase.from('firms').select('is_active').eq('id', firmId!).maybeSingle()
      return data?.is_active !== false
    },
    enabled: !!user && !!firmId,
    staleTime: 15000,
    refetchInterval: 30000,
  })

  useEffect(() => {
    if (firmIsActive === false) {
      signOut().catch(() => undefined)
    }
  }, [firmIsActive, signOut])

  if (loading || firmCheckLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  if (!firmId) {
    return <Navigate to="/admin/no-access" replace />
  }

  if (firmIsActive === false) {
    return <Navigate to="/admin/login" replace />
  }

  return <Outlet />
}
