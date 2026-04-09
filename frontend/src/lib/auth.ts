// Simple auth for EZWill lawyer dashboard
// Lawyer logs in with firm password -> session cookie + in-memory token
// All /dashboard/* routes check for valid session

const AUTH_COOKIE = 'ezwill_session'
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours

// In-memory token for Authorization header
let _authToken: string | null = null

export function isAuthenticated(): boolean {
  if (typeof document === 'undefined') return false
  // Check in-memory first, fall back to cookie
  if (_authToken) return true
  const match = document.cookie.match(new RegExp(`(?:^|; )${AUTH_COOKIE}=([^;]+)`))
  if (match) {
    _authToken = match[1]
    return true
  }
  return false
}

export function getAuthHeaders(): Record<string, string> {
  // Restore from cookie if needed
  if (!_authToken && typeof document !== 'undefined') {
    const match = document.cookie.match(new RegExp(`(?:^|; )${AUTH_COOKIE}=([^;]+)`))
    if (match) _authToken = match[1]
  }
  if (!_authToken) return {}
  return { Authorization: `Bearer ${_authToken}` }
}

export function setSession(token: string) {
  _authToken = token
  document.cookie = `${AUTH_COOKIE}=${token}; path=/dashboard; max-age=${SESSION_DURATION / 1000}; samesite=strict`
}

export function clearSession() {
  _authToken = null
  document.cookie = `${AUTH_COOKIE}=; path=/dashboard; max-age=0`
}

export async function login(password: string): Promise<boolean> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) return false
  const { token } = await res.json()
  setSession(token)
  return true
}

export async function logout() {
  clearSession()
  window.location.href = '/dashboard/login'
}
