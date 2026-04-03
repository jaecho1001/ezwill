'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────

type RoleType =
  | 'executor_primary'
  | 'executor_backup'
  | 'trustee'
  | 'guardian_primary'
  | 'guardian_backup'
  | 'poa_property'
  | 'poa_property_backup'
  | 'poa_care'
  | 'poa_care_backup'
  | 'beneficiary'
  | 'contingent_beneficiary'
  | 'witness'

interface PersonEntry {
  name: string
  relationship: string
  roles: RoleType[]
  percentage?: number // for beneficiaries
  isMinor?: boolean
}

const ROLE_CONFIG: Record<RoleType, { label: string; color: string }> = {
  executor_primary:       { label: 'Executor (Primary)',      color: 'bg-blue-100 text-blue-700 border-blue-200' },
  executor_backup:        { label: 'Executor (Backup)',       color: 'bg-blue-50 text-blue-600 border-blue-100' },
  trustee:                { label: 'Trustee',                 color: 'bg-teal-100 text-teal-700 border-teal-200' },
  guardian_primary:       { label: 'Guardian (Primary)',      color: 'bg-green-100 text-green-700 border-green-200' },
  guardian_backup:        { label: 'Guardian (Backup)',       color: 'bg-green-50 text-green-600 border-green-100' },
  poa_property:           { label: 'POA Property',            color: 'bg-purple-100 text-purple-700 border-purple-200' },
  poa_property_backup:    { label: 'POA Property (Backup)',   color: 'bg-purple-50 text-purple-600 border-purple-100' },
  poa_care:               { label: 'POA Personal Care',       color: 'bg-pink-100 text-pink-700 border-pink-200' },
  poa_care_backup:        { label: 'POA Personal Care (Backup)', color: 'bg-pink-50 text-pink-600 border-pink-100' },
  beneficiary:            { label: 'Beneficiary',             color: 'bg-amber-100 text-amber-700 border-amber-200' },
  contingent_beneficiary: { label: 'Contingent Beneficiary',  color: 'bg-amber-50 text-amber-600 border-amber-100' },
  witness:                { label: 'Witness',                 color: 'bg-gray-100 text-gray-600 border-gray-200' },
}

// ── Data Extraction ──────────────────────────────────────────────────

function getPersonName(p: Record<string, unknown>): string {
  const first = String(p.firstName ?? p.first_name ?? '')
  const last = String(p.lastName ?? p.last_name ?? '')
  return `${first} ${last}`.trim() || 'Unknown'
}

function getPersonRelationship(p: Record<string, unknown>): string {
  return String(p.relationship ?? p.role ?? '')
}

interface DraftData {
  your_family?: Record<string, unknown>
  your_estate?: Record<string, unknown>
  your_arrangements?: Record<string, unknown>
  poa_property?: Record<string, unknown>
  poa_personal_care?: Record<string, unknown>
  people?: Array<Record<string, unknown>>
}

export function extractPeople(draft: DraftData): PersonEntry[] {
  const personMap = new Map<string, PersonEntry>()

  function addRole(name: string, relationship: string, role: RoleType, extra?: { percentage?: number; isMinor?: boolean }) {
    if (!name || name === 'Unknown') return
    const key = name.toLowerCase().trim()
    const existing = personMap.get(key)
    if (existing) {
      if (!existing.roles.includes(role)) {
        existing.roles.push(role)
      }
      if (extra?.percentage !== undefined) {
        existing.percentage = extra.percentage
      }
    } else {
      personMap.set(key, {
        name,
        relationship,
        roles: [role],
        percentage: extra?.percentage,
        isMinor: extra?.isMinor,
      })
    }
  }

  const family = (draft.your_family ?? {}) as Record<string, unknown>
  const estate = (draft.your_estate ?? {}) as Record<string, unknown>
  const arrangements = (draft.your_arrangements ?? {}) as Record<string, unknown>
  const poaProp = (draft.poa_property ?? {}) as Record<string, unknown>
  const poaCare = (draft.poa_personal_care ?? {}) as Record<string, unknown>

  // Executor
  if (arrangements.primaryExecutor) {
    const p = arrangements.primaryExecutor as Record<string, unknown>
    addRole(getPersonName(p), getPersonRelationship(p), 'executor_primary')
  }
  if (Array.isArray(arrangements.backupExecutors)) {
    for (const p of arrangements.backupExecutors as Array<Record<string, unknown>>) {
      addRole(getPersonName(p), getPersonRelationship(p), 'executor_backup')
    }
  }

  // Guardians
  if (Array.isArray(family.guardians)) {
    const guardians = family.guardians as Array<Record<string, unknown>>
    guardians.forEach((p, i) => {
      addRole(getPersonName(p), getPersonRelationship(p), i === 0 ? 'guardian_primary' : 'guardian_backup')
    })
  }

  // POA Property
  if (poaProp.hasAttorney && poaProp.attorney) {
    const p = poaProp.attorney as Record<string, unknown>
    addRole(getPersonName(p), getPersonRelationship(p), 'poa_property')
  }
  if (poaProp.backupAttorney) {
    const p = poaProp.backupAttorney as Record<string, unknown>
    addRole(getPersonName(p), getPersonRelationship(p), 'poa_property_backup')
  }

  // POA Personal Care
  if (poaCare.hasAttorney && poaCare.attorney) {
    const p = poaCare.attorney as Record<string, unknown>
    addRole(getPersonName(p), getPersonRelationship(p), 'poa_care')
  }
  if (poaCare.backupAttorney) {
    const p = poaCare.backupAttorney as Record<string, unknown>
    addRole(getPersonName(p), getPersonRelationship(p), 'poa_care_backup')
  }

  // Beneficiaries
  if (Array.isArray(estate.beneficiaries)) {
    for (const p of estate.beneficiaries as Array<Record<string, unknown>>) {
      addRole(getPersonName(p), getPersonRelationship(p), 'beneficiary', {
        percentage: p.percentage as number | undefined,
      })
    }
  }

  // Contingent beneficiaries
  if (Array.isArray(estate.contingentBeneficiaries)) {
    for (const p of estate.contingentBeneficiaries as Array<Record<string, unknown>>) {
      addRole(getPersonName(p), getPersonRelationship(p), 'contingent_beneficiary')
    }
  }

  // Trusts — extract trustees
  if (Array.isArray(estate.trusts)) {
    const people = (draft.people ?? []) as Array<Record<string, unknown>>
    for (const trust of estate.trusts as Array<Record<string, unknown>>) {
      const trusteeIds = (trust.trusteeIds ?? []) as string[]
      for (const tid of trusteeIds) {
        const person = people.find((p) => p.id === tid)
        if (person) {
          addRole(getPersonName(person), getPersonRelationship(person), 'trustee')
        }
      }
    }
  }

  // Children (not a role per se, but ensure they appear if they are beneficiaries via residue)
  if (Array.isArray(family.children)) {
    for (const child of family.children as Array<Record<string, unknown>>) {
      const name = getPersonName(child)
      const key = name.toLowerCase().trim()
      if (!personMap.has(key)) {
        // If residue goes to children, they are implicit beneficiaries
        const residue = estate.residueDistribution as string | undefined
        if (residue === 'equal_children' || residue === 'per_stirpes') {
          addRole(name, 'child', 'beneficiary', { isMinor: child.isMinor as boolean | undefined })
        }
      }
    }
  }

  // Spouse — ensure they appear
  if (family.hasSpouse && family.spouse) {
    const sp = family.spouse as Record<string, unknown>
    const name = getPersonName(sp)
    const key = name.toLowerCase().trim()
    if (!personMap.has(key)) {
      // Spouse often has implicit roles
      personMap.set(key, { name, relationship: 'spouse', roles: [] })
    }
  }

  return Array.from(personMap.values()).filter((p) => p.roles.length > 0)
}

// ── Conflict Detection ───────────────────────────────────────────────

function detectConflicts(person: PersonEntry): string[] {
  const warnings: string[] = []
  const hasWitness = person.roles.includes('witness')
  const hasBeneficiary = person.roles.includes('beneficiary') || person.roles.includes('contingent_beneficiary')

  if (hasWitness && hasBeneficiary) {
    warnings.push('SLRA s.12 conflict: a beneficiary should not serve as a witness — gift may be void')
  }
  return warnings
}

// ── Component ────────────────────────────────────────────────────────

interface PeopleRolesGridProps {
  draft: DraftData
  onNavigate?: (section: string) => void
}

export function PeopleRolesGrid({ draft, onNavigate }: PeopleRolesGridProps) {
  const people = extractPeople(draft)

  if (people.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm text-gray-500">No people assigned to roles yet.</p>
        {onNavigate && (
          <button
            onClick={() => onNavigate('your_arrangements')}
            className="mt-2 text-sm font-medium text-amber-600 hover:text-amber-700"
          >
            Configure executors and attorneys
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {people.map((person) => {
        const conflicts = detectConflicts(person)
        return (
          <Card
            key={person.name}
            className={cn(
              'relative overflow-hidden',
              conflicts.length > 0 && 'ring-2 ring-red-300'
            )}
          >
            <CardContent className="p-4">
              {/* Name + relationship */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{person.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{person.relationship}</p>
                </div>
                {person.isMinor && (
                  <Badge variant="secondary" className="text-[10px]">Minor</Badge>
                )}
              </div>

              {/* Role badges */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {person.roles.map((role) => {
                  const cfg = ROLE_CONFIG[role]
                  return (
                    <span
                      key={role}
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        cfg.color
                      )}
                    >
                      {cfg.label}
                      {role === 'beneficiary' && person.percentage !== undefined && (
                        <span className="ml-1 font-bold">{person.percentage}%</span>
                      )}
                    </span>
                  )
                })}
              </div>

              {/* Conflict warnings */}
              {conflicts.length > 0 && (
                <div className="mt-3 space-y-1">
                  {conflicts.map((warning, i) => (
                    <div key={i} className="flex items-start gap-1.5 rounded bg-red-50 px-2 py-1.5">
                      <svg className="mt-0.5 h-3 w-3 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <p className="text-[10px] text-red-700">{warning}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
