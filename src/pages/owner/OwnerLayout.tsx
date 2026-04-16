import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Shield, Building2, BarChart3, ArrowLeft, LogOut, Users, ClipboardList, LineChart, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const navItems = [
  { label: 'Firms', href: '/owner', icon: Building2 },
  { label: 'Leads', href: '/owner/leads', icon: Users },
  { label: 'Instructions', href: '/owner/instructions', icon: ClipboardList },
  { label: 'Analytics', href: '/owner/analytics', icon: BarChart3 },
  { label: 'Reports', href: '/owner/reports', icon: LineChart },
]

export default function OwnerLayout() {
  const location = useLocation()
  const { signOut, user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="p-4 border-b border-sidebar-border">
        <Link to="/owner" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
          <Shield className="h-6 w-6 text-sidebar-primary" />
          <span className="text-lg font-bold text-sidebar-foreground">Platform Admin</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = location.pathname === item.href
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        <Link
          to="/admin"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Firm Admin
        </Link>
        <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-card border-b border-border px-4 h-14">
        <Link to="/owner" className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-bold">Platform Admin</span>
        </Link>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setSidebarOpen(false)}>
          <div className="w-72 h-full bg-sidebar border-r border-sidebar-border" onClick={(e) => e.stopPropagation()}>
            {sidebarContent}
          </div>
        </div>
      )}

      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col border-r border-sidebar-border bg-sidebar">
        {sidebarContent}
      </aside>

      <main className="lg:pl-72">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
