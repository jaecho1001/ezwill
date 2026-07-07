'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  useEffect(() => {
    if (isAuthenticated()) {
      setStatus('authenticated')
    } else {
      setStatus('unauthenticated')
      router.replace('/dashboard/login')
    }
  }, [router])

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FAF8F5]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B2A4A] border-t-transparent" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  return <>{children}</>
}
