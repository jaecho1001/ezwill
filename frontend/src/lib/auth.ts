// Auth for the EZWill lawyer dashboard.
//
// The session token lives in an HttpOnly cookie set by the backend on login, so
// JavaScript (and any XSS payload) can never read or exfiltrate it. A separate,
// non-sensitive `ew_authed` flag cookie lets the client-side route guard know a
// session exists without exposing the token. All /api/* calls are same-origin
// (next.config rewrites proxy them to the backend), so the cookie is sent
// automatically — no Authorization header, nothing kept in localStorage.

const AUTHED_FLAG = 'ew_authed'

export function isAuthenticated(): boolean {
  if (typeof document === 'undefined') return false
  return new RegExp(`(?:^|; )${AUTHED_FLAG}=1(?:;|$)`).test(document.cookie)
}

// Retained for the ~40 API call sites. The session now travels in the HttpOnly
// cookie (sent automatically on same-origin requests), so no header is needed.
export function getAuthHeaders(): Record<string, string> {
  return {}
}

export async function login(password: string): Promise<boolean> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  // On success the backend sets the HttpOnly session cookie + readable flag.
  return res.ok
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch {
    // Network failure shouldn't strand the user — clear local state regardless.
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${AUTHED_FLAG}=; path=/; max-age=0`
  }
  if (typeof window !== 'undefined') {
    window.location.href = '/dashboard/login'
  }
}
