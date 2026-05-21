'use client'

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getCityBySlug } from '@/config/cities'
import { buildMapsIframe, classifyMapsInput, extractMapsIframeSrc } from '@/lib/maps'

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
  const [slug, setSlug] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [siteBase, setSiteBase] = useState('https://dentistinmumbai.in')

  const [form, setForm] = useState({
    name: '', clinic_name: '', qualifications: '', degree: '', experience_years: '',
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
        .select('id, slug, name, clinic_name, qualifications, degree, experience_years, bio, phone, whatsapp, website, address, consultation_fee, mci_number, emi_available, languages, specialties, maps_embed, city')
        .eq('email', user.email)
        .single()

      if (dentist) {
        setDentistId(dentist.id)
        setSlug(dentist.slug || '')
        setSiteBase(`https://${getCityBySlug((dentist as any).city).domain}`)
        setForm({
          name: dentist.name || '',
          clinic_name: dentist.clinic_name || '',
          qualifications: dentist.qualifications || '',
          degree: (dentist as any).degree || '',
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
      } else {
        setError(`No dentist profile is linked to ${user.email}. If you registered under a different email, sign out and sign in with that one — otherwise contact support.`)
      }
      setLoading(false)
    }
    load()
  }, [])

  function toggleArray(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
  }

  // Generate the booking-page QR whenever the dentist's slug becomes available.
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    QRCode.toDataURL(`${siteBase}/book/${slug}`, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0F1923', light: '#FFFFFF' },
    }).then(url => { if (!cancelled) setQrDataUrl(url) }).catch(() => {})
    return () => { cancelled = true }
  }, [slug, siteBase])

  // Draw a 400×600 portrait card on a canvas — blue header + footer, white
  // body with doctor / clinic / tagline / QR / fallback URL — and trigger a
  // PNG download. Dentists print this for reception or share the image on
  // WhatsApp / Instagram, so it has to look brandable on its own without the
  // rest of the page. Uses system-ui in the canvas: next/font web fonts
  // (Sora/DM Sans) aren't reliably available to canvas drawText and would
  // race against the click, while system-ui renders crisp on every device.
  async function downloadCard() {
    if (!slug) return
    const cityDomain = siteBase.replace(/^https?:\/\//, '')
    const bookingPath = `${cityDomain}/book/${slug}`
    const fullBookingUrl = `${siteBase}/book/${slug}`

    // Regenerate the QR at print resolution with high error correction so the
    // 270px on-card render still scans reliably after WhatsApp re-compresses
    // or the reception printout fades. The on-screen preview keeps its own
    // qrDataUrl (smaller, faster) so we don't bottleneck the page load on this.
    let qrUrl: string
    try {
      qrUrl = await QRCode.toDataURL(fullBookingUrl, {
        width: 560,
        margin: 1,
        errorCorrectionLevel: 'H',
        color: { dark: '#0F1923', light: '#FFFFFF' },
      })
    } catch { return }

    const qrImg = new Image()
    try {
      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve()
        qrImg.onerror = () => reject(new Error('qr image failed to load'))
        qrImg.src = qrUrl
      })
    } catch { return }

    const W = 400
    const H = 600
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    const BLUE = '#003F7A'
    const INK = '#0F1923'
    const MUTED = '#64748B'
    const HAIRLINE = '#E2E8F0'

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Header band
    const HEAD_H = 70
    ctx.fillStyle = BLUE
    ctx.fillRect(0, 0, W, HEAD_H)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold 22px ${FONT_STACK}`
    ctx.fillText(cityDomain, W / 2, HEAD_H / 2)

    // Doctor name — prepend "Dr." unless the dentist already typed it.
    const drName = /^dr\.?\s/i.test(form.name) ? form.name : `Dr. ${form.name}`
    ctx.fillStyle = INK
    ctx.font = `bold 22px ${FONT_STACK}`
    ctx.fillText(drName, W / 2, 102)

    ctx.fillStyle = MUTED
    ctx.font = `500 14px ${FONT_STACK}`
    ctx.fillText(form.clinic_name, W / 2, 128)

    // Divider hairline
    ctx.strokeStyle = HAIRLINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(80, 152)
    ctx.lineTo(W - 80, 152)
    ctx.stroke()

    ctx.fillStyle = BLUE
    ctx.font = `bold 15px ${FONT_STACK}`
    ctx.fillText('Scan to Book Your Appointment', W / 2, 177)

    // QR with a thin bordered frame so it reads as a "tile" on the card
    const QR = 270
    const QX = (W - QR) / 2
    const QY = 200
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(QX - 6, QY - 6, QR + 12, QR + 12)
    ctx.strokeStyle = HAIRLINE
    ctx.strokeRect(QX - 5.5, QY - 5.5, QR + 11, QR + 11)
    ctx.drawImage(qrImg, QX, QY, QR, QR)

    // Fallback URL block — small lead-in over the bold link
    const URLY = QY + QR + 24
    ctx.fillStyle = MUTED
    ctx.font = `12px ${FONT_STACK}`
    ctx.fillText('Or visit', W / 2, URLY)
    ctx.fillStyle = BLUE
    ctx.font = `bold 13px ${FONT_STACK}`
    ctx.fillText(bookingPath, W / 2, URLY + 18)

    // Footer band
    const FOOT_H = 50
    ctx.fillStyle = BLUE
    ctx.fillRect(0, H - FOOT_H, W, FOOT_H)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `11px ${FONT_STACK}`
    ctx.fillText(`Powered by ${cityDomain}`, W / 2, H - FOOT_H / 2)

    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `book-${slug}-card.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function shareOnWhatsApp() {
    const bookingUrl = `${siteBase}/book/${slug}`
    const lines = [
      `Book your appointment with ${form.clinic_name || form.name || 'us'}:`,
      bookingUrl,
    ]
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer')
  }

  async function handleSave() {
    if (!form.name || !form.clinic_name) { setError('Name and Clinic Name are required'); return }
    if (!dentistId) { setError('No dentist profile is linked to your account. Contact support.'); return }
    setSaving(true); setError(''); setSaved(false)

    // Normalise the maps field on save: a pasted Google Maps URL becomes a
    // search-embed iframe pointed at the clinic name; an iframe stays as-is.
    // Reflect the normalised value back into the form so the dentist sees
    // what actually landed in the DB.
    const normalisedMapsEmbed = buildMapsIframe(form.maps_embed, form.clinic_name)
    if (normalisedMapsEmbed !== form.maps_embed) {
      setForm(f => ({ ...f, maps_embed: normalisedMapsEmbed }))
    }

    const supabase = createClient()
    // .select('id') makes RLS denials observable. Without it, a denied write
    // returns no error AND no rows; the old code happily reported "Saved!"
    // while the DB was unchanged. Zero returned rows means the write didn't
    // land — usually a missing UPDATE policy or an email-mismatch.
    const { data, error: updateError } = await supabase
      .from('dentists')
      .update({
        name: form.name,
        clinic_name: form.clinic_name,
        qualifications: form.qualifications,
        degree: form.degree || null,
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
        maps_embed: normalisedMapsEmbed,
      })
      .eq('id', dentistId)
      .select('id')

    setSaving(false)
    if (updateError) { setError(`Save failed: ${updateError.message}`); return }
    if (!data || data.length === 0) {
      setError('Save failed — no row was updated. Check that you are signed in as the dentist whose profile you are editing.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // Live profile completion grade — 12 patient-facing fields. Recomputes
  // every render off the current form state so the bar tracks edits before
  // the dentist hits Save.
  const completionChecks = [
    !!form.name?.trim(),
    !!form.clinic_name?.trim(),
    !!form.qualifications?.trim(),
    (parseInt(form.experience_years) || 0) > 0,
    !!(form.bio && form.bio.length > 20),
    !!form.phone?.trim(),
    !!form.whatsapp?.trim(),
    !!form.address?.trim(),
    (parseInt(form.consultation_fee) || 0) > 0,
    !!form.mci_number?.trim(),
    form.languages.length > 0,
    form.specialties.length > 0,
  ]
  const completionDone = completionChecks.filter(Boolean).length
  const completionPct = Math.round((completionDone / completionChecks.length) * 100)
  const completionColor = completionPct === 100 ? '#00A878' : completionPct >= 50 ? '#F59E0B' : '#DC2626'
  const completionBg    = completionPct === 100 ? '#DCFCE7' : completionPct >= 50 ? '#FEF3C7' : '#FEE2E2'
  const completionBorder = completionPct === 100 ? '#BBF7D0' : completionPct >= 50 ? '#FDE68A' : '#FECACA'

  // Derive an iframe-shaped preview from whatever the dentist has typed,
  // applying the same URL → clinic-name-search-embed fallback that we save
  // on submit. Empty input → no preview.
  const mapsResolved = buildMapsIframe(form.maps_embed, form.clinic_name)
  const mapsPreviewSrc = extractMapsIframeSrc(mapsResolved)
  // Drives the inline warning/instructions block: short links can't be
  // embedded and unrecognised pastes need a clear "this isn't a Maps URL"
  // signal so the dentist doesn't think it just silently saved.
  const mapsKind = classifyMapsInput(form.maps_embed)

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
    <div className="profile-edit-root" style={{ maxWidth: 720 }}>
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

      <div style={{ background: completionBg, border: `1px solid ${completionBorder}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: completionColor }}>
            Profile {completionPct}% complete
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {completionDone} of {completionChecks.length} fields filled
          </span>
        </div>
        <div style={{ height: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${completionPct}%`, background: completionColor, borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
      </div>

      {error && <div style={{ padding: '12px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B', marginBottom: 20 }}>{error}</div>}

      {/* Basic Info */}
      <div style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 20 }}>Basic Information</h2>
        <div className="profile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
            <label style={labelStyle}>Degree (printed on prescriptions)</label>
            <input value={form.degree} onChange={e => setForm(f => ({ ...f, degree: e.target.value }))} placeholder="e.g. BDS, MDS (Orthodontics), FICOI" style={inputStyle} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Appears under your name on prescription PDFs and invoices. Use the format you sign with.</div>
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
          <div className="profile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
            <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Full clinic address including area, city, PIN" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label style={labelStyle}>Google Maps Embed</label>
            <textarea
              value={form.maps_embed}
              onChange={e => setForm(f => ({ ...f, maps_embed: e.target.value }))}
              placeholder='Paste the full <iframe> from Google Maps → Share → Embed a map'
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            />

            {/* How-to instructions — always visible so the dentist knows
                what shape of paste actually works. Google blocks
                X-Frame-Options on every Maps URL except the canonical
                /maps/embed?pb= one served by the Embed flow. */}
            <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                How to get your Google Maps embed code
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <li>Open <strong>google.com/maps</strong> on a <strong>desktop</strong> (not mobile).</li>
                <li>Search for your clinic.</li>
                <li>Click <strong>Share</strong> → <strong>Embed a map</strong>.</li>
                <li>Copy the full <code>&lt;iframe&gt;</code> code.</li>
                <li>Paste it in the box above.</li>
              </ol>
            </div>

            {/* Short link warning — share.google / maps.app.goo.gl / goo.gl
                can't be expanded in the browser and the redirect target
                blocks framing, so the iframe simply won't render. Tell the
                dentist before they hit Save expecting a working map. */}
            {mapsKind === 'shortLink' && (
              <div style={{ marginTop: 10, padding: '12px 14px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, fontSize: 13, color: '#92400E', lineHeight: 1.6 }}>
                <strong>⚠ Short links can't be embedded.</strong> Google Maps share links
                (<code>maps.app.goo.gl</code>, <code>share.google</code>, <code>goo.gl/maps</code>) redirect
                in a way browsers block inside an iframe. Please use the <strong>Embed a map</strong> option
                on desktop Google Maps and paste the full <code>&lt;iframe&gt;</code> code instead.
              </div>
            )}

            {/* Search-based fallback — we'll save it and the public profile
                will attempt the maps.google.com/maps?q=… form, but Google
                may refuse to frame it in some browsers. Skip the iframe
                preview entirely and just tell the dentist what to expect,
                rather than show a frame that may be blank or X-Frame-blocked. */}
            {mapsKind === 'searchEmbed' && (
              <div style={{ marginTop: 10, padding: '12px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>
                <strong>ℹ Search-based map saved.</strong> We'll attempt to show a map for the clinic
                name on your public profile, but Google blocks this format in some browsers — the map
                area may appear blank for those patients. For a guaranteed embed, follow the steps above
                and paste the full <code>&lt;iframe&gt;</code> code.
              </div>
            )}

            {/* Unknown paste — covers an HTML blob that isn't a Maps
                iframe and any non-Maps URL. */}
            {mapsKind === 'invalid' && (
              <div style={{ marginTop: 10, padding: '12px 14px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B', lineHeight: 1.6 }}>
                <strong>✕ Unrecognised input.</strong> This doesn't look like a Google Maps embed
                iframe or a Maps URL. Follow the steps above to copy the embed code from desktop Google Maps.
              </div>
            )}

            {/* Live preview — only when the paste is the trusted
                /maps/embed?pb= iframe form. That's the one URL with a
                permissive X-Frame-Options, so we can render it with
                confidence. Other shapes get a message instead of a
                potentially blank frame. */}
            {mapsKind === 'iframe' && mapsPreviewSrc && (
              <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                <iframe
                  src={mapsPreviewSrc}
                  width="100%" height="240"
                  style={{ border: 0, display: 'block' }}
                  loading="lazy" allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Map preview"
                />
              </div>
            )}
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

      {/* Booking QR */}
      <div style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Your Booking QR Card</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
          Download a branded card with your name, clinic, and booking QR — patients scan to land directly on your booking page. <strong>Print for reception, share on WhatsApp, or post on social.</strong>
        </p>
        {!slug ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Your QR will appear once your profile is set up.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', flexShrink: 0 }}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Booking QR" width={200} height={200}
                  style={{ display: 'block', width: 200, height: 200 }} />
              ) : (
                <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  Generating…
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Booking link
              </div>
              <a href={`${siteBase}/book/${slug}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-block', fontSize: 13, color: 'var(--blue)', fontWeight: 600, marginBottom: 14, wordBreak: 'break-all' }}>
                {`${siteBase}/book/${slug}`}
              </a>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={downloadCard} disabled={!qrDataUrl || !form.name || !form.clinic_name}
                  style={{ padding: '10px 18px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: (qrDataUrl && form.name && form.clinic_name) ? 'pointer' : 'not-allowed', opacity: (qrDataUrl && form.name && form.clinic_name) ? 1 : 0.6, fontFamily: 'var(--font-body)' }}>
                  ⬇ Download Card
                </button>
                <button type="button" onClick={shareOnWhatsApp}
                  style={{ padding: '10px 18px', minHeight: 44, background: '#25D366', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  💬 Share on WhatsApp
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.6 }}>
                Tip: laminate the printout. Patients scan from across the waiting area — no app install needed.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Save button bottom — on mobile this lifts off the page into a
          sticky footer bar so the dentist can save without scrolling back. */}
      <div className="profile-save-bar" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingBottom: 40 }}>
        <button
          onClick={handleSave} disabled={saving}
          className="profile-save-btn"
          style={{ padding: '13px 32px', minHeight: 48, background: saved ? '#00A878' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.3s' }}
        >{saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Changes'}</button>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .profile-grid-2 { grid-template-columns: 1fr !important; }
          /* Reserve space for the sticky save bar (~80px) on top of the
             dashboard bottom nav (64px) so the QR-card section isn't trapped
             under the bar at the end of the page. */
          .profile-edit-root { padding-bottom: 80px; }
          .profile-save-bar {
            position: fixed !important;
            left: 0; right: 0;
            bottom: 64px;
            background: #fff;
            border-top: 1px solid var(--border);
            padding: 10px 16px env(safe-area-inset-bottom, 10px) !important;
            margin: 0;
            z-index: 80;
            box-shadow: 0 -4px 12px rgba(0,0,0,0.06);
          }
          .profile-save-btn { width: 100%; }
        }
      `}</style>
    </div>
  )
}
