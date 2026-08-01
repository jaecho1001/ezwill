/**
 * Query-string handling for the client intake URL (#91).
 *
 * The emailed magic link necessarily arrives as `?t=<token>`, but the
 * credential must never be re-attached by the app's own navigation: every
 * URL the intake page pushes (chapter changes, mode toggle, the initial
 * strip) is built from THIS helper, so a token can only ever appear on
 * arrival — not in browser history, and not in page-load logs thereafter.
 */
export const TOKEN_PARAM = 't'

/** The current query params with the credential removed. */
export function paramsWithoutToken(search: string): URLSearchParams {
  const params = new URLSearchParams(search)
  params.delete(TOKEN_PARAM)
  return params
}

/** A same-page URL for `pathname` carrying `search` minus the credential,
 *  plus any overrides (a null value removes that param). */
export function cleanUrl(
  pathname: string,
  search: string,
  overrides: Record<string, string | null> = {}
): string {
  const params = paramsWithoutToken(search)
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) params.delete(key)
    else params.set(key, value)
  }
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}
