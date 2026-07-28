/** Pins finding 2 of the overview review: headline cards must reflect the
 *  whole database, not the first 50 rows. */
import { describe, it, expect } from 'vitest'
import { statsFromCounts } from '@/lib/dashboard-stats'

describe('statsFromCounts', () => {
  it('totals every status, uncapped', () => {
    const stats = statsFromCounts({
      link_sent: 40, opened: 30, in_progress: 25,
      submitted: 60, approved: 10, signed: 5,
    })
    expect(stats.total).toBe(170) // far beyond the 50-row list cap
    expect(stats.submitted).toBe(60)
    expect(stats.inProgress).toBe(95)
    expect(stats.completed).toBe(15)
  })

  it('awaiting-review override replaces the raw submitted count (fully-handled files excluded)', () => {
    const stats = statsFromCounts({ submitted: 60 }, { awaitingReview: 42 })
    expect(stats.submitted).toBe(42) // queue total, not raw status count
    expect(stats.total).toBe(60)
  })

  it('missing statuses count as zero', () => {
    expect(statsFromCounts({})).toEqual({
      total: 0, submitted: 0, inProgress: 0, completed: 0,
    })
  })
})
