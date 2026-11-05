'use client'

// The interactive part of SiteHeader: the "Log in" chooser (patient or
// dentist) and, on phones, the menu button. Desktop shows the chooser as a
// small dropdown under the button; phones (≤900px, see SiteHeader's CSS) show
// the same choices as a sheet that slides up from the bottom of the screen.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Open = null | 'login' | 'menu'

function PersonIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  )
}

function ToothIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3c-2 0-3.5 1.6-3.5 4 0 3 1.4 4.4 2 7.5.5 2.6 1 6.5 2.5 6.5 1.6 0 1.6-4.5 4-4.5s2.4 4.5 4 4.5c1.5 0 2-3.9 2.5-6.5.6-3.1 2-4.5 2-7.5 0-2.4-1.5-4-3.5-4-1.8 0-3 1-5 1S8.8 3 7 3Z" />
    </svg>
  )
}

function LoginChoices({ onPick }: { onPick: () => void }) {
  return (
    <>
      <Link href="/patient" className="hm-opt" onClick={onPick}>
        <span className="hm-ico hm-ico-p"><PersonIcon /></span>
        <span>
          <b>I&apos;m a patient</b>
          <small>Your visits, prescriptions and bills</small>
        </span>
      </Link>
      <Link href="/for-dentists/login" className="hm-opt" onClick={onPick}>
        <span className="hm-ico hm-ico-d"><ToothIcon /></span>
        <span>
          <b>I&apos;m a dentist</b>
          <small>Clinic dashboard, appointments, patients</small>
        </span>
      </Link>
    </>
  )
}

export default function HeaderMenus({ cityName }: { cityName: string }) {
  const [open, setOpen] = useState<Open>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Close on navigation, Escape, and clicks outside the header controls.
  useEffect(() => { setOpen(null) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const close = () => setOpen(null)
  const toggle = (which: Exclude<Open, null>) => setOpen(o => (o === which ? null : which))

  return (
    <div className="hm-wrap" ref={wrapRef}>
      <button
        type="button"
        className="hm-login"
        aria-haspopup="true"
        aria-expanded={open === 'login'}
        onClick={() => toggle('login')}
      >
        <PersonIcon />
        Log in
        <svg className="hm-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <span className="hm-sep" aria-hidden="true" />
      <Link href="/for-dentists/register" className="hm-cta hm-cta-desk">List your clinic</Link>

      <button
        type="button"
        className="hm-burger"
        aria-label="Menu"
        aria-haspopup="true"
        aria-expanded={open === 'menu'}
        onClick={() => toggle('menu')}
      >
        {open === 'menu' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        )}
      </button>

      {open && <div className="hm-scrim" onClick={close} aria-hidden="true" />}

      {open === 'login' && (
        <div className="hm-pop" role="menu" aria-label="Log in as">
          <div className="hm-grab" aria-hidden="true" />
          <div className="hm-title">Log in as</div>
          <LoginChoices onPick={close} />
        </div>
      )}

      {open === 'menu' && (
        <div className="hm-pop hm-pop-menu" role="menu" aria-label="Menu">
          <div className="hm-grab" aria-hidden="true" />
          <nav className="hm-links">
            <Link href="/dentists" onClick={close}>Find a dentist <span aria-hidden="true">›</span></Link>
            <Link href="/articles" onClick={close}>Expert Advice <span aria-hidden="true">›</span></Link>
            <Link href="/patient" onClick={close}>Patient Login <span aria-hidden="true">›</span></Link>
            <Link href="/for-dentists/login" onClick={close}>Dentist Login <span aria-hidden="true">›</span></Link>
          </nav>
          <div className="hm-dent">
            <b>Are you a dentist?</b>
            <small>Get found by patients in {cityName}. Free to list.</small>
            <Link href="/for-dentists/register" className="hm-cta" onClick={close}>List your clinic</Link>
          </div>
        </div>
      )}
    </div>
  )
}
