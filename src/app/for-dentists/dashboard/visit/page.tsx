'use client'

// "Waiting now": patients who checked in on the clinic tablet today, plus
// today's booked appointments. One tap opens the one-screen visit.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { NAVY, TEAL, TEAL_DARK, WHATSAPP } from '@/app/dentist/[slug]/profileTheme'
import { complaintSummary, istTodayIso } from '@/lib/visitFlow'

const LINE = '#E2E8F0'
const MUTED = '#64748B'

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

export default function WaitingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [intakes, setIntakes] = useState<any[]>([])
  const [appts, setAppts] = useState<any[]>([])
  const [setupMissing, setSetupMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/for-dentists/login'); return }
        const d = await resolveCurrentDentist(supabase, 'id')
        if (!d) return
        const today = istTodayIso()
        const startOfDayIst = new Date(`${today}T00:00:00+05:30`).toISOString()
        const [ins, ap] = await Promise.all([
          supabase.from('patient_intakes').select('id, patient_id, complaint, status, created_at, patients(name, age, gender, allergies)').eq('dentist_id', d.id).gte('created_at', startOfDayIst).order('created_at', { ascending: true }),
          supabase.from('appointments').select('id, patient_id, patient_name, time_slot, status, notes, treatments(name)').eq('dentist_id', d.id).eq('appt_date', today).not('status', 'in', '(cancelled,no_show)').order('time_slot', { ascending: true }),
        ])
        if (cancelled) return
        if (ins.error) setSetupMissing(true)
        setIntakes(ins.data || [])
        setAppts(ap.data || [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    // Refresh every 30 seconds so new tablet check-ins show up on their own.
    const timer = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [router])

  const waiting = intakes.filter(i => i.status === 'waiting')
  const seen = intakes.filter(i => i.status === 'seen')
  const checkedIn = new Set(intakes.map(i => i.patient_id))
  const booked = appts.filter(a => !a.patient_id || !checkedIn.has(a.patient_id))

  const row = (href: string | null, title: string, sub: string, dot: string | null, right?: string) => {
    const inner = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: `1px solid ${LINE}` }}>
        {dot && <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <div style={{ fontSize: 13, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
        </div>
        {right && <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>{right}</span>}
        {href && <span style={{ color: TEAL_DARK, fontWeight: 700 }}>›</span>}
      </div>
    )
    return href ? <Link key={href + title} href={href} style={{ textDecoration: 'none', color: NAVY }}>{inner}</Link> : <div key={title + sub}>{inner}</div>
  }
  const section = (title: string, children: React.ReactNode) => (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, borderBottom: `1px solid ${LINE}` }}>{title}</div>
      {children}
    </div>
  )

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 12px 100px', display: 'grid', gap: 14, color: NAVY }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, margin: 0 }}>Today&apos;s visits</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/for-dentists/dashboard/tablet" style={{ background: TEAL, color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Open tablet check-in</Link>
          <Link href="/for-dentists/dashboard/patients" style={{ border: `1px solid ${LINE}`, background: '#fff', color: NAVY, borderRadius: 12, padding: '10px 14px', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Find patient</Link>
        </div>
      </div>
      <p style={{ margin: 0, color: MUTED, fontSize: 14 }}>Hand the tablet to the patient at reception. They show up here when they finish. Tap a name to start the visit.</p>

      {setupMissing && (
        <div role="alert" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', borderRadius: 12, padding: '10px 14px', fontSize: 14 }}>
          The tablet check-in list is not switched on yet. The DentistIn team needs to run one database update. Visits from the patient file still work.
        </div>
      )}

      {loading ? <div style={{ color: MUTED }}>Loading…</div> : (
        <>
          {section(`Waiting now · ${waiting.length}`, waiting.length === 0
            ? <div style={{ padding: 16, color: MUTED, fontSize: 14 }}>Nobody waiting. New tablet check-ins appear here.</div>
            : waiting.map(i => row(`/for-dentists/dashboard/visit/${i.patient_id}`, i.patients?.name || 'Patient',
              [complaintSummary(i.complaint), i.patients?.allergies ? `Allergic: ${i.patients.allergies}` : ''].filter(Boolean).join(' · ') || 'Checked in', WHATSAPP, timeOf(i.created_at))))}
          {booked.length > 0 && section(`Booked today · ${booked.length}`, booked.map(a => row(a.patient_id ? `/for-dentists/dashboard/visit/${a.patient_id}` : null,
            a.patient_name || 'Patient', a.treatments?.name || a.notes || a.status, null, a.time_slot)))}
          {seen.length > 0 && section(`Seen today · ${seen.length}`, seen.map(i => row(`/for-dentists/dashboard/patients/${i.patient_id}`, i.patients?.name || 'Patient', complaintSummary(i.complaint) || 'Visit saved', '#CBD5E1', timeOf(i.created_at))))}
        </>
      )}
    </div>
  )
}
