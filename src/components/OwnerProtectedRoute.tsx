import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function OwnerProtectedRoute() {
  const { user, loading, isPlatformOwner } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user || !isPlatformOwner) {
    return <Navigate to="/admin/login" replace />
  }

  return <Outlet />
}
