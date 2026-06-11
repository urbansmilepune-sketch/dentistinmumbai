'use client'

import Link from 'next/link'

interface BookingSidebarProps {
  dentist: {
    id: string
    slug: string
    name: string
    phone: string | null
    whatsapp: string | null
    consultation_fee: number
    emi_available: boolean
    is_verified: boolean
    tier: string
  }
  cityDomain?: string
}

export default function BookingSidebar({ dentist, cityDomain = 'dentistinmumbai.in' }: BookingSidebarProps) {
  const waLink = dentist.whatsapp
    ? `https://wa.me/91${dentist.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I found your profile on ${cityDomain} and would like to book an appointment.`)}`
    : null

  return (
    <div style={{
      width: 300, flexShrink: 0, position: 'sticky', top: 88,
      display: 'flex', flexDirection: 'column', gap: 16,
    }} className="filter-sidebar-desktop">

      {/* Booking card */}
      <div style={{ background: '#fff', border: '2px solid var(--blue)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ background: 'var(--blue)', padding: '16px 20px' }}>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginBottom: 4 }}>Consultation Fee</p>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#fff' }}>
            {dentist.consultation_fee ? `₹${dentist.consultation_fee}` : 'Call for price'}
          </div>
          {dentist.emi_available && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>✓ EMI Available</div>
          )}
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link
            href={`/dentist/${dentist.slug}#book`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px', background: 'var(--blue)', color: '#fff',
              borderRadius: 10, fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-body)',
            }}
          >📅 Book Appointment</Link>

          {waLink && (
            <a
              href={waLink} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', background: '#DCFCE7', color: '#166534',
                borderRadius: 10, fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-body)',
                border: '1px solid #BBF7D0',
              }}
            >💬 WhatsApp</a>
          )}

          {dentist.phone && (
            <a
              href={`tel:${dentist.phone}`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', background: 'var(--bg)', color: 'var(--text)',
                borderRadius: 10, fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-body)',
                border: '1px solid var(--border)',
              }}
            >📞 Call Clinic</a>
          )}
        </div>
      </div>

      {/* Trust signals */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px' }}>
        <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Why Book Here?</h4>
        {[
          { icon: '✅', text: 'Verified dentist' },
          { icon: '🔒', text: 'Secure & private' },
          { icon: '💰', text: 'No booking fee' },
          { icon: '📱', text: 'Instant confirmation' },
        ].map(item => (
          <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{item.text}</span>
          </div>
        ))}
      </div>

      {/* Share */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px' }}>
        <h4 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Share Profile</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            style={{
              flex: 1, padding: '8px', background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >🔗 Copy Link</button>
          <a
            href={`https://wa.me/?text=Check out this dentist: ${typeof window !== 'undefined' ? window.location.href : ''}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              flex: 1, padding: '8px', background: '#DCFCE7', border: '1px solid #BBF7D0',
              borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#166534',
              textAlign: 'center', fontFamily: 'var(--font-body)',
            }}
          >💬 Share</a>
        </div>
      </div>
    </div>
  )
}
