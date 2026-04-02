'use client'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function WillError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-center px-4">
      <div className="space-y-4">
        <p className="text-4xl">⚠️</p>
        <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
        <p className="text-sm text-gray-500">Don&apos;t worry — your progress has been saved.</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  )
}
