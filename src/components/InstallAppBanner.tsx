'use client'

// "Install DentistIn" banner, shared by the dentist dashboard and the patient
// app. Each app passes its own copy and storage key so dismissing one doesn't
// hide the other.
// - Android / desktop Chrome / Edge: an Install button that opens the
//   browser's own install dialog (beforeinstallprompt).
// - iPhone / iPad: Apple has no install button, so we show the two steps
//   (Share, then Add to Home Screen).
// - Android, before Chrome is ready to install: "Tap ⋮ then Install app".
// Shown on every dashboard visit until the app is installed or running from
// the home screen; "×" hides it for 30 days. Kept in localStorage; failures
// just hide the banner.
//
// Chrome fires beforeinstallprompt once, often before React has hydrated, so
// the app's layout catches it early into window.__dinInstallPrompt
// (see INSTALL_PROMPT_CATCHER in src/lib/dentistApp.ts) and this component picks it up from there.

import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_DAYS = 30
const MIN_VISITS = 1

type WindowWithPrompt = Window & { __dinInstallPrompt?: InstallPromptEvent | null }

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac; touch support gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function readyToShow(prefix: string): boolean {
  const VISITS_KEY = `${prefix}_visits`
  const SESSION_KEY = `${prefix}_visit_counted`
  const DISMISS_KEY = `${prefix}_dismissed_at`
  try {
    if (!sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, '1')
      const n = Number(localStorage.getItem(VISITS_KEY) || '0') + 1
      localStorage.setItem(VISITS_KEY, String(n))
    }
    const visits = Number(localStorage.getItem(VISITS_KEY) || '0')
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || '0')
    const recentlyDismissed = dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_DAYS * 86400000
    return visits >= MIN_VISITS && !recentlyDismissed
  } catch {
    return false
  }
}

const TEAL = '#14B8A6'
const NAVY = '#0F172A'

function AppIcon() {
  return (
    <span aria-hidden="true" style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 10, background: 'linear-gradient(150deg,#13233F 0%,#0F172A 55%,#0B3B3E 100%)', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)' }}>
      <svg width="26" height="26" viewBox="0 0 48 48">
        <path d="M24 9c-3.4-2.6-8.6-3-11.8.2-3.4 3.4-2.6 9.4-.8 14.2 1.4 3.8 2.2 8 2.8 12 .4 2.6 1.4 4.6 3.2 4.6 2.6 0 2.8-4 3.4-7.4.4-2.2 1.4-3.6 3.2-3.6s2.8 1.4 3.2 3.6c.6 3.4.8 7.4 3.4 7.4 1.8 0 2.8-2 3.2-4.6.6-4 1.4-8.2 2.8-12 1.8-4.8 2.6-10.8-.8-14.2C32.6 6 27.4 6.4 24 9z" fill={TEAL} />
        <path d="M19 17.5c1.6-1.3 3.4-1.6 5 0" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <circle cx="35.5" cy="12.5" r="5" fill="#fff" />
        <path d="M33.3 12.6l1.5 1.5 2.9-3" stroke="#0D9488" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </span>
  )
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px' }} aria-label="Share">
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  )
}

type Props = {
  title?: string
  pitch?: string
  // localStorage prefix. Dentist app keeps the original 'din_app' keys.
  storageKey?: string
  style?: React.CSSProperties
}

export default function InstallAppBanner({
  title = 'Install DentistIn',
  pitch = "Open today's patients in one tap, full screen.",
  storageKey = 'din_app',
  style,
}: Props = {}) {
  const [mode, setMode] = useState<'hidden' | 'prompt' | 'ios' | 'android'>('hidden')
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone()) return
    const ok = readyToShow(storageKey)
    const w = window as WindowWithPrompt

    const pickUp = () => {
      const ev = w.__dinInstallPrompt
      if (!ev) return
      setPromptEvent(ev)
      if (ok) setMode('prompt')
    }
    // Fallback in case the layout script didn't run (it always should).
    const onPrompt = (e: Event) => {
      e.preventDefault()
      w.__dinInstallPrompt = e as InstallPromptEvent
      pickUp()
    }
    const onInstalled = () => { w.__dinInstallPrompt = null; setMode('hidden') }
    window.addEventListener('din-install-ready', pickUp)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // Short delay so the banner doesn't flash in before the page settles.
    const timer = window.setTimeout(() => {
      if (w.__dinInstallPrompt) pickUp()
      else if (ok && isIOS()) setMode('ios')
      else if (ok && isAndroid()) setMode(m => (m === 'hidden' ? 'android' : m))
    }, 1200)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('din-install-ready', pickUp)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [storageKey])

  if (mode === 'hidden') return null

  const dismiss = () => {
    try { localStorage.setItem(`${storageKey}_dismissed_at`, String(Date.now())) } catch { /* ignore */ }
    setMode('hidden')
  }

  const install = async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setPromptEvent(null)
    ;(window as WindowWithPrompt).__dinInstallPrompt = null
    if (outcome === 'accepted') setMode('hidden')
    else dismiss()
  }

  return (
    <div role="region" aria-label={title}
      style={{ background: NAVY, color: '#fff', borderRadius: 16, padding: 12, display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, boxShadow: '0 10px 24px rgba(15,23,42,.18)', fontFamily: 'var(--font-body)', ...style }}>
      <AppIcon />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{title}</div>
        {mode === 'prompt' ? (
          <div style={{ fontSize: 12.5, color: '#CBD5E1' }}>{pitch}</div>
        ) : mode === 'android' ? (
          <div style={{ fontSize: 12.5, color: '#CBD5E1' }}>
            Tap the <b style={{ color: '#fff' }}>⋮ menu</b> at the top, then <b style={{ color: '#fff' }}>Install app</b> or <b style={{ color: '#fff' }}>Add to Home screen</b>.
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: '#CBD5E1' }}>
            Tap <b style={{ color: '#fff' }}>Share <ShareIcon /></b>, then <b style={{ color: '#fff' }}>Add to Home Screen</b>.
          </div>
        )}
      </div>
      {mode === 'prompt' && (
        <button type="button" onClick={install}
          style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Not now"
        style={{ background: 'rgba(255,255,255,.1)', color: '#CBD5E1', border: 'none', borderRadius: 8, width: 30, height: 30, fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>
        ×
      </button>
    </div>
  )
}
