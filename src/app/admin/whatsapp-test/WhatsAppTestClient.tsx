'use client'

import { useState } from 'react'

type Tpl = {
  name: string
  who: string
  when: string
  text: string
  samples: string[]
}

const TEMPLATES: Tpl[] = [
  { name: 'booking_received', who: 'Patient', when: 'Patient books online',
    text: 'Your Appointment at {{1}} on {{2}} is received. Kindly wait for confirmation.',
    samples: ['Urban Smile Dental Clinic', '5 Nov 2026, 11:00 AM'] },
  { name: 'new_appointment', who: 'Dentist', when: 'Patient books online',
    text: 'Dear Dr, New Appointment from {{1}} on {{2}}. Login to confirm.',
    samples: ['Rahul Sharma', '5 Nov 2026, 11:00 AM'] },
  { name: 'appointment_confirmation', who: 'Patient', when: 'Dentist confirms',
    text: 'Your Appointment confirmed at {{1}} on {{2}}, {{3}}. Kindly Visit Clinic.',
    samples: ['Urban Smile Dental Clinic', '5 Nov 2026', '11:00 AM'] },
  { name: 'appointment_cancellation', who: 'Patient', when: 'Dentist cancels',
    text: 'Your Appointment at {{1}} on {{2}} is canceled. Kindly Rebook with us.',
    samples: ['Urban Smile Dental Clinic', '5 Nov 2026'] },
  { name: 'appointment_reminder', who: 'Patient', when: '6 PM the day before',
    text: '5 values: patient name, clinic, date, time, clinic phone',
    samples: ['Rahul', 'Urban Smile Dental Clinic', '5 Nov 2026', '11:00 AM', '7719903232'] },
]

export default function WhatsAppTestClient({ enabled }: { enabled: boolean }) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  async function send(t: Tpl) {
    setBusy(t.name)
    try {
      const res = await fetch('/api/admin/whatsapp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: t.name, phone, values: t.samples }),
      })
      const text = await res.text()
      let msg = text
      try {
        const j = JSON.parse(text)
        msg = j.success ? `Sent ✓ ${j.response ?? ''}` : `Failed: ${j.error ?? text}`
      } catch { /* keep raw text */ }
      setResults(r => ({ ...r, [t.name]: msg }))
    } catch (err: any) {
      setResults(r => ({ ...r, [t.name]: `Failed: ${err?.message || 'network error'}` }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif', color: '#0F1923' }}>
      <h1 style={{ fontSize: 22, margin: '8px 0 4px' }}>WhatsApp test</h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 12px' }}>
        Sends each template with sample values to the number below.
      </p>
      <div style={{
        padding: '10px 12px', borderRadius: 8, fontSize: 14, marginBottom: 16,
        background: enabled ? '#ecfdf5' : '#fff7ed', color: enabled ? '#065f46' : '#9a3412',
      }}>
        {enabled
          ? 'WhatsApp is ON for real bookings on this site.'
          : 'WhatsApp is OFF for real bookings (WHATSAPP_ENABLED not set). Test sends below still work.'}
      </div>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Your mobile number</label>
      <input
        value={phone}
        onChange={e => setPhone(e.target.value)}
        inputMode="numeric"
        placeholder="10-digit mobile"
        style={{ width: '100%', padding: '12px', fontSize: 16, border: '1px solid #cbd5e1', borderRadius: 8, boxSizing: 'border-box', marginBottom: 16 }}
      />
      {TEMPLATES.map(t => (
        <div key={t.name} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
          <div style={{ fontSize: 13, color: '#64748b', margin: '2px 0 6px' }}>To {t.who} · {t.when}</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>{t.text}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Sample: {t.samples.join(' | ')}</div>
          <button
            onClick={() => send(t)}
            disabled={!phone || busy !== null}
            style={{
              padding: '10px 16px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none',
              background: !phone || busy !== null ? '#94a3b8' : '#25D366', color: '#fff', cursor: 'pointer',
            }}
          >
            {busy === t.name ? 'Sending…' : 'Send test'}
          </button>
          {results[t.name] && (
            <div style={{ fontSize: 12, marginTop: 8, wordBreak: 'break-word', color: results[t.name].startsWith('Sent') ? '#065f46' : '#b91c1c' }}>
              {results[t.name]}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
