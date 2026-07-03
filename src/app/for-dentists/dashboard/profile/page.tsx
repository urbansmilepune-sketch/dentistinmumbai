'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getCityBySlug } from '@/config/cities'
import { buildMapsIframe, classifyMapsInput, extractMapsIframeSrc, hasValidEmbedPb } from '@/lib/maps'
import PhotoCropModal from './PhotoCropModal'

const HOURS_DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

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

  // Profile-photo upload + crop. The dentist picks a file → we open the crop
  // modal on a local object URL → on Save we render the 1:1 crop to a Blob and
  // POST it to /api/cloudinary/upload (type=profile), which resizes to 400×400
  // and writes dentists.profile_photo server-side.
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [photoSaving, setPhotoSaving] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Clinic branding — logo + digital signature. Each uploads directly to its
  // own API route (which resizes via Cloudinary and writes the dentists row)
  // and reflects the returned URL back into local state. "Remove" clears the
  // column with an RLS-aware update, same write path as handleSave below.
  const [clinicLogo, setClinicLogo] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [signatureBusy, setSignatureBusy] = useState(false)
  const [brandingError, setBrandingError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const signatureInputRef = useRef<HTMLInputElement>(null)
  // Read-only mirror of dentists.working_hours so the profile page can show
  // a clear weekday summary. The dedicated editor at /dashboard/hours owns
  // the write path — we never UPDATE this column from profile/page.tsx.
  const [workingHours, setWorkingHours] = useState<Record<string, any> | null>(null)

  const [form, setForm] = useState({
    name: '', clinic_name: '', qualifications: '', degree: '', experience_years: '',
    bio: '', phone: '', whatsapp: '', website: '', address: '',
    consultation_fee: '', mci_number: '', emi_available: false,
    languages: [] as string[], specialties: [] as string[],
    maps_embed: '',
    // Convenience-only field (not a DB column): if filled on save, the server
    // turns it into a place-name search embed and writes it into maps_embed.
    // Starts empty each load — we persist the resulting iframe, not the name.
    google_maps_name: '',
    why_choose_us: [] as string[],
  })
  // Cap matches the brief ("add up to 5 points"). Enforced in the UI and
  // re-checked on save below so a stale tab can't sneak a 6th row in.
  const WHY_CHOOSE_LIMIT = 5

  // Mobile-verify section state. otpStage drives the section's three
  // visible states: 'idle' (just the Send OTP button), 'sent' (input +
  // Verify button visible), and 'verified' (success badge, controls
  // hidden). The phone-edit-resets-verified UX is handled below in the
  // input onChange.
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [otpStage, setOtpStage] = useState<'idle' | 'sent'>('idle')
  const [otpInput, setOtpInput] = useState('')
  const [otpBusy, setOtpBusy] = useState(false)
  const [otpMessage, setOtpMessage] = useState('')
  const [otpError, setOtpError] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }

      const { data: dentist } = await supabase
        .from('dentists')
        .select('id, slug, name, clinic_name, qualifications, degree, experience_years, bio, phone, whatsapp, website, address, consultation_fee, mci_number, emi_available, languages, specialties, maps_embed, why_choose_us, city, working_hours, phone_verified, profile_photo, clinic_logo_url, signature_url')
        .eq('email', user.email)
        .single()

      if (dentist) {
        setDentistId(dentist.id)
        setSlug(dentist.slug || '')
        setSiteBase(`https://${getCityBySlug((dentist as any).city).domain}`)
        setWorkingHours((dentist as any).working_hours || null)
        setPhoneVerified(!!(dentist as any).phone_verified)
        setProfilePhoto((dentist as any).profile_photo || null)
        setClinicLogo((dentist as any).clinic_logo_url || null)
        setSignature((dentist as any).signature_url || null)
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
          google_maps_name: '',
          why_choose_us: (dentist as any).why_choose_us || [],
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

  async function sendPhoneOtp() {
    setOtpBusy(true); setOtpError(''); setOtpMessage('')
    try {
      const res = await fetch('/api/dentist/phone-otp/send', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        if (data.already_verified) {
          setPhoneVerified(true)
          setOtpStage('idle')
          setOtpMessage('')
        } else {
          setOtpStage('sent')
          setOtpInput('')
          setOtpMessage(`Code sent to ${form.phone}. It expires in 10 minutes.`)
        }
      } else {
        setOtpError(data.error || 'Could not send OTP.')
      }
    } catch {
      setOtpError('Network error. Please try again.')
    }
    setOtpBusy(false)
  }

  async function verifyPhoneOtp() {
    if (!/^\d{6}$/.test(otpInput)) { setOtpError('Enter the 6-digit code.'); return }
    setOtpBusy(true); setOtpError(''); setOtpMessage('')
    try {
      const res = await fetch('/api/dentist/phone-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpInput }),
      })
      const data = await res.json()
      if (data.success) {
        setPhoneVerified(true)
        setOtpStage('idle')
        setOtpInput('')
        setOtpMessage('Mobile verified ✓')
      } else {
        setOtpError(data.error || 'Verification failed.')
      }
    } catch {
      setOtpError('Network error. Please try again.')
    }
    setOtpBusy(false)
  }

  // File picked → validate and open the crop modal on a local object URL.
  function onSelectPhoto(file: File) {
    setPhotoError('')
    if (!file.type.startsWith('image/')) { setPhotoError('Please choose an image file.'); return }
    if (file.size > 10 * 1024 * 1024) { setPhotoError('Image too large. Max 10MB.'); return }
    // Revoke any previous object URL before replacing it so we don't leak.
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(URL.createObjectURL(file))
  }

  function closeCropModal() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  // Modal handed us the cropped 1:1 Blob → upload it as the profile photo.
  // The upload route resizes to 400×400 and writes dentists.profile_photo,
  // so we just reflect the returned URL back into local state on success.
  async function onCropSave(blob: Blob) {
    setPhotoSaving(true); setPhotoError('')
    try {
      const formData = new FormData()
      formData.append('file', new File([blob], 'profile.jpg', { type: 'image/jpeg' }))
      formData.append('type', 'profile')
      const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!data.success) { setPhotoError(data.error || 'Upload failed.'); setPhotoSaving(false); return }
      setProfilePhoto(data.url)
      closeCropModal()
    } catch {
      setPhotoError('Upload failed. Please try again.')
    }
    setPhotoSaving(false)
  }

  // Branding uploads — the route validates type/size server-side too, but we
  // pre-check here so the dentist gets an instant message instead of a
  // round-trip. On success we reflect the returned Cloudinary URL into state.
  async function uploadBranding(file: File, kind: 'logo' | 'signature') {
    setBrandingError('')
    const maxMb = kind === 'logo' ? 2 : 1
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setBrandingError('Please choose a JPEG, PNG or WebP image.'); return
    }
    if (file.size > maxMb * 1024 * 1024) {
      setBrandingError(`Image too large. Max ${maxMb}MB.`); return
    }
    const setBusy = kind === 'logo' ? setLogoBusy : setSignatureBusy
    setBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/dentist/upload-${kind}`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || !data.url) { setBrandingError(data.error || 'Upload failed.'); setBusy(false); return }
      if (kind === 'logo') setClinicLogo(data.url)
      else setSignature(data.url)
    } catch {
      setBrandingError('Upload failed. Please try again.')
    }
    setBusy(false)
  }

  // Remove clears the column with the same RLS-aware update the profile save
  // uses — .select('id') makes a denied write observable.
  async function removeBranding(kind: 'logo' | 'signature') {
    if (!dentistId) return
    setBrandingError('')
    const setBusy = kind === 'logo' ? setLogoBusy : setSignatureBusy
    setBusy(true)
    const column = kind === 'logo' ? 'clinic_logo_url' : 'signature_url'
    const supabase = createClient()
    const { data, error } = await supabase
      .from('dentists')
      .update({ [column]: null })
      .eq('id', dentistId)
      .select('id')
    setBusy(false)
    if (error || !data || data.length === 0) {
      setBrandingError('Could not remove the image. Please try again.'); return
    }
    if (kind === 'logo') setClinicLogo(null)
    else setSignature(null)
  }

  async function handleSave() {
    if (!form.name || !form.clinic_name) { setError('Name and Clinic Name are required'); return }
    if (!dentistId) { setError('No dentist profile is linked to your account. Contact support.'); return }
    setSaving(true); setError(''); setSaved(false)

    // Normalise the maps field server-side: a pasted share link (maps.app.goo.gl)
    // can only be expanded on the server — the browser can't follow its redirect
    // and Google blocks framing the target. A full <iframe> is trusted as-is.
    // Reflect the normalised value back into the form so the dentist sees what
    // actually landed in the DB.
    let normalisedMapsEmbed = ''
    if (form.maps_embed.trim() || form.google_maps_name.trim()) {
      try {
        // A pasted link (input) wins; otherwise the typed clinic name is used.
        const res = await fetch('/api/dentist/maps-embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: form.maps_embed, name: form.google_maps_name, clinic_name: form.clinic_name }),
        })
        const data = await res.json().catch(() => ({} as { maps_embed?: string; error?: string }))
        if (!res.ok) { setSaving(false); setError(data.error || 'Could not process the map link.'); return }
        normalisedMapsEmbed = data.maps_embed || ''
        if (normalisedMapsEmbed !== form.maps_embed) setForm(f => ({ ...f, maps_embed: normalisedMapsEmbed }))
      } catch {
        setSaving(false); setError('Could not reach the map service. Please try again.'); return
      }
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
        // Drop empty/whitespace rows so the public profile doesn't render
        // an orphaned blank bullet, and cap to WHY_CHOOSE_LIMIT defensively
        // in case the dentist somehow got past the dashboard's add guard.
        why_choose_us: form.why_choose_us
          .map(p => p.trim())
          .filter(p => p.length > 0)
          .slice(0, WHY_CHOOSE_LIMIT),
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
  // A trusted embed whose `pb` blob is malformed/truncated renders Google's
  // raw "Invalid 'pb' parameter" error inside the iframe. We can't read that
  // cross-origin, so we detect it here and swap the frame for a friendly hint.
  const mapsPreviewOk = !!mapsPreviewSrc && hasValidEmbedPb(mapsPreviewSrc)
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

      {/* Profile Photo — crop-to-square before upload so every dentist's
          headshot lands face-centred and consistently 1:1 on listing cards. */}
      <div style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Profile Photo</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
          A clear, face-centred headshot. You'll crop it to a square before it's saved — this is the photo patients see on your listing card.
        </p>
        {photoError && <div style={{ padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B', marginBottom: 14 }}>{photoError}</div>}
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--border)', flexShrink: 0, background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {profilePhoto
              ? <img src={profilePhoto} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
              : <span style={{ fontSize: 36 }} aria-hidden="true">🦷</span>}
          </div>
          <div>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              style={{ padding: '11px 22px', minHeight: 44, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >{profilePhoto ? 'Change Photo' : 'Upload Photo'}</button>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>JPG, PNG, WebP · Max 10MB</div>
          </div>
        </div>
        <input
          ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) onSelectPhoto(file)
            // Reset so picking the same file again still fires onChange.
            e.target.value = ''
          }}
        />
      </div>

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
            <label style={labelStyle}>State Dental Council Registration No. (required for verified badge)</label>
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
          {/* Zero-friction path: type the clinic name and we build the map
              server-side. Hidden once a full <iframe> is already saved — then
              the existing map/preview below is authoritative and this would
              only confuse. */}
          {mapsKind !== 'iframe' && (
            <div>
              <label style={labelStyle}>Clinic name on Google Maps</label>
              <input
                value={form.google_maps_name}
                onChange={e => setForm(f => ({ ...f, google_maps_name: e.target.value }))}
                placeholder="e.g. Dr. Sweety's Urban Smile Dental Clinic"
                style={inputStyle}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Type your clinic name exactly as it appears on Google Maps. We'll show patients a
                map automatically.
              </div>
            </div>
          )}
          <div>
            <label style={labelStyle}>Google Maps Link</label>
            <textarea
              value={form.maps_embed}
              onChange={e => setForm(f => ({ ...f, maps_embed: e.target.value }))}
              placeholder='Paste your Google Maps link (e.g. https://maps.app.goo.gl/...)'
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            />

            {/* How-to — the mobile share-link flow is now the primary path;
                the share link is expanded to an embed server-side on save.
                A full <iframe> embed is still accepted for desktop users. */}
            <div style={{ marginTop: 10, padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                How to get your Google Maps link
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Open Google Maps on your phone → search your clinic → tap <strong>Share</strong> →
                <strong> Copy link</strong> → paste here. You can also paste a full <code>&lt;iframe&gt;</code>{' '}
                embed code if you prefer.
              </div>
            </div>

            {/* Short link (maps.app.goo.gl / share.google / goo.gl) is now the
                recommended input — it's expanded to a real embed server-side
                on save, so we show a neutral confirmation rather than a warning. */}
            {mapsKind === 'shortLink' && (
              <div style={{ marginTop: 10, padding: '12px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>
                <strong>ℹ Looks good.</strong> We'll turn this share link into a map on your public
                profile when you hit <strong>Save</strong>.
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
            {mapsKind === 'iframe' && mapsPreviewSrc && mapsPreviewOk && (
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

            {/* Malformed embed — the iframe src is the trusted /maps/embed
                form but its `pb` blob is missing/truncated, so Google would
                render its raw "Invalid 'pb' parameter" error. Show a friendly
                hint instead. */}
            {mapsKind === 'iframe' && mapsPreviewSrc && !mapsPreviewOk && (
              <div style={{ marginTop: 10, padding: '12px 14px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, fontSize: 13, color: '#92400E', lineHeight: 1.6 }}>
                ⚠️ Map preview unavailable. Please update your embed code — get a
                fresh one from Google Maps → Share → Embed a map.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Verify Mobile — texts a 6-digit OTP via MSG91 to dentists.phone
          and flips dentists.phone_verified on a match. The DB trigger
          dentists_reset_phone_verified clears the flag any time the
          phone is edited, so the badge stays honest without UI work. */}
      <div style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Verify Mobile</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
          Confirm you own this number so patients can trust the contact details on your listing.
          {phoneVerified ? '' : ' Re-verify after changing the phone above.'}
        </p>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
          padding: '12px 14px', background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 10, marginBottom: 14,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Current phone
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {form.phone || '— not set —'}
            </div>
          </div>
          {phoneVerified && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 999,
              background: '#DCFCE7', color: '#166534',
              border: '1px solid #BBF7D0',
              fontSize: 13, fontWeight: 700,
            }}>✓ Verified</span>
          )}
        </div>

        {!phoneVerified && (
          <>
            {otpStage === 'idle' && (
              <button
                type="button"
                onClick={sendPhoneOtp}
                disabled={otpBusy || !form.phone}
                style={{
                  padding: '11px 22px', minHeight: 44,
                  background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10,
                  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14,
                  cursor: (otpBusy || !form.phone) ? 'not-allowed' : 'pointer',
                  opacity: (otpBusy || !form.phone) ? 0.6 : 1,
                }}
              >{otpBusy ? 'Sending…' : 'Send OTP'}</button>
            )}

            {otpStage === 'sent' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="profile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <label style={labelStyle}>6-digit code</label>
                    <input
                      value={otpInput}
                      onChange={e => { setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError('') }}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      style={inputStyle}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={verifyPhoneOtp}
                    disabled={otpBusy || otpInput.length !== 6}
                    style={{
                      padding: '11px 22px', minHeight: 44,
                      background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10,
                      fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14,
                      cursor: (otpBusy || otpInput.length !== 6) ? 'not-allowed' : 'pointer',
                      opacity: (otpBusy || otpInput.length !== 6) ? 0.6 : 1,
                    }}
                  >{otpBusy ? 'Verifying…' : 'Verify'}</button>
                </div>
                <button
                  type="button"
                  onClick={sendPhoneOtp}
                  disabled={otpBusy}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'transparent', border: 'none', padding: 0,
                    color: 'var(--blue)', fontSize: 12, fontWeight: 600,
                    cursor: otpBusy ? 'not-allowed' : 'pointer',
                  }}
                >Resend code</button>
              </div>
            )}
          </>
        )}

        {otpMessage && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
            {otpMessage}
          </div>
        )}
        {otpError && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B' }}>
            ⚠️ {otpError}
          </div>
        )}
      </div>

      {/* Working hours summary — read-only mirror of dentists.working_hours.
          The dedicated editor at /dashboard/hours owns the write path; this
          block is here so the profile page makes it obvious which days the
          clinic is open and what the patient-facing booking grid will use. */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>Clinic hours on each day</h2>
          <Link href="/for-dentists/dashboard/hours"
            style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none', padding: '6px 12px', background: 'var(--blue-light)', borderRadius: 8 }}>
            ✎ Edit hours
          </Link>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
          These are the hours patients see on your public profile and the booking-page time-slot grid. Closed days show no slots.
        </p>
        {workingHours ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {HOURS_DAYS.map(({ key, label }, idx) => {
              const h = workingHours[key]
              const open = h?.is_open
              return (
                <div key={key} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', fontSize: 13,
                  borderBottom: idx < HOURS_DAYS.length - 1 ? '1px solid var(--border)' : 'none',
                  background: open ? '#fff' : 'var(--bg)',
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: open ? 'var(--text)' : '#EF4444' }}>
                    {open
                      ? `${h?.open_time || '—'} – ${h?.close_time || '—'}${h?.has_break ? ` (Break ${h.break_start}–${h.break_end})` : ''}`
                      : 'Closed'}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: '14px 16px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, color: '#92400E', fontSize: 13, lineHeight: 1.5 }}>
            You haven't set your clinic hours yet. The booking page will default to <strong>9 AM – 8 PM, every day</strong> until you do.{' '}
            <Link href="/for-dentists/dashboard/hours" style={{ color: '#92400E', fontWeight: 700, textDecoration: 'underline' }}>Set hours →</Link>
          </div>
        )}
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

      {/* Why Choose Me — dentist-authored trust bullets that render on the
          public profile under "Why Choose Dr. X?". Add/remove buttons keep
          the list explicitly editable (no comma splitting — a dentist might
          legitimately type "EMI, no questions asked"); the limit is enforced
          here AND on save so a stale tab can't sneak past it. */}
      <div style={sectionStyle}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Why should patients choose you? (add up to {WHY_CHOOSE_LIMIT} points)</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
          Each point becomes a green-tick bullet on your public profile. Examples:
          <em style={{ color: 'var(--text-secondary)' }}> Pain-free treatments · 15+ years experience · Sunday appointments · EMI available · Latest equipment</em>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {form.why_choose_us.map((point, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#DCFCE7', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>✓</span>
              <input
                value={point}
                onChange={e => setForm(f => {
                  const next = [...f.why_choose_us]
                  next[idx] = e.target.value
                  return { ...f, why_choose_us: next }
                })}
                placeholder={['Pain-free treatments', '15+ years experience', 'Sunday appointments', 'EMI available', 'Latest equipment'][idx] || 'Add a reason patients should pick you'}
                maxLength={120}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, why_choose_us: f.why_choose_us.filter((_, i) => i !== idx) }))}
                aria-label={`Remove point ${idx + 1}`}
                style={{ flexShrink: 0, padding: '0 12px', minHeight: 42, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {form.why_choose_us.length < WHY_CHOOSE_LIMIT ? (
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, why_choose_us: [...f.why_choose_us, ''] }))}
            style={{ marginTop: form.why_choose_us.length > 0 ? 14 : 0, padding: '10px 18px', minHeight: 42, background: '#fff', color: 'var(--blue)', border: '1.5px dashed var(--blue)', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
          >
            + Add a point ({form.why_choose_us.length} / {WHY_CHOOSE_LIMIT})
          </button>
        ) : (
          <p style={{ marginTop: 14, fontSize: 12, color: 'var(--muted)' }}>
            You've added the maximum of {WHY_CHOOSE_LIMIT} points. Remove one to add another.
          </p>
        )}
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
          <>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
            Your Clinic QR Code — share this with patients to book appointments
          </div>
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
          </>
        )}
      </div>

      {/* Clinic Branding — logo + signature used on invoices and
          prescriptions. Uploads go straight to their own API routes (which
          resize via Cloudinary and write the dentists row); "Remove" clears
          the column. Teal-underlined heading per the brand spec. */}
      <div style={sectionStyle}>
        <h2 style={{
          fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17, marginBottom: 4,
          display: 'inline-block', paddingBottom: 6, borderBottom: '3px solid #0FB5AE',
        }}>Clinic Branding</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 18px' }}>
          Add your clinic logo and signature once — they're printed automatically on every invoice and prescription you generate.
        </p>
        {brandingError && <div style={{ padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 13, color: '#991B1B', marginBottom: 14 }}>{brandingError}</div>}

        <div className="profile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Card 1 — Clinic Logo */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Clinic Logo</h3>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {clinicLogo
                  ? <img src={clinicLogo} alt="Clinic logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: 30 }} aria-hidden="true">🏥</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoBusy}
                  style={{ padding: '9px 18px', minHeight: 40, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, cursor: logoBusy ? 'not-allowed' : 'pointer', opacity: logoBusy ? 0.6 : 1 }}
                >{logoBusy ? 'Uploading…' : clinicLogo ? 'Replace Logo' : 'Upload Logo'}</button>
                {clinicLogo && !logoBusy && (
                  <button
                    type="button"
                    onClick={() => removeBranding('logo')}
                    style={{ padding: 0, background: 'transparent', border: 'none', color: '#991B1B', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)' }}
                  >Remove</button>
                )}
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14, lineHeight: 1.5 }}>
              Appears on invoices and prescriptions. Recommended: square image, min 200×200px, PNG or JPG.
            </p>
            <input
              ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadBranding(f, 'logo'); e.target.value = '' }}
            />
          </div>

          {/* Card 2 — Digital Signature */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Digital Signature</h3>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 200, height: 60, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {signature
                  ? <img src={signature} alt="Signature" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} />
                  : <span style={{ fontSize: 12, color: 'var(--muted)' }}>No signature uploaded</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => signatureInputRef.current?.click()}
                  disabled={signatureBusy}
                  style={{ padding: '9px 18px', minHeight: 40, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13, cursor: signatureBusy ? 'not-allowed' : 'pointer', opacity: signatureBusy ? 0.6 : 1 }}
                >{signatureBusy ? 'Uploading…' : signature ? 'Replace Signature' : 'Upload Signature'}</button>
                {signature && !signatureBusy && (
                  <button
                    type="button"
                    onClick={() => removeBranding('signature')}
                    style={{ padding: 0, background: 'transparent', border: 'none', color: '#991B1B', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)' }}
                  >Remove</button>
                )}
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14, lineHeight: 1.5 }}>
              Appears at the bottom of prescriptions. Sign on white paper, photograph or scan, upload.
            </p>
            <input
              ref={signatureInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadBranding(f, 'signature'); e.target.value = '' }}
            />
          </div>
        </div>
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

      {cropSrc && (
        <PhotoCropModal
          imageSrc={cropSrc}
          saving={photoSaving}
          onCancel={closeCropModal}
          onSave={onCropSave}
        />
      )}
    </div>
  )
}
