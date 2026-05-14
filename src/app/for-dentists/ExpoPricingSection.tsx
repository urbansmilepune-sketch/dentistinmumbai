'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const EXPO_DATE = new Date('2026-06-12T09:00:00+05:30')

function useCountdown() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0, secs: 0 })
  useEffect(() => {
    function update() {
      const diff = EXPO_DATE.getTime() - Date.now()
      if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, mins: 0, secs: 0 }); return }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        mins: Math.floor((diff / (1000 * 60)) % 60),
        secs: Math.floor((diff / 1000) % 60),
      })
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])
  return timeLeft
}

export default function ExpoPricingSection() {
  const { days, hours, mins, secs } = useCountdown()

  const TimeBox = ({ value, label }: { value: number; label: string }) => (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '12px 8px', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, color: '#fff', display: 'block', lineHeight: 1 }}>
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{label}</span>
    </div>
  )

  return (
    <section style={{ padding: '64px 20px', background: 'linear-gradient(135deg, #0A1628, #003F7A)' }}>
      <div className="container" style={{ maxWidth: 900 }}>
        {/* Expo badge */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 20px', background: 'rgba(255,97,53,0.2)', border: '1px solid rgba(255,97,53,0.5)', borderRadius: 40, marginBottom: 20 }}>
            <span style={{ fontSize: 16 }}>🏅</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#FF6135' }}>FAMDENT EXPO — JUNE 12, MUMBAI</span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', lineHeight: 1.2, marginBottom: 16 }}>
            Founding Member Offer<br />
            <span style={{ color: '#FF6135' }}>Closes at the Expo</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 17, maxWidth: 580, margin: '0 auto 10px', fontWeight: 600 }}>
            Complete Practice Management — not just a directory listing.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, maxWidth: 520, margin: '0 auto' }}>
            Lock in ₹999/month forever. After June 12 the price goes to ₹2,499/month. No price hike ever for founding members.
          </p>
        </div>

        {/* Countdown */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 48, flexWrap: 'wrap' }}>
          <TimeBox value={days} label="DAYS" />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 28, fontWeight: 700, alignSelf: 'center', marginBottom: 20 }}>:</div>
          <TimeBox value={hours} label="HOURS" />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 28, fontWeight: 700, alignSelf: 'center', marginBottom: 20 }}>:</div>
          <TimeBox value={mins} label="MINS" />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 28, fontWeight: 700, alignSelf: 'center', marginBottom: 20 }}>:</div>
          <TimeBox value={secs} label="SECS" />
        </div>

        {/* Pricing cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 40 }}>
          {/* Free */}
          <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '28px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20, color: '#fff', marginBottom: 4 }}>Free</h3>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 36, color: '#fff' }}>₹0</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}> forever</span>
            </div>
            {['Basic clinic profile', 'Appear in search', 'Booking system', 'Patient reviews', 'WhatsApp button'].map(f => (
              <div key={f} style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
                <span style={{ color: '#00A878' }}>✓</span> {f}
              </div>
            ))}
            <Link href="/for-dentists/register" style={{ display: 'block', textAlign: 'center', padding: '11px', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: 'none', marginTop: 20, border: '1px solid rgba(255,255,255,0.2)' }}>
              Register Free →
            </Link>
          </div>

          {/* Gold Founding */}
          <div style={{ background: '#fff', border: '3px solid #FF6135', borderRadius: 20, padding: '28px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#FF6135', color: '#fff', padding: '4px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              🔥 EXPO SPECIAL — ENDS JUNE 12
            </div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20, color: '#0F1923', marginBottom: 4 }}>Gold Founding</h3>
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 36, color: '#FF6135' }}>₹999</span>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>/month</span>
            </div>
            <p style={{ fontSize: 12, color: '#00A878', fontWeight: 600, marginBottom: 20 }}>Locked forever. Never increases.</p>
            {['Everything in Free', 'Priority in search results', 'Featured badge on listing', 'Full analytics dashboard', 'Profile views & click tracking', 'WhatsApp lead notifications', 'Practice management tools', 'Patient records system', 'Prescription generator'].map(f => (
              <div key={f} style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 14, color: 'var(--text-secondary)' }}>
                <span style={{ color: '#FF6135', fontWeight: 700 }}>✓</span> {f}
              </div>
            ))}
            <Link href="/for-dentists/register" style={{ display: 'block', textAlign: 'center', padding: '13px', background: '#FF6135', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none', marginTop: 20 }}>
              Claim Founding Price →
            </Link>
          </div>

          {/* After expo */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '28px', opacity: 0.7 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 20, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Gold</h3>
            <p style={{ fontSize: 12, color: 'rgba(255,97,53,0.8)', marginBottom: 4 }}>After June 12</p>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 36, color: 'rgba(255,255,255,0.4)' }}>₹2,499</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>/month</span>
            </div>
            {['Everything in Free', 'Priority placement', 'Analytics dashboard', 'Lead notifications'].map(f => (
              <div key={f} style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                <span>✓</span> {f}
              </div>
            ))}
            <div style={{ textAlign: 'center', padding: '13px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)', borderRadius: 10, fontSize: 14, marginTop: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
              Regular Price
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          Questions? WhatsApp us at <a href="https://wa.me/917719903232" style={{ color: '#25D366', fontWeight: 600 }}>+91 7719903232</a>
        </p>
      </div>
    </section>
  )
}
