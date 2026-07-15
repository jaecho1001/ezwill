import * as React from 'react'
import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  max?: number
  className?: string
  showLabel?: boolean
}

function Progress({ value, max = 100, className, showLabel }: ProgressProps) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100)
  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-gray-200', className)}>
      <div
        className="h-full bg-[#1B2A4A] transition-all duration-500 ease-out rounded-full"
        style={{ width: `${pct}%` }}
      />
      {showLabel && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  )
}

export { Progress }
