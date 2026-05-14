import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/for-dentists/login')

  const { data: dentist } = await supabase
    .from('dentists')
    .select('id, name, slug, tier, is_verified, profile_photo, cover_photo, bio, whatsapp, maps_embed, created_at')
    .eq('email', user.email)
    .single()

  if (!dentist) redirect('/for-dentists/login')

  const [
    { count: appointmentCount },
    { count: enquiryCount },
    { count: reviewCount },
    { count: photoCount },
    { count: treatmentCount },
  ] = await Promise.all([
    supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id),
    supabase.from('enquiries').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'approved'),
    supabase.from('gallery_photos').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id),
    supabase.from('dentist_treatments').select('*', { count: 'exact', head: true }).eq('dentist_id', dentist.id),
  ])

  // Recent appointments
  const { data: recentAppts } = await supabase
    .from('appointments')
    .select('reference_no, patient_name, appt_date, time_slot, status')
    .eq('dentist_id', dentist.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Profile completion
  const completionItems = [
    { label: 'Profile photo', done: !!dentist.profile_photo, href: '/for-dentists/dashboard/photos' },
    { label: 'Cover photo', done: !!dentist.cover_photo, href: '/for-dentists/dashboard/photos' },
    { label: 'Bio (50+ characters)', done: !!(dentist.bio && dentist.bio.length >= 50), href: '/for-dentists/dashboard/profile' },
    { label: 'WhatsApp number', done: !!dentist.whatsapp, href: '/for-dentists/dashboard/profile' },
    { label: 'Google Maps embed', done: !!dentist.maps_embed, href: '/for-dentists/dashboard/profile' },
    { label: 'Add treatments (3+)', done: (treatmentCount || 0) >= 3, href: '/for-dentists/dashboard/treatments' },
    { label: 'Upload photos (3+)', done: (photoCount || 0) >= 3, href: '/for-dentists/dashboard/photos' },
  ]
  const pct = Math.round((completionItems.filter(i => i.done).length / completionItems.length) * 100)

  const STATS = [
    { icon: '📅', label: 'Total Appointments', value: appointmentCount || 0, href: '/for-dentists/dashboard/appointments' },
    { icon: '💬', label: 'Enquiries', value: enquiryCount || 0, href: '/for-dentists/dashboard/enquiries' },
    { icon: '⭐', label: 'Approved Reviews', value: reviewCount || 0, href: '/for-dentists/dashboard/profile' },
    { icon: '📸', label: 'Gallery Photos', value: photoCount || 0, href: '/for-dentists/dashboard/photos' },
  ]

  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    confirmed: { bg: '#DBEAFE', text: '#1D4ED8' },
    completed: { bg: '#DCFCE7', text: '#166534' },
    cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  }

  return (
    <div>
      {/* Welcome */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>
          Welcome back, {dentist.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>
          {dentist.is_verified ? '✅ Verified listing' : '⏳ Verification pending'} · {dentist.tier || 'free'} plan
        </p>
      </div>

      {/* Primary CTAs — Walk-in is the dominant action */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 24 }}>
        <Link href="/for-dentists/dashboard/patients?new=1"
          style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '22px 24px', minHeight: 96,
            background: 'linear-gradient(135deg, #00A878 0%, #00875E 100%)',
            color: '#fff', borderRadius: 16, textDecoration: 'none',
            boxShadow: '0 6px 20px rgba(0,168,120,0.28)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
          }}>👤</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85, marginBottom: 4 }}>Most used</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, lineHeight: 1.1, marginBottom: 4 }}>Walk-in Patient</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>Register a new patient who just walked in.</div>
          </div>
          <span style={{ fontSize: 24, opacity: 0.85, flexShrink: 0 }}>→</span>
        </Link>

        <Link href="/for-dentists/dashboard/appointments?new=1"
          style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '22px 24px', minHeight: 96,
            background: 'linear-gradient(135deg, #0057A8 0%, #003F7A 100%)',
            color: '#fff', borderRadius: 16, textDecoration: 'none',
            boxShadow: '0 6px 20px rgba(0,87,168,0.24)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
          }}>📅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1.1, marginBottom: 4 }}>Book Appointment</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>Schedule a future visit.</div>
          </div>
          <span style={{ fontSize: 24, opacity: 0.85, flexShrink: 0 }}>→</span>
        </Link>
      </div>

      {/* Profile completion banner */}
      {pct < 100 && (
        <div style={{ background: 'var(--blue-light)', border: '1px solid #BFDBFE', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>Complete your profile</h3>
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--blue)' }}>{pct}%</span>
          </div>
          <div style={{ height: 6, background: '#BFDBFE', borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--blue)', borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {completionItems.filter(i => !i.done).map(item => (
              <Link key={item.label} href={item.href} style={{ fontSize: 12, fontWeight: 500, padding: '4px 12px', background: '#fff', border: '1px solid #BFDBFE', borderRadius: 20, color: 'var(--blue)', textDecoration: 'none' }}>
                + {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {STATS.map(stat => (
          <Link key={stat.label} href={stat.href} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', display: 'block', textDecoration: 'none', transition: 'box-shadow 0.2s' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{stat.icon}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: 'var(--text)', marginBottom: 4 }}>{stat.value}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{stat.label}</div>
          </Link>
        ))}
      </div>

      {/* Recent appointments */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Recent Appointments</h3>
          <Link href="/for-dentists/dashboard/appointments" style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
        </div>
        {recentAppts && recentAppts.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Reference', 'Patient', 'Date', 'Time', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--bg)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentAppts.map(a => {
                const sc = STATUS_COLORS[a.status] || { bg: '#F3F4F6', text: '#374151' }
                return (
                  <tr key={a.reference_no} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'monospace', color: 'var(--blue)', fontWeight: 600 }}>{a.reference_no}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>{a.patient_name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{new Date(a.appt_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>{a.time_slot}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.text }}>{a.status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
            <p style={{ fontSize: 14 }}>No appointments yet. Share your profile to start getting bookings.</p>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {[
          { icon: '✏️', label: 'Edit Profile', href: '/for-dentists/dashboard/profile', desc: 'Update your clinic details' },
          { icon: '📸', label: 'Upload Photos', href: '/for-dentists/dashboard/photos', desc: 'Add clinic & gallery photos' },
          { icon: '🕐', label: 'Set Hours', href: '/for-dentists/dashboard/hours', desc: 'Configure working hours' },
          { icon: '🦷', label: 'Add Treatments', href: '/for-dentists/dashboard/treatments', desc: 'Set treatments & fees' },
        ].map(action => (
          <Link key={action.label} href={action.href} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', textDecoration: 'none', display: 'block', transition: 'box-shadow 0.2s' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{action.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-heading)', marginBottom: 4, color: 'var(--text)' }}>{action.label}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{action.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
