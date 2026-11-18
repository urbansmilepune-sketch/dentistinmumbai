'use client'

// More → Notifications. Turn phone alerts on/off for THIS phone, choose which
// events ping it, and send a test alert. Each phone or browser is separate.

import { useEffect, useState } from 'react'
import {
  currentSubscription, fetchStatus, isIOS, isStandalone, pushSupported, turnOffAlerts, turnOnAlerts,
  type PushPrefs,
} from '@/lib/pushClient'

const TEAL = '#14B8A6'
const TEAL_DARK = '#0D9488'

type View = 'loading' | 'unsupported' | 'install_first' | 'not_ready' | 'blocked' | 'off' | 'on'

const ROWS: { key: keyof PushPrefs; label: string; hint: string; ownerOnly?: boolean }[] = [
  { key: 'booking', label: 'New booking request', hint: 'A patient booked online' },
  { key: 'change', label: 'Patient changed or cancelled', hint: 'From the patient app' },
  { key: 'review', label: 'New review', hint: 'A review went live on your profile', ownerOnly: true },
]

export default function NotificationsPage() {
  const [view, setView] = useState<View>('loading')
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<PushPrefs>({ booking: true, change: true, review: true })
  const [isOwner, setIsOwner] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null)

  async function load() {
    if (!pushSupported()) {
      setView(isIOS() && !isStandalone() ? 'install_first' : 'unsupported')
      return
    }
    const sub = Notification.permission === 'granted' ? await currentSubscription().catch(() => null) : null
    const status = await fetchStatus(sub?.endpoint)
    if (!status) { setView('not_ready'); return }
    setIsOwner(status.isOwner)
    setPrefs(status.prefs)
    if (!status.configured) { setView('not_ready'); return }
    if (Notification.permission === 'denied') { setView('blocked'); return }
    if (sub && status.subscribed) { setEndpoint(sub.endpoint); setView('on'); return }
    setView('off')
  }

  useEffect(() => { load() }, [])

  async function turnOn() {
    setBusy(true); setMsg(null)
    const r = await turnOnAlerts()
    setBusy(false)
    if (r.result === 'on') { await load(); setMsg({ text: 'Alerts are on for this phone.', tone: 'ok' }) }
    else if (r.result === 'denied') setView('blocked')
    else if (r.result === 'error') setMsg({ text: r.error, tone: 'err' })
  }

  async function turnOff() {
    setBusy(true); setMsg(null)
    const ok = await turnOffAlerts()
    setBusy(false)
    if (ok) { setEndpoint(null); setView('off'); setMsg({ text: 'Alerts are off for this phone.', tone: 'ok' }) }
    else setMsg({ text: 'Could not turn off. Please try again.', tone: 'err' })
  }

  async function toggle(key: keyof PushPrefs) {
    if (!endpoint) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next); setMsg(null)
    try {
      const res = await fetch('/api/dentist/push', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, prefs: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setPrefs(prefs)
      setMsg({ text: 'Could not save. Please try again.', tone: 'err' })
    }
  }

  async function sendTest() {
    if (!endpoint) return
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/dentist/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) setMsg({ text: 'Test alert sent. Check your phone.', tone: 'ok' })
      else {
        setMsg({ text: j?.error || 'Could not send. Please try again.', tone: 'err' })
        if (res.status === 410) { setEndpoint(null); setView('off') }
      }
    } catch {
      setMsg({ text: 'No internet. Please try again.', tone: 'err' })
    }
    setBusy(false)
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }
  const primaryBtn: React.CSSProperties = { background: TEAL, color: '#042F2E', border: 'none', borderRadius: 12, padding: '13px 16px', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', width: '100%', opacity: busy ? 0.7 : 1 }
  const outlineBtn: React.CSSProperties = { background: '#fff', color: TEAL_DARK, border: `1.5px solid ${TEAL}`, borderRadius: 12, padding: '12px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', width: '100%', opacity: busy ? 0.7 : 1 }
  const note = (text: React.ReactNode) => <div style={{ ...card, padding: 16, fontSize: 14, lineHeight: 1.5 }}>{text}</div>

  return (
    <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Notifications</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Phone alerts for this phone or computer. Email alerts keep working as before.</p>
      </div>

      {view === 'loading' && <div style={{ color: 'var(--muted)', fontSize: 14 }}>Checking this phone…</div>}

      {view === 'install_first' && note(<>
        <b>Install the app first.</b> On iPhone, alerts only work in the installed app: tap <b>Share</b>, then <b>Add to Home Screen</b>, open DentistIn from your home screen and come back here. Needs iOS 16.4 or newer.
      </>)}

      {view === 'unsupported' && note(<>
        This browser can&apos;t show alerts. Use Chrome or Edge, or the installed DentistIn app. On iPhone, update to iOS 16.4 or newer.
      </>)}

      {view === 'not_ready' && note(<>Phone alerts are being set up. Please check again later.</>)}

      {view === 'blocked' && note(<>
        <b>Alerts are blocked on this phone.</b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li><b>Android:</b> long-press the DentistIn icon → App info → Notifications → Allow.</li>
          <li><b>iPhone:</b> Settings → Notifications → DentistIn → Allow Notifications.</li>
          <li><b>Computer:</b> click the lock icon next to the web address → Notifications → Allow.</li>
        </ul>
        <div style={{ marginTop: 8, color: 'var(--muted)' }}>Then reopen this page.</div>
      </>)}

      {view === 'off' && (
        <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Never miss a booking</div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>Get a phone alert the moment a patient books online, even when the app is closed.</div>
          </div>
          <button type="button" onClick={turnOn} disabled={busy} style={primaryBtn}>{busy ? 'Turning on…' : 'Turn on alerts'}</button>
        </div>
      )}

      {view === 'on' && (
        <>
          <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '6px 12px', borderRadius: 999 }}>
            ● Alerts are on for this phone
          </span>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '4px 4px 0' }}>Send me an alert for</div>
          <div style={card}>
            {ROWS.filter(r => isOwner || !r.ownerOnly).map((r, i) => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{r.label}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{r.hint}</div>
                </div>
                <button type="button" role="switch" aria-checked={prefs[r.key]} aria-label={r.label} onClick={() => toggle(r.key)}
                  style={{ width: 48, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, background: prefs[r.key] ? TEAL : '#CBD5E1' }}>
                  <span style={{ position: 'absolute', top: 3, left: prefs[r.key] ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .15s' }} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={sendTest} disabled={busy} style={outlineBtn}>Send a test alert</button>
          <button type="button" onClick={turnOff} disabled={busy}
            style={{ background: 'none', border: 'none', color: '#B91C1C', fontWeight: 600, fontSize: 14, cursor: 'pointer', padding: 8, fontFamily: 'inherit' }}>
            Turn off alerts on this phone
          </button>
        </>
      )}

      {msg && (
        <div role="status" style={{ fontSize: 14, fontWeight: 600, color: msg.tone === 'ok' ? '#166534' : '#B91C1C' }}>{msg.text}</div>
      )}

      <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
        Each phone is turned on separately. Reception staff who log in can turn on booking alerts on their own phones. Alerts show the patient&apos;s first name and the time only, never treatment or phone details.
      </p>
    </div>
  )
}
