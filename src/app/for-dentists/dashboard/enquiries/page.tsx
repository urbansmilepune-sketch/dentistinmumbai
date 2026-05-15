'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getCityBySlug } from '@/config/cities'

export default function EnquiriesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [enquiries, setEnquiries] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [cityDomain, setCityDomain] = useState('dentistinmumbai.in')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const { data: dentist } = await supabase.from('dentists').select('id, city').eq('email', user.email).single()
      if (!dentist) return
      setCityDomain(getCityBySlug((dentist as any).city).domain)
      const { data } = await supabase.from('enquiries').select('*').eq('dentist_id', dentist.id).order('created_at', { ascending: false })
      setEnquiries(data || [])
      setLoading(false)
    }
    load()
  }, [])

  async function updateStatus(id: string, status: string) {
    const supabase = createClient()
    await supabase.from('enquiries').update({ status }).eq('id', id)
    setEnquiries(prev => prev.map(e => e.id === id ? { ...e, status } : e))
  }

  const filtered = filter === 'all' ? enquiries : enquiries.filter(e => e.status === filter)

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Enquiries</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)' }}>Patient enquiries from your profile</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'new', 'contacted', 'closed'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)', cursor: 'pointer', border: '1.5px solid', background: filter === s ? 'var(--blue)' : '#fff', color: filter === s ? '#fff' : 'var(--text)', borderColor: filter === s ? 'var(--blue)' : 'var(--border)', textTransform: 'capitalize' }}>
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: '#fff', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
          <p style={{ color: 'var(--muted)' }}>No enquiries yet. Share your profile to get more leads.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(e => (
            <div key={e.id} style={{ background: '#fff', border: `1px solid ${e.status === 'new' ? '#FDE68A' : 'var(--border)'}`, borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{e.patient_name}</span>
                  {e.status === 'new' && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 20 }}>NEW</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span>📞 {e.patient_phone}</span>
                  {e.patient_email && <span>✉️ {e.patient_email}</span>}
                  {e.treatment && <span>🦷 {e.treatment}</span>}
                  <span>📅 {new Date(e.created_at).toLocaleDateString('en-IN')}</span>
                </div>
                {e.message && <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{e.message}"</p>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {e.patient_phone && (
                  <a href={`https://wa.me/91${e.patient_phone.replace(/\D/g,'')}?text=${encodeURIComponent(`Hi ${e.patient_name}, thank you for your enquiry. I am Dr. from ${cityDomain} — how can I help you?`)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ padding: '7px 14px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                    WhatsApp
                  </a>
                )}
                <a href={`tel:${e.patient_phone}`} style={{ padding: '7px 14px', background: 'var(--bg)', color: 'var(--blue)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Call</a>
                {e.status !== 'closed' && (
                  <button onClick={() => updateStatus(e.id, e.status === 'new' ? 'contacted' : 'closed')}
                    style={{ padding: '7px 14px', background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    {e.status === 'new' ? 'Mark Contacted' : 'Close'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
