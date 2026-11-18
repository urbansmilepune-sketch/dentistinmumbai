// Browser side of dentist app phone alerts. Used by the "Turn on alerts"
// card (src/components/PushAlertsCard.tsx) and the Notifications settings
// page. The worker itself is public/dentist-sw.js; sending is src/lib/push.ts.

export const SW_URL = '/dentist-sw.js'
export const SW_SCOPE = '/for-dentists/'
export const ALERTS_PAGE = '/for-dentists/dashboard/notifications'

export type PushPrefs = { booking: boolean; change: boolean; review: boolean }
export type PushStatus = {
  configured: boolean
  publicKey: string | null
  isOwner: boolean
  subscribed: boolean
  prefs: PushPrefs
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: 'none' })
  if (reg.active) return reg
  // Wait until the worker is running so pushManager.subscribe works.
  const worker = reg.installing || reg.waiting
  if (worker) {
    await new Promise<void>(resolve => {
      const done = () => { if (worker.state === 'activated') resolve() }
      worker.addEventListener('statechange', done)
      done()
      window.setTimeout(resolve, 5000)
    })
  }
  return reg
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await registerWorker()
  return reg.pushManager.getSubscription()
}

export async function fetchStatus(endpoint?: string | null): Promise<PushStatus | null> {
  try {
    const q = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''
    const res = await fetch(`/api/dentist/push${q}`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function saveSubscription(sub: PushSubscription): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/dentist/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
    if (res.ok) return { ok: true }
    const j = await res.json().catch(() => ({}))
    return { ok: false, error: j?.error || 'Could not turn on alerts. Please try again.' }
  } catch {
    return { ok: false, error: 'No internet. Please try again.' }
  }
}

export type TurnOnResult =
  | { result: 'on' }
  | { result: 'denied' }
  | { result: 'dismissed' }
  | { result: 'error'; error: string }

/**
 * Must be called straight from a tap: iPhone only shows the permission box
 * when it is asked for inside a user gesture, so the permission request is
 * the very first thing this does.
 */
export async function turnOnAlerts(): Promise<TurnOnResult> {
  if (!pushSupported()) return { result: 'error', error: 'This browser cannot show alerts.' }
  let permission: NotificationPermission
  try {
    permission = await Notification.requestPermission()
  } catch {
    return { result: 'error', error: 'Could not ask for permission.' }
  }
  if (permission === 'denied') return { result: 'denied' }
  if (permission !== 'granted') return { result: 'dismissed' }

  try {
    const reg = await registerWorker()
    const status = await fetchStatus()
    if (!status?.configured || !status.publicKey) {
      return { result: 'error', error: 'Alerts are not set up yet on the server.' }
    }
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(status.publicKey) })
    }
    const saved = await saveSubscription(sub)
    return saved.ok ? { result: 'on' } : { result: 'error', error: saved.error || 'Could not save.' }
  } catch (err: any) {
    console.error('[push] subscribe failed', err)
    return { result: 'error', error: 'Could not turn on alerts on this phone. Please try again.' }
  }
}

export async function turnOffAlerts(): Promise<boolean> {
  try {
    const sub = await currentSubscription()
    if (!sub) return true
    await fetch('/api/dentist/push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => null)
    await sub.unsubscribe()
    return true
  } catch {
    return false
  }
}
