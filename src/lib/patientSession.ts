// Browser-side state for the patient app login.
//
// The secret login token lives in an httpOnly cookie set by the server (see
// src/lib/patientPortal.ts), so page JS never sees it. localStorage only keeps
// what the screens need (phone, clinic list, chosen clinic) plus when the
// patient last used the app. After 7 days with no taps or key presses we log
// them out; the server enforces the same 7 days on the cookie.

const KEY = 'dentistin_patient_portal'
const IDLE_FLAG = 'dentistin_patient_idle_logout'
export const IDLE_MS = 7 * 24 * 60 * 60 * 1000
// How often a tap/keypress is written back as "last active".
const TOUCH_EVERY_MS = 60 * 1000
// How often activity also renews the server cookie (normally every data load
// renews it already; this covers a long session with no loads).
const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000

export interface PortalClinic {
  patient_id: string
  patient_name: string | null
  dentist_id: string | null
  dentist_name: string | null
  clinic_name: string | null
  city?: string | null
}

export interface PortalSession {
  phone: string
  clinics: PortalClinic[]
  selectedPatientId: string
  lastActiveAt: number
  lastRefreshAt?: number
  // Only on sessions saved before the cookie existed. Sent once as a Bearer
  // header so the server can move it onto the cookie, then dropped.
  token?: string
  savedAt?: number
}

function read(): PortalSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as PortalSession
    if (!s?.selectedPatientId) return null
    if (typeof s.lastActiveAt !== 'number') s.lastActiveAt = typeof s.savedAt === 'number' ? s.savedAt : 0
    return s
  } catch {
    return null
  }
}

function write(s: PortalSession): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}

export function savePortalSession(s: { phone: string; clinics: PortalClinic[]; selectedPatientId: string }): void {
  const now = Date.now()
  write({ ...s, lastActiveAt: now, lastRefreshAt: now })
  try { sessionStorage.removeItem(IDLE_FLAG) } catch {}
}

// The saved session, or null if there is none or it has been idle 7+ days
// (in which case we also log out on the server).
export function loadPortalSession(): PortalSession | null {
  const s = read()
  if (!s) return null
  if (Date.now() - s.lastActiveAt > IDLE_MS) {
    try { sessionStorage.setItem(IDLE_FLAG, '1') } catch {}
    clearPortalSession()
    return null
  }
  return s
}

// Record a tap/keypress. Throttled so we don't write on every touch.
export function touchPortalSession(): void {
  const s = read()
  if (!s) return
  const now = Date.now()
  if (now - s.lastActiveAt > IDLE_MS) return // already idle; next load logs out
  if (now - s.lastActiveAt < TOUCH_EVERY_MS) return
  const needsRefresh = now - (s.lastRefreshAt || 0) > REFRESH_EVERY_MS
  write({ ...s, lastActiveAt: now, lastRefreshAt: needsRefresh ? now : s.lastRefreshAt })
  if (needsRefresh) refreshPortalCookie()
}

// After any successful authenticated call the server has renewed the cookie.
export function markPortalRefreshed(): void {
  const s = read()
  if (!s) return
  const now = Date.now()
  const next = { ...s, lastActiveAt: now, lastRefreshAt: now }
  delete next.token // the server has the session on the cookie now
  write(next)
}

// Headers for patient API calls. The cookie goes automatically; an old
// pre-cookie token is added as a Bearer header until the server swaps it.
export function portalHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' }
  const s = read()
  if (s?.token) h.authorization = `Bearer ${s.token}`
  return h
}

function refreshPortalCookie(): void {
  fetch('/api/patient/session', { method: 'POST', headers: portalHeaders(), credentials: 'same-origin' })
    .then(r => { if (r.ok) markPortalRefreshed() })
    .catch(() => {})
}

export function setSelectedClinic(patientId: string): void {
  const s = read()
  if (!s) return
  write({ ...s, selectedPatientId: patientId })
}

// Log out: forget local state and ask the server to clear the httpOnly cookie.
export function clearPortalSession(): void {
  try { localStorage.removeItem(KEY) } catch {}
  try {
    fetch('/api/patient/session', { method: 'DELETE', credentials: 'same-origin', keepalive: true }).catch(() => {})
  } catch {}
}

// True once, right after an idle auto-logout, so the login page can say why.
export function takeIdleLogoutNotice(): boolean {
  try {
    const v = sessionStorage.getItem(IDLE_FLAG) === '1'
    if (v) sessionStorage.removeItem(IDLE_FLAG)
    return v
  } catch {
    return false
  }
}
