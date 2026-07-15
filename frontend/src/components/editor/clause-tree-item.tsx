'use client'

import type { WillClauseTemplate } from '@/types/will-document'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface ClauseTreeItemProps {
  clause: WillClauseTemplate
  isSelected: boolean
  isIncluded: boolean
  onSelect: () => void
  onToggleInclude: () => void
  depth: number
  hasCustomText?: boolean
  isDefault?: boolean
  isRecentlyAdded?: boolean
  draggable?: boolean
  isDragTarget?: boolean
  applicability?: 'yes' | 'no' | 'unknown'
  onDragStart?: (id: string) => void
  onDragOver?: (id: string, e: React.DragEvent) => void
  onDrop?: (id: string) => void
  onDragEnd?: () => void
}

export function ClauseTreeItem({
  clause,
  isSelected,
  isIncluded,
  onSelect,
  onToggleInclude,
  depth,
  hasCustomText,
  isDefault,
  isRecentlyAdded,
  draggable,
  isDragTarget,
  applicability,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ClauseTreeItemProps) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!onDragStart) return
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', clause.id)
        onDragStart(clause.id)
      }}
      onDragOver={(e) => {
        if (!onDragOver) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver(clause.id, e)
      }}
      onDrop={(e) => {
        if (!onDrop) return
        e.preventDefault()
        onDrop(clause.id)
      }}
      onDragEnd={() => onDragEnd?.()}
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors cursor-pointer border-l-2',
        isSelected
          ? 'bg-[#1B2A4A]/5 border-[#1B2A4A]'
          : isIncluded
            ? 'border-[#7BA68C] hover:bg-gray-50'
            : 'border-transparent hover:bg-gray-50',
        !isIncluded && !clause.isFolder && 'opacity-60 hover:opacity-100',
        isDragTarget && 'ring-2 ring-[#1B2A4A] ring-inset',
        isRecentlyAdded && 'bg-[#C9A84C]/15 ring-2 ring-[#C9A84C]/50 ring-inset'
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={onSelect}
    >
      {/* Checkbox */}
      <div
        className="relative shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onToggleInclude()
        }}
      >
        <input
          type="checkbox"
          checked={isIncluded}
          readOnly
          className="sr-only peer"
        />
        <div
          className={cn(
            'h-4 w-4 rounded border-2 transition-all cursor-pointer',
            isIncluded
              ? 'bg-[#7BA68C] border-[#7BA68C]'
              : 'bg-white border-gray-300 hover:border-[#7BA68C]'
          )}
        />
        {isIncluded && (
          <svg
            className="absolute inset-0 m-auto h-2.5 w-2.5 text-white pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'text-sm truncate',
              clause.isFolder ? 'font-semibold text-gray-900' : 'text-gray-700'
            )}
          >
            {clause.name}
          </span>
          {hasCustomText && (
            <span className="shrink-0 text-xs text-[#C9A84C]" title="Custom text">
              &#9998;
            </span>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex shrink-0 items-center gap-1">
        {isDefault && (
          <span
            className="rounded bg-[#1B2A4A]/8 px-1.5 py-0 text-[10px] font-medium text-[#1B2A4A]"
            title="Included in the default clause set for this document"
          >
            Default
          </span>
        )}
        {applicability === 'unknown' && (
          <span
            className="rounded bg-[#C9A84C]/15 px-1.5 py-0 text-[10px] font-medium text-[#8a6a1e]"
            title="Needs intake answers to know if this applies"
          >
            ?
          </span>
        )}
        <Badge
          variant={clause.tier === 1 ? 'secondary' : 'warning'}
          className="text-[10px] px-1.5 py-0"
        >
          T{clause.tier}
        </Badge>
        {clause.statute && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 max-w-[80px] truncate">
            {clause.statute}
          </Badge>
        )}
      </div>
    </div>
  )
}
