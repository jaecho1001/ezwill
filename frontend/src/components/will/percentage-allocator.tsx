'use client'
import { Input } from '@/components/ui/input'
import type { PersonData } from '@/lib/types/will'

interface PercentageAllocatorProps {
  people: PersonData[]
  onChange: (updated: PersonData[]) => void
}

export function PercentageAllocator({ people, onChange }: PercentageAllocatorProps) {
  const total = people.reduce((sum, p) => sum + (p.percentage ?? 0), 0)
  const isValid = total === 100

  function handleChange(id: string, pct: number) {
    onChange(people.map(p => p.id === id ? { ...p, percentage: pct } : p))
  }

  return (
    <div className="space-y-3">
      {people.map(p => (
        <div key={p.id} className="flex items-center gap-3">
          <div className="flex-1 text-sm text-gray-700">
            {p.firstName} {p.lastName}
            {p.relationship && <span className="text-gray-400 text-xs ml-1">({p.relationship})</span>}
          </div>
          <div className="flex items-center gap-1.5 w-24">
            <Input
              type="number"
              min={0}
              max={100}
              value={p.percentage ?? 0}
              onChange={e => handleChange(p.id, Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
              className="text-center"
            />
            <span className="text-sm text-gray-500">%</span>
          </div>
        </div>
      ))}
      <div className={`flex justify-between text-sm pt-2 border-t ${isValid ? 'text-green-600' : 'text-red-500'}`}>
        <span>Total</span>
        <span className="font-semibold">{total}% {isValid ? '✓' : `(needs ${100 - total}% more)`}</span>
      </div>
    </div>
  )
}
