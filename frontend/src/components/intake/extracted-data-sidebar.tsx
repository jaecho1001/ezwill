'use client'

import type { WillVault } from '@/types/will-vault'
import { willIntakeChapters, chapterProgress } from '@/lib/intake/will-intake-script'

interface Props {
  vault: WillVault
  onJumpTo?: (chapterIndex: number) => void
}

/**
 * Live "what we've captured so far" sidebar. Each chapter becomes a small
 * section with label/value rows; empty fields render as "—". Mirrors the
 * DivorceMate intake right panel pattern but scoped to the will vault.
 */
export function ExtractedDataSidebar({ vault, onJumpTo }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {willIntakeChapters.map((ch, i) => {
        const rows = summarizeChapter(ch.id, vault)
        const p = chapterProgress(ch, vault)
        return (
          <div key={ch.id} className="rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => onJumpTo?.(i)}
              className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-gray-800">
                <span>{ch.icon}</span>
                {ch.title}
              </span>
              <span className="text-[10px] text-gray-400">{p.pct}%</span>
            </button>
            <dl className="divide-y divide-gray-50 text-xs">
              {rows.length === 0 ? (
                <div className="px-3 py-2 text-gray-400 italic">Not started</div>
              ) : (
                rows.map((r) => (
                  <div key={r.label} className="flex items-start gap-2 px-3 py-1.5">
                    <dt className="w-28 shrink-0 text-gray-500">{r.label}</dt>
                    <dd className={'min-w-0 flex-1 ' + (r.value ? 'font-medium text-gray-800' : 'text-gray-300')}>
                      {r.value || '—'}
                    </dd>
                  </div>
                ))
              )}
            </dl>
          </div>
        )
      })}
    </div>
  )
}

function summarizeChapter(
  chapterId: string,
  v: WillVault
): Array<{ label: string; value: string }> {
  switch (chapterId) {
    case 'testator':
      return [
        { label: 'Full name', value: v.testator.fullName ?? '' },
        { label: 'Date of birth', value: v.testator.dob ?? '' },
        { label: 'Address', value: v.testator.address ?? '' },
        { label: 'Marital status', value: v.testator.maritalStatus ?? '' },
      ]
    case 'family':
      return [
        { label: 'Spouse', value: v.spouse?.included && v.spouse.fullName ? v.spouse.fullName : '' },
        { label: 'Children', value: v.children.length ? `${v.children.length} listed` : '' },
      ]
    case 'executors':
      return [
        { label: 'Primary exec.', value: v.executors.find((e) => !e.isBackup)?.fullName ?? '' },
        { label: 'Backup exec.', value: v.executors.find((e) => e.isBackup)?.fullName ?? '' },
        { label: 'Guardian', value: v.guardians.find((g) => !g.isBackup)?.fullName ?? '' },
      ]
    case 'beneficiaries':
      return [
        { label: 'Residue', value: v.beneficiaries.map((b) => b.fullName).filter(Boolean).join(', ') },
        { label: 'Charitable', value: v.goals.charitableGiving ? 'Yes' : v.goals.charitableGiving === false ? 'No' : '' },
      ]
    case 'assets':
      return [
        { label: 'Est. net worth', value: v.assets.estimatedNetWorth != null ? `$${v.assets.estimatedNetWorth.toLocaleString()}` : '' },
        { label: 'Private shares', value: v.assets.privateCompanyShares ? 'Yes' : v.assets.privateCompanyShares === false ? 'No' : '' },
        { label: 'Dual will', value: v.goals.hasDualWill ? 'Yes' : v.goals.hasDualWill === false ? 'No' : '' },
      ]
    case 'special':
      return [
        { label: 'Henson trust', value: v.goals.henson ? 'Yes' : v.goals.henson === false ? 'No' : '' },
        { label: 'POA Property', value: v.goals.hasPoaProperty ? 'Yes' : v.goals.hasPoaProperty === false ? 'No' : '' },
        { label: 'POA Care', value: v.goals.hasPoaPersonalCare ? 'Yes' : v.goals.hasPoaPersonalCare === false ? 'No' : '' },
      ]
    default:
      return []
  }
}
