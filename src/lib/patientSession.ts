// Browser-side persistence for the patient portal login. Stores the portal
// token + the clinic list in localStorage with a hard 24h expiry (the JWT also
// expires server-side at 24h; this is the client-side mirror so we can bounce
// an expired session straight to the login page without a round-trip).

const KEY = 'dentistin_patient_portal'
const TTL_MS = 24 * 60 * 60 * 1000

export interface PortalClinic {
  patient_id: string
  patient_name: string | null
  dentist_id: string | null
  dentist_name: string | null
  clinic_name: string | null
}

export interface PortalSession {
  token: string
  phone: string
  clinics: PortalClinic[]
  selectedPatientId: string
  savedAt: number
}

export function savePortalSession(s: Omit<PortalSession, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: Date.now() }))
  } catch {}
}

export function loadPortalSession(): PortalSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as PortalSession
    if (!s?.token || !s?.selectedPatientId) return null
    if (typeof s.savedAt !== 'number' || Date.now() - s.savedAt > TTL_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

export function setSelectedClinic(patientId: string): void {
  const s = loadPortalSession()
  if (!s) return
  savePortalSession({ ...s, selectedPatientId: patientId })
}

export function clearPortalSession(): void {
  try { localStorage.removeItem(KEY) } catch {}
}
