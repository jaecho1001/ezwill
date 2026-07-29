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
    // The "awaiting review" card prefers the queue's requirement-aware
    // total. The raw fallback counts submitted AND in_review (#99): both
    // are files whose documents the lawyer has not finished approving.
    submitted: opts?.awaitingReview ?? n('submitted') + n('in_review'),
    inProgress: n('in_progress') + n('opened') + n('link_sent'),
    completed: n('approved') + n('signed'),
  }
}
