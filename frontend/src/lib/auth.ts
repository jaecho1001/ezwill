// Simple auth for EZWill lawyer dashboard
// Lawyer logs in with firm password -> session cookie set
// All /dashboard/* routes check for valid session

const AUTH_COOKIE = 'ezwill_session'
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export function isAuthenticated(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes(AUTH_COOKIE)
}

export function setSession(token: string) {
  document.cookie = `${AUTH_COOKIE}=${token}; path=/dashboard; max-age=${SESSION_DURATION / 1000}; samesite=strict`
}

export function clearSession() {
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
