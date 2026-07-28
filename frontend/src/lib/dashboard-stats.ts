/** Headline dashboard stats from the UNCAPPED server aggregate (pipeline
 *  overview review, finding 2): the recent-drafts list is limited to 50
 *  rows, so counting it understates every card once the firm passes 50
 *  files. Pure so it is testable. */

export interface DashboardStats {
  total: number
  submitted: number
  inProgress: number
  completed: number
}

export function statsFromCounts(
  counts: Record<string, number>,
  opts?: { awaitingReview?: number },
): DashboardStats {
  const n = (key: string) => counts[key] ?? 0
  return {
    total: Object.values(counts).reduce((sum, v) => sum + v, 0),
    // Raw status 'submitted' includes fully-handled files (#99's lifecycle
    // gap keeps them at that status until signing), so the card labelled
    // "awaiting review" must use the queue's requirement-aware total when
    // the caller has it — not the raw status count.
    submitted: opts?.awaitingReview ?? n('submitted'),
    inProgress: n('in_progress') + n('opened') + n('link_sent'),
    completed: n('approved') + n('signed'),
  }
}
