'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

interface RadioCardOption {
  value: string
  title: string
  description?: string
  icon?: React.ReactNode
  badge?: string
}

interface RadioGroupProps {
  options: RadioCardOption[]
  value: string
  onChange: (value: string) => void
  name: string
  columns?: 1 | 2 | 3
  className?: string
}

function RadioGroup({ options, value, onChange, name, columns = 2, className }: RadioGroupProps) {
  return (
    <div
      className={cn(
        'grid gap-3',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-3',
        className
      )}
    >
      {options.map((opt) => (
        <label
          key={opt.value}
          className={cn(
            'relative flex cursor-pointer rounded-xl border-2 p-4 transition-all hover:border-[#7BA68C]/50 hover:bg-[#7BA68C]/5',
            value === opt.value
              ? 'border-[#1B2A4A] bg-[#1B2A4A]/5 shadow-sm'
              : 'border-gray-200 bg-white'
          )}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <div className="flex items-start gap-3 w-full">
            {opt.icon && (
              <div className={cn('mt-0.5 text-xl', value === opt.value ? 'text-[#1B2A4A]' : 'text-gray-400')}>
                {opt.icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={cn('font-medium text-sm', value === opt.value ? 'text-[#1B2A4A]' : 'text-gray-900')}>
                  {opt.title}
                </p>
                {opt.badge && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#7BA68C]/15 text-[#5f8a70] font-medium">
                    {opt.badge}
                  </span>
                )}
              </div>
              {opt.description && (
                <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">{opt.description}</p>
              )}
            </div>
            <div className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center transition-all',
              value === opt.value ? 'border-[#1B2A4A] bg-[#1B2A4A]' : 'border-gray-300'
            )}>
              {value === opt.value && <div className="h-2 w-2 rounded-full bg-white" />}
            </div>
          </div>
        </label>
      ))}
    </div>
  )
}

export { RadioGroup }
export type { RadioCardOption }
