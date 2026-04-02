import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  link_sent:   { label: 'Link Sent',   className: 'bg-gray-100 text-gray-600' },
  opened:      { label: 'Opened',      className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-700' },
  submitted:   { label: 'Submitted',   className: 'bg-green-100 text-green-700 font-semibold' },
  in_review:   { label: 'In Review',   className: 'bg-purple-100 text-purple-700' },
  approved:    { label: 'Approved',    className: 'bg-emerald-100 text-emerald-700' },
  signed:      { label: 'Signed',      className: 'bg-teal-100 text-teal-700 font-semibold' },
  archived:    { label: 'Archived',    className: 'bg-gray-50 text-gray-400' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs', cfg.className)}>
      {cfg.label}
    </span>
  )
}
