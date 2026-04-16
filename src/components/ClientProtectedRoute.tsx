import { Navigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'

export function ClientProtectedRoute() {
  const { user, loading } = useAuth()

  const { data: assignmentCount = 0, isLoading } = useQuery({
    queryKey: ['client-assignment-count', user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('workflow_clients')
        .select('id', { count: 'exact', head: true })
        .eq('auth_user_id', user!.id)
      return count ?? 0
    },
    enabled: !!user,
  })

  if (loading || isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading…</div>
  }

  if (!user) return <Navigate to="/client/login" replace />
  if (assignmentCount < 1) return <Navigate to="/client/login" replace />

  return <Outlet />
}
