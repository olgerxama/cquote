import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Shield, Building2, BarChart3, ArrowLeft, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Firms', href: '/owner', icon: Building2 },
  { label: 'Analytics', href: '/owner/analytics', icon: BarChart3 },
]

export default function OwnerLayout() {
  const location = useLocation()
  const { signOut, user } = useAuth()

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground">Platform Admin</span>
            <nav className="hidden sm:flex items-center gap-1 ml-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    location.pathname === item.href
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Admin
            </Link>
            <span className="text-xs text-muted-foreground">{user?.email}</span>
            <button onClick={signOut} className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
