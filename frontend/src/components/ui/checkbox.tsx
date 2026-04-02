'use client'
import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5">
        <input type="checkbox" id={id} ref={ref} className="sr-only peer" {...props} />
        <div className={cn(
          'h-5 w-5 rounded border-2 border-gray-300 bg-white transition-all peer-checked:bg-amber-500 peer-checked:border-amber-500 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400 group-hover:border-amber-400',
          className
        )} />
        <Check className="absolute inset-0 m-auto h-3 w-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
      </div>
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  )
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
