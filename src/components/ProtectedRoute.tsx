import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute() {
  const { user, loading, firmId, noFirmMessage } = useAuth()

  if (loading) {
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
    if (noFirmMessage) {
      return <Navigate to="/admin/no-access" replace />
    }
    return <Navigate to="/admin/onboarding" replace />
  }

  return <Outlet />
}
