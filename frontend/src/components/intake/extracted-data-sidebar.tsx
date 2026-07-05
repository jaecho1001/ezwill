'use client'

import type { WillVault } from '@/types/will-vault'
import type { Language } from '@/lib/types/will'
import { L } from '@/lib/intake/localize'
import { willIntakeChapters, chapterProgress } from '@/lib/intake/will-intake-script'

interface Props {
  vault: WillVault
  onJumpTo?: (chapterIndex: number) => void
  language: Language
}

/**
 * Live "what we've captured so far" sidebar. Each chapter becomes a small
 * section with label/value rows; empty fields render as "—". Mirrors the
 * DivorceMate intake right panel pattern but scoped to the will vault.
 */
export function ExtractedDataSidebar({ vault, onJumpTo, language }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {willIntakeChapters.map((ch, i) => {
        const rows = summarizeChapter(ch.id, vault, language)
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
                {L(language, ch.title, ch.titleKo)}
              </span>
              <span className="text-[10px] text-gray-400">{p.pct}%</span>
            </button>
            <dl className="divide-y divide-gray-50 text-xs">
              {rows.length === 0 ? (
                <div className="px-3 py-2 text-gray-400 italic">{L(language, 'Not started', '시작 전')}</div>
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
  v: WillVault,
  lang: Language
): Array<{ label: string; value: string }> {
  const yn = (b: boolean | undefined) =>
    b ? L(lang, 'Yes', '예') : b === false ? L(lang, 'No', '아니오') : ''
  switch (chapterId) {
    case 'testator':
      return [
        { label: L(lang, 'Full name', '전체 이름'), value: v.testator.fullName ?? '' },
        { label: L(lang, 'Date of birth', '생년월일'), value: v.testator.dob ?? '' },
        { label: L(lang, 'Address', '주소'), value: v.testator.address ?? '' },
        { label: L(lang, 'Marital status', '혼인 상태'), value: v.testator.maritalStatus ?? '' },
      ]
    case 'family':
      return [
        { label: L(lang, 'Spouse', '배우자'), value: v.spouse?.included && v.spouse.fullName ? v.spouse.fullName : '' },
        { label: L(lang, 'Children', '자녀'), value: v.children.length ? (lang === 'ko' ? `${v.children.length}명` : `${v.children.length} listed`) : '' },
      ]
    case 'executors':
      return [
        { label: L(lang, 'Primary exec.', '기본 집행자'), value: v.executors.find((e) => !e.isBackup)?.fullName ?? '' },
        { label: L(lang, 'Backup exec.', '예비 집행자'), value: v.executors.find((e) => e.isBackup)?.fullName ?? '' },
        { label: L(lang, 'Guardian', '후견인'), value: v.guardians.find((g) => !g.isBackup)?.fullName ?? '' },
      ]
    case 'beneficiaries':
      return [
        { label: L(lang, 'Residue', '잔여재산'), value: v.beneficiaries.map((b) => b.fullName).filter(Boolean).join(', ') },
        { label: L(lang, 'Charitable', '기부'), value: yn(v.goals.charitableGiving) },
      ]
    case 'assets':
      return [
        { label: L(lang, 'Est. net worth', '추정 순자산'), value: v.assets.estimatedNetWorth != null ? `$${v.assets.estimatedNetWorth.toLocaleString()}` : '' },
        { label: L(lang, 'Private shares', '비상장 주식'), value: yn(v.assets.privateCompanyShares) },
        { label: L(lang, 'Dual will', '이중 유언장'), value: yn(v.goals.hasDualWill) },
      ]
    case 'special':
      return [
        { label: L(lang, 'Henson trust', '헨슨 신탁'), value: yn(v.goals.henson) },
        { label: L(lang, 'POA Property', '재산 위임장'), value: yn(v.goals.hasPoaProperty) },
        { label: L(lang, 'POA Care', '돌봄 위임장'), value: yn(v.goals.hasPoaPersonalCare) },
      ]
    default:
      return []
  }
}
