'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const KEY = 'ew_review_token'

/**
 * Review-portal credential handling (#91 review finding).
 *
 * The token necessarily arrives once in the emailed URL (?t=...). From
 * then on it lives in sessionStorage and NEVER in a URL again: internal
 * navigation used to re-embed the live credential in browser history and
 * in the server logs of every page load. On first mount the token is
 * stashed and stripped from the address bar; later pages read the stash.
 *
 * `ready` is false until the stash has been consulted — pages must not
 * treat an empty token as "no link" before then.
 */
export function useReviewToken(): { token: string; ready: boolean } {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const fromUrl = searchParams.get('t') || ''
  const [state, setState] = useState<{ token: string; ready: boolean }>({
    token: '',
    ready: false,
  })

  useEffect(() => {
    if (fromUrl) {
      try {
        sessionStorage.setItem(KEY, fromUrl)
      } catch {
        // Storage unavailable (rare): the in-memory token still works for
        // this page; cross-page navigation will re-prompt for the link.
      }
      setState({ token: fromUrl, ready: true })
      router.replace(pathname)
      return
    }
    let stored = ''
    try {
      stored = sessionStorage.getItem(KEY) ?? ''
    } catch {
      stored = ''
    }
    setState({ token: stored, ready: true })
  }, [fromUrl, pathname, router])

  return state
}
