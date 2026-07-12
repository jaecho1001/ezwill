'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AuthGuard } from '@/components/dashboard/auth-guard'
import { EzWillLogo } from '@/components/ui/brand'
import { logout } from '@/lib/auth'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/dashboard/clients', label: 'Clients', icon: 'users' },
  { href: '/dashboard/legal-library', label: 'Legal Library', icon: 'library' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'settings' },
]

function NavIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'home':
      return (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    case 'users':
      return (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    case 'settings':
      return (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    case 'library':
      return (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5.5A2.5 2.5 0 016.5 3H11v16H6.5A2.5 2.5 0 004 21.5v-16zM20 5.5A2.5 2.5 0 0017.5 3H13v16h4.5a2.5 2.5 0 012.5 2.5v-16z" />
        </svg>
      )
    default:
      return null
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Login page renders without sidebar/auth
  if (pathname === '/dashboard/login') {
    return <>{children}</>
  }

  return (
    <AuthGuard>
      <div className="flex h-screen bg-[#FAF8F5]">
        {/* Sidebar */}
        <aside className="flex w-64 flex-col border-r border-[#E8E4DF] bg-white">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2.5 border-b border-[#E8E4DF] px-6">
            <EzWillLogo className="h-8 w-8" />
            <span className="text-display text-lg font-bold text-[#1B2A4A]">EzWill</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1B2A4A]/10 text-[#1B2A4A]'
                      : 'text-gray-600 hover:bg-[#1B2A4A]/5 hover:text-[#1B2A4A]'
                  }`}
                >
                  <NavIcon icon={item.icon} />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* Sign Out + Footer */}
          <div className="border-t border-[#E8E4DF] px-3 py-3">
            <button
              onClick={() => logout()}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
          <div className="border-t border-[#E8E4DF] px-6 py-4">
            <p className="text-xs text-gray-400">EZWill v1.0</p>
          </div>
        </aside>

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-16 items-center justify-between border-b border-[#E8E4DF] bg-white px-8">
            <h1 className="text-sm font-semibold text-gray-900">Vaturi &amp; Cho LLP</h1>
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1B2A4A] text-sm font-medium text-white">
                JC
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-8">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
