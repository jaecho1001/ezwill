'use client'
import * as React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value?: string // ISO date string YYYY-MM-DD
  onChange: (value: string) => void
  maxYear?: number
  minYear?: number
  className?: string
  disabled?: boolean
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function DatePicker({ value, onChange, maxYear, minYear, className, disabled }: DatePickerProps) {
  const parsed = value ? new Date(value + 'T12:00:00') : null
  const [year, setYear] = React.useState(parsed ? parsed.getFullYear().toString() : '')
  const [month, setMonth] = React.useState(parsed ? (parsed.getMonth() + 1).toString() : '')
  const [day, setDay] = React.useState(parsed ? parsed.getDate().toString() : '')

  const currentYear = new Date().getFullYear()
  const max = maxYear ?? currentYear
  const min = minYear ?? 1920
  const years = Array.from({ length: max - min + 1 }, (_, i) => (max - i).toString())
  const daysInMonth = year && month ? new Date(parseInt(year), parseInt(month), 0).getDate() : 31
  const days = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString())

  React.useEffect(() => {
    if (year && month && day) {
      const d = parseInt(day)
      const m = parseInt(month)
      const y = parseInt(year)
      const mm = m.toString().padStart(2, '0')
      const dd = d.toString().padStart(2, '0')
      onChange(`${y}-${mm}-${dd}`)
    }
  }, [year, month, day])

  return (
    <div className={cn('flex gap-2', className)}>
      <Select value={month} onValueChange={setMonth} disabled={disabled}>
        <SelectTrigger className="flex-[2]"><SelectValue placeholder="Month" /></SelectTrigger>
        <SelectContent>
          {MONTHS.map((m, i) => (
            <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={day} onValueChange={setDay} disabled={disabled}>
        <SelectTrigger className="flex-1"><SelectValue placeholder="Day" /></SelectTrigger>
        <SelectContent>
          {days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={year} onValueChange={setYear} disabled={disabled}>
        <SelectTrigger className="flex-[1.5]"><SelectValue placeholder="Year" /></SelectTrigger>
        <SelectContent>
          {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

export { DatePicker }
