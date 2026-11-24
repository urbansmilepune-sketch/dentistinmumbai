'use client'

// Patient half of an opening city's homepage: area + WhatsApp number, saved
// to city_waitlist through /api/waitlist so we can message them when
// booking opens in their area.

import { useState } from 'react'

export default function OpeningNotifyForm({ citySlug, areas }: { citySlug: string; areas: string[] }) {
  const [area, setArea] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setError('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, area, city_slug: citySlug, source: 'opening-home' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) setState('sent')
      else { setState('error'); setError(data?.error || 'Could not save right now. Please try again.') }
    } catch {
      setState('error')
      setError('No connection. Please try again.')
    }
  }

  if (state === 'sent') {
    return (
      <div className="op-sent" role="status">
        Done. We&apos;ll message you on WhatsApp when you can book a dentist{area ? ` in ${area}` : ''}.
      </div>
    )
  }

  return (
    <form className="op-form" onSubmit={submit}>
      {areas.length > 0 && (
        <label className="op-field">
          <span>Your area</span>
          <select id="op-area" value={area} onChange={e => setArea(e.target.value)}>
            <option value="">Choose area</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      )}
      <label className="op-field">
        <span>WhatsApp number</span>
        <input
          id="op-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="10-digit mobile"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          required
        />
      </label>
      <button className="op-wa" type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Saving…' : 'Notify me on WhatsApp'}
      </button>
      {state === 'error' && <p className="op-err" role="alert">{error}</p>}
    </form>
  )
}
