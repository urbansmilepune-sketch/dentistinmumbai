'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Urdu']
const SPECIALTIES = ['General Dentistry', 'Orthodontics', 'Endodontics', 'Periodontology', 'Prosthodontics', 'Oral Surgery', 'Pediatric Dentistry', 'Cosmetic Dentistry', 'Implantology', 'Oral Medicine']
const QUALIFICATIONS = ['BDS', 'BDS + MDS', 'BDS + Fellowship', 'MDS Specialist', 'BDS + Diploma', 'MDS (Orthodontics)', 'MDS (Prosthodontics)', 'MDS (Oral Surgery)', 'MDS (Periodontology)', 'MDS (Endodontics)', 'MDS (Pediatric Dentistry)', 'MDS (Oral Medicine)']

export default function EditProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [dentistId, setDentistId] = useState('')

  const [form, setForm] = useState({
    name: '', clinic_name: '', qualifications: '', experience_years: '',
    bio: '', phone: '', whatsapp: '', website: '', address: '',
    consultation_fee: '', mci_number: '', emi_available: false,
    languages: [] as string[], specialties: [] as string[],
    maps_embed: '',
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }

      const { data: dentist } = await supabase
        .from('dentists')
        .select('id, name, clinic_name, qualifications, experience_years, bio, phone, whatsapp, website, address, consultation_fee, mci_number, emi_available, languages, specialties, maps_embed')
        .eq('email', user.email)
        .single()

      if (dentist) {
        setDentistId(dentist.id)
        setForm({
          name: dentist.name || '',
          clinic_name: dentist.clinic_name || '',
          qualifications: dentist.qualifications || '',
          experience_years: dentist.experience_years?.toString() || '',
          bio: dentist.bio || '',
          phone: dentist.phone || '',
          whatsapp: dentist.whatsapp || '',
          website: dentist.website || '',
          address: dentist.address || '',
          consultation_fee: dentist.consultation_fee?.toString() || '',
          mci_number: dentist.mci_number || '',
          emi_available: dentist.emi_available || false,
          languages: dentist.languages || [],
          specialties: dentist.specialties || [],
          maps_embed: dentist.maps_embed || '',
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  function toggleArray(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
  }

  async function handleSave() {
    if (!form.name || !form.clinic_name) { setError('Name and Clinic Name are required'); return }
    setSaving(true); setError(''); setSaved(false)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('dentists')
      .update({
        name: form.name,
        clinic_name: form.clinic_name,
        qualifications: form.qualifications,
        experience_years: form.experience_years ? parseInt(form.experience_years) : null,
        bio: form.bio,
        phone: form.phone,
        whatsapp: form.whatsapp,
        website: form.website,
        address: form.address,
        consultation_fee: form.consultation_fee ? parseInt(form.consultation_fee) : null,
        mci_number: form.mci_number,
        emi_available: form.emi_available,
        languages: form.languages,
        specialties: form.specialties,
        maps_embed: form.maps_embed,
      })
      .eq('id', dentistId)

    setSaving(false)
    if (updateError) { setError('Failed to save. Please try again.'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid var(--border)', fontSize: 14,
    fontFamily: 'var(--font-body)', outline: 'none',
    background: '#fff', boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: 13, fontWeight: 600 as const, display: 'block' as const, marginBottom: 6, color: 'var(--text)' }
  const sectionStyle = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 20 }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Loading your profile...</p>
    </div>
  )

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Edit Profile</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>All changes are reflected on your public profile instantly</p>
        </div>
        <button
          onClick={handleSave} disabled={saving}
          style={{ padding: '11px 24px', background: saved ? '#00A878' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'background 0.3s' }}
        >{saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Changes'}</button>
      </div>

      {error && <div style={{ padding: '12px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B', marginBottom: 20 }}>{error}</div>}

      {/* Basic Info */}
      <div style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 20 }}>Basic Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Full Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Dr. Your Name" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Clinic Name *</label>
            <input value={form.clinic_name} onChange={e => setForm(f => ({ ...f, clinic_name: e.target.value }))} placeholder="Your Dental Clinic" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Qualification</label>
            <select value={form.qualifications} onChange={e => setForm(f => ({ ...f, qualifications: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Select qualification</option>
              {QUALIFICATIONS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Years of Experience</label>
            <input type="number" value={form.experience_years} onChange={e => setForm(f => ({ ...f, experience_years: e.target.value }))} placeholder="e.g. 10" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>MCI / DCI Registration No.</label>
            <input value={form.mci_number} onChange={e => setForm(f => ({ ...f, mci_number: e.target.value }))} placeholder="Your registration number" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Consultation Fee (₹)</label>
            <input type="number" value={form.consultation_fee} onChange={e => setForm(f => ({ ...f, consultation_fee: e.target.value }))} placeholder="e.g. 300" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>About You / Bio</label>
            <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Tell patients about your experience, approach, and specialties..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{form.bio.length} characters (min. 50 recommended)</div>
          </div>
        </div>

        {/* EMI toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '12px 16px', background: 'var(--bg)', borderRadius: 10 }}>
          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0 }}>
            <input type="checkbox" checked={form.emi_available} onChange={e => setForm(f => ({ ...f, emi_available: e.target.checked }))} style={{ opacity: 0, width: 0, height: 0 }} />
            <span onClick={() => setForm(f => ({ ...f, emi_available: !f.emi_available }))} style={{ position: 'absolute', inset: 0, background: form.emi_available ? 'var(--blue)' : '#CBD5E1', borderRadius: 24, cursor: 'pointer', transition: '0.3s' }}>
              <span style={{ position: 'absolute', height: 18, width: 18, left: form.emi_available ? 22 : 3, bottom: 3, background: '#fff', borderRadius: '50%', transition: '0.3s' }} />
            </span>
          </label>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>💳 EMI Available</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Show EMI badge on your profile to attract more patients</div>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 20 }}>Contact & Location</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit number" type="tel" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>WhatsApp Number</label>
              <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="10-digit WhatsApp number" type="tel" style={inputStyle} />
              <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>💬 Patients will message you directly</div>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Website (optional)</label>
            <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://yourclinic.com" type="url" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Clinic Address</label>
            <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Full clinic address including area, Mumbai, PIN" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>Google Maps Embed Code</label>
            <textarea value={form.maps_embed} onChange={e => setForm(f => ({ ...f, maps_embed: e.target.value }))} placeholder='Paste the <iframe> embed code from Google Maps here...' rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Go to Google Maps → Search your clinic → Share → Embed a map → Copy HTML
            </div>
          </div>
        </div>
      </div>

      {/* Languages */}
      <div style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Languages Spoken</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Select all languages you speak with patients</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LANGUAGES.map(lang => (
            <button
              key={lang}
              type="button"
              onClick={() => setForm(f => ({ ...f, languages: toggleArray(f.languages, lang) }))}
              style={{
                padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.15s',
                background: form.languages.includes(lang) ? 'var(--blue)' : '#fff',
                color: form.languages.includes(lang) ? '#fff' : 'var(--text)',
                border: `1.5px solid ${form.languages.includes(lang) ? 'var(--blue)' : 'var(--border)'}`,
              }}
            >{form.languages.includes(lang) ? '✓ ' : ''}{lang}</button>
          ))}
        </div>
      </div>

      {/* Specialties */}
      <div style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Specialties</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Select your areas of specialization</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SPECIALTIES.map(sp => (
            <button
              key={sp}
              type="button"
              onClick={() => setForm(f => ({ ...f, specialties: toggleArray(f.specialties, sp) }))}
              style={{
                padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.15s',
                background: form.specialties.includes(sp) ? 'var(--blue-light)' : '#fff',
                color: form.specialties.includes(sp) ? 'var(--blue)' : 'var(--text)',
                border: `1.5px solid ${form.specialties.includes(sp) ? 'var(--blue)' : 'var(--border)'}`,
              }}
            >{form.specialties.includes(sp) ? '✓ ' : ''}{sp}</button>
          ))}
        </div>
      </div>

      {/* Save button bottom */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingBottom: 40 }}>
        <button
          onClick={handleSave} disabled={saving}
          style={{ padding: '13px 32px', background: saved ? '#00A878' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.3s' }}
        >{saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Changes'}</button>
      </div>
    </div>
  )
}
