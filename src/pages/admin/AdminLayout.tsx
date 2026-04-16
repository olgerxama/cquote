import { Outlet, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import {
  Scale,
  LayoutDashboard,
  Users,
  DollarSign,
  Settings,
  ClipboardList,
  ListChecks,
  LogOut,
  Shield,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Overview', icon: LayoutDashboard, group: 'overview' },
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard, group: 'overview' },
  { label: 'Pipeline', icon: Users, group: 'pipeline' },
  { label: 'Leads', href: '/admin/leads', icon: Users, group: 'pipeline' },
  { label: 'Instructions', href: '/admin/instructions', icon: ClipboardList, group: 'pipeline' },
  { label: 'Workflows', href: '/admin/workflows', icon: ListChecks, group: 'pipeline' },
  { label: 'Configuration', icon: Settings, group: 'configuration' },
  { label: 'Pricing', href: '/admin/pricing', icon: DollarSign, group: 'configuration' },
  { label: 'Settings', href: '/admin/settings', icon: Settings, group: 'configuration' },
]

export default function AdminLayout() {
  const location = useLocation()
  const { firmId, isPlatformOwner, signOut, user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { data: firm } = useQuery({
    queryKey: ['firm', firmId],
    queryFn: async () => {
      const { data } = await supabase.from('firms').select('*').eq('id', firmId!).single()
      return data
    },
    enabled: !!firmId,
  })

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-sidebar-border">
        <Link to="/admin" className="flex items-center gap-2">
          <Scale className="h-6 w-6 text-sidebar-primary" />
          <span className="text-lg font-bold text-sidebar-foreground">ConveyQuote</span>
        </Link>
        {firm && (
          <p className="mt-1 text-xs text-muted-foreground truncate">{firm.name}</p>
        )}
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item, i) => {
          if (!item.href) {
            return (
              <p key={i} className="px-3 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {item.label}
              </p>
            )
          }
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
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {isPlatformOwner && (
          <Link
            to="/owner"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <Shield className="h-4 w-4" />
            Platform Admin
          </Link>
        )}
        <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-card border-b border-border px-4 h-14">
        <Link to="/admin" className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <span className="font-bold">ConveyQuote</span>
        </Link>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setSidebarOpen(false)}>
          <div className="w-64 h-full bg-sidebar border-r border-sidebar-border" onClick={(e) => e.stopPropagation()}>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col border-r border-sidebar-border bg-sidebar">
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="lg:pl-64">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
