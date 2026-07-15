'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/auth'
import { EzWillLogo } from '@/components/ui/brand'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const success = await login(password)
      if (success) {
        router.push('/dashboard')
      } else {
        setError('Invalid password. Please try again.')
      }
    } catch {
      setError('Unable to connect. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
      <div className="w-full max-w-sm">
        {/* Logo + heading */}
        <div className="mb-8 text-center">
          <EzWillLogo className="mx-auto mb-3 h-14 w-14" />
          <h1 className="text-display text-2xl font-bold text-[#1B2A4A]">EzWill</h1>
          <p className="mt-1 text-sm text-[#2D2D2D]/50">Lawyer Portal</p>
        </div>

        {/* Login card */}
        <div className="rounded-xl border border-[#E8E4DF] bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Firm Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your firm password"
                required
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/25 transition-colors"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-lg bg-[#1B2A4A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#16233d] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Vaturi &amp; Cho LLP &mdash; EZWill v1.0
        </p>
      </div>
    </div>
  )
}
