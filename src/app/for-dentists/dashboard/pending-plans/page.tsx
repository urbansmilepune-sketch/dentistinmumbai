'use client'

// Pending plans: treatment the clinic has planned but not finished — plans the
// patient said "later" to, and plans with sittings still to do. Shows the
// rupee value waiting, with a one-tap WhatsApp reminder per patient.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { whatsappLink } from '@/lib/phone'
import { NAVY, TEAL_DARK, WHATSAPP } from '@/app/dentist/[slug]/profileTheme'
import { prettyDate, rupees } from '@/lib/visitFlow'

const LINE = '#E2E8F0'
const MUTED = '#64748B'

type Row = {
  id: string; title: string; status: string; created_at: string; updated_at: string | null
  patient: { id: string; name: string; phone: string | null } | null
  remaining: number; stepsLeft: number
}

type Tab = 'later' | 'ongoing'

export default function PendingPlansPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [clinic, setClinic] = useState('')
  const [tab, setTab] = useState<Tab>('later')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/for-dentists/login'); return }
        const d = await resolveCurrentDentist<{ id: string; name: string; clinic_name: string | null }>(supabase, 'id, name, clinic_name')
        if (!d) return
        setClinic(d.clinic_name || d.name || '')
        const out: Row[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error: e } = await supabase
            .from('treatment_plans')
            .select('id, title, status, created_at, updated_at, total_estimated_cost, total_cost, patients(id, name, phone), treatment_plan_steps(estimated_cost, status)')
            .eq('dentist_id', d.id)
            .in('status', ['presented', 'accepted', 'in_progress'])
            .order('created_at', { ascending: false })
            .range(from, from + 999)
          if (e) { setError(e.message); break }
          for (const p of (data || []) as any[]) {
            const steps: any[] = p.treatment_plan_steps || []
            const left = steps.filter(s => s.status !== 'completed' && s.status !== 'skipped')
            const remaining = steps.length ? left.reduce((s, x) => s + Number(x.estimated_cost || 0), 0) : Number(p.total_estimated_cost || p.total_cost || 0)
            if (steps.length && left.length === 0) continue
            out.push({ id: p.id, title: p.title, status: p.status, created_at: p.created_at, updated_at: p.updated_at, patient: p.patients, remaining, stepsLeft: left.length })
          }
          if (!data || data.length < 1000) break
        }
        if (!cancelled) setRows(out)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [router])

  const later = rows.filter(r => r.status === 'presented')
  const ongoing = rows.filter(r => r.status !== 'presented')
  const list = tab === 'later' ? later : ongoing
  const total = (l: Row[]) => l.reduce((s, r) => s + r.remaining, 0)

  function message(r: Row): string {
    const first = String(r.patient?.name || '').split(/\s+/)[0]
    return r.status === 'presented'
      ? `Hi ${first}, this is ${clinic}. Your treatment plan (${r.title}) is saved with us. Reply here and we will book a time that suits you.`
      : `Hi ${first}, this is ${clinic}. Your next sitting for ${r.title} is due. Reply here and we will book a time that suits you.`
  }

  const tabBtn = (id: Tab, label: string) => (
    <button type="button" onClick={() => setTab(id)} style={{
      flex: 1, border: `1.5px solid ${tab === id ? NAVY : LINE}`, background: tab === id ? NAVY : '#fff', color: tab === id ? '#fff' : NAVY,
      borderRadius: 10, padding: '10px 8px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)',
    }}>{label}</button>
  )

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 12px 100px', display: 'grid', gap: 14, color: NAVY }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, margin: 0 }}>Pending plans</h1>
      <div style={{ background: NAVY, color: '#fff', borderRadius: 14, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: '#94A3B8' }}>Treatment waiting for patients</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 26 }}>{rupees(total(rows))}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13, color: '#CBD5E1' }}>{rows.length} plan{rows.length === 1 ? '' : 's'}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {tabBtn('later', `Said later · ${later.length} · ${rupees(total(later))}`)}
        {tabBtn('ongoing', `Not finished · ${ongoing.length} · ${rupees(total(ongoing))}`)}
      </div>
      {error && <div role="alert" style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 12, padding: '10px 14px', fontSize: 14 }}>{error}</div>}
      {loading ? <div style={{ color: MUTED }}>Loading…</div> : list.length === 0 ? (
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, color: MUTED, fontSize: 14 }}>
          {tab === 'later' ? 'No plans waiting. When a patient says "later" on the visit screen, the plan shows up here.' : 'No unfinished treatment.'}
        </div>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
          {list.map(r => {
            const wa = whatsappLink(r.patient?.phone, message(r))
            return (
              <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${LINE}` }}>
                <Link href={r.patient ? `/for-dentists/dashboard/visit/${r.patient.id}` : '#'} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: NAVY }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.patient?.name || 'Patient'} <span style={{ fontWeight: 500, color: MUTED }}>· {r.title}</span></div>
                  <div style={{ fontSize: 12.5, color: MUTED }}>
                    {r.status === 'presented' ? `Said later on ${prettyDate(r.created_at)}` : `${r.stepsLeft} step${r.stepsLeft === 1 ? '' : 's'} left · last update ${prettyDate(r.updated_at || r.created_at)}`}
                  </div>
                </Link>
                <b style={{ whiteSpace: 'nowrap' }}>{rupees(r.remaining)}</b>
                {wa
                  ? <a href={wa} target="_blank" rel="noopener noreferrer" style={{ background: WHATSAPP, color: '#fff', borderRadius: 10, padding: '8px 10px', fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>Remind</a>
                  : <span style={{ fontSize: 12, color: MUTED }}>No phone</span>}
              </div>
            )
          })}
        </div>
      )}
      <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Tap a name to open the visit screen with the plan ready. <Link href="/for-dentists/dashboard/visit" style={{ color: TEAL_DARK, fontWeight: 700 }}>Today&apos;s visits</Link></p>
    </div>
  )
}
