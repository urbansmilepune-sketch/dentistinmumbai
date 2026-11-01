'use client'

// Clinic tablet check-in. Reception opens this on the clinic tablet (signed in
// to the dashboard) and hands it to the patient. Three tap-first steps, then a
// locked "hand it back" screen. Covers the dashboard chrome with a fixed
// full-screen layer so the patient never sees the clinic's other data.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { NAVY, TEAL, TEAL_DARK, BRAND_GRADIENT } from '@/app/dentist/[slug]/profileTheme'
import { ALLERGIES, AREAS, CONCERNS, CONDITIONS, SINCE, TRIGGERS, type Lang } from '@/lib/visitFlow'

const TEAL_TINT = '#CCFBF1'
const LINE = '#E2E8F0'
const MUTED = '#64748B'

const T = {
  start_title: { en: 'Welcome', hi: 'स्वागत है', mr: 'स्वागत आहे' },
  start_sub: { en: 'Please fill a few details for the doctor. It takes about 2 minutes.', hi: 'डॉक्टर के लिए कुछ जानकारी भरें। लगभग 2 मिनट लगेंगे।', mr: 'डॉक्टरांसाठी थोडी माहिती भरा. सुमारे 2 मिनिटे लागतील.' },
  begin: { en: 'Start', hi: 'शुरू करें', mr: 'सुरू करा' },
  step: { en: 'Step', hi: 'चरण', mr: 'पायरी' },
  of: { en: 'of', hi: 'में से', mr: 'पैकी' },
  about_you: { en: 'Tell us about you', hi: 'अपने बारे में बताएं', mr: 'तुमच्याबद्दल सांगा' },
  mobile: { en: 'Mobile number', hi: 'मोबाइल नंबर', mr: 'मोबाईल नंबर' },
  name: { en: 'Full name', hi: 'पूरा नाम', mr: 'पूर्ण नाव' },
  age: { en: 'Age', hi: 'उम्र', mr: 'वय' },
  gender: { en: 'Gender', hi: 'लिंग', mr: 'लिंग' },
  male: { en: 'Male', hi: 'पुरुष', mr: 'पुरुष' },
  female: { en: 'Female', hi: 'महिला', mr: 'स्त्री' },
  other: { en: 'Other', hi: 'अन्य', mr: 'इतर' },
  next: { en: 'Next', hi: 'आगे', mr: 'पुढे' },
  back: { en: 'Back', hi: 'पीछे', mr: 'मागे' },
  welcome_back: { en: 'Welcome back', hi: 'फिर से स्वागत है', mr: 'पुन्हा स्वागत आहे' },
  we_have: { en: 'We have your details.', hi: 'आपकी जानकारी हमारे पास है।', mr: 'तुमची माहिती आमच्याकडे आहे.' },
  problem: { en: 'What brings you in today?', hi: 'आज आप किस लिए आए हैं?', mr: 'आज कशासाठी आला आहात?' },
  where: { en: 'Where is the problem?', hi: 'तकलीफ़ कहाँ है?', mr: 'त्रास कुठे आहे?' },
  since: { en: 'Since when?', hi: 'कब से?', mr: 'केव्हापासून?' },
  worse: { en: 'It hurts more with', hi: 'इससे ज़्यादा दर्द होता है', mr: 'यामुळे जास्त दुखते' },
  tap_all: { en: '(tap all that apply)', hi: '(जो लागू हो सब चुनें)', mr: '(लागू असलेले सर्व निवडा)' },
  health: { en: 'Anything the doctor must know?', hi: 'डॉक्टर को क्या पता होना चाहिए?', mr: 'डॉक्टरांना काय माहीत असावे?' },
  allergic: { en: 'Allergic to any medicine?', hi: 'किसी दवा से एलर्जी?', mr: 'कोणत्या औषधाची ऍलर्जी?' },
  any_of: { en: 'Any of these?', hi: 'इनमें से कुछ?', mr: 'यापैकी काही?' },
  none: { en: 'None', hi: 'कोई नहीं', mr: 'काहीही नाही' },
  meds_now: { en: 'Taking any medicines now?', hi: 'अभी कोई दवा ले रहे हैं?', mr: 'सध्या कोणते औषध घेता?' },
  optional: { en: '(optional)', hi: '(वैकल्पिक)', mr: '(ऐच्छिक)' },
  on_file: { en: 'On file', hi: 'पहले से दर्ज', mr: 'आधी नोंदवलेले' },
  no_change: { en: 'Nothing has changed', hi: 'कुछ नहीं बदला', mr: 'काहीही बदललेले नाही' },
  consent: { en: 'I agree that the clinic can keep my health details for my treatment and send me updates on WhatsApp.', hi: 'मैं सहमत हूँ कि क्लिनिक मेरे इलाज के लिए मेरी जानकारी रख सकता है और WhatsApp पर अपडेट भेज सकता है।', mr: 'माझ्या उपचारासाठी क्लिनिक माझी माहिती ठेवू शकते आणि WhatsApp वर अपडेट पाठवू शकते, याला माझी संमती आहे.' },
  done: { en: 'Done', hi: 'हो गया', mr: 'झाले' },
  thanks: { en: 'Thank you', hi: 'धन्यवाद', mr: 'धन्यवाद' },
  seat: { en: 'The doctor has your details. Please take a seat, you will be called shortly.', hi: 'डॉक्टर के पास आपकी जानकारी है। कृपया बैठिए, आपको जल्द बुलाया जाएगा।', mr: 'डॉक्टरांकडे तुमची माहिती आहे. कृपया बसा, तुम्हाला लवकरच बोलावले जाईल.' },
  hand_back: { en: 'Please hand the tablet back to reception', hi: 'कृपया टैबलेट रिसेप्शन को वापस दें', mr: 'कृपया टॅबलेट रिसेप्शनला परत द्या' },
  need_phone: { en: 'Please enter a 10-digit mobile number', hi: 'कृपया 10 अंकों का मोबाइल नंबर डालें', mr: 'कृपया 10 अंकी मोबाईल नंबर टाका' },
  need_name: { en: 'Please enter your name', hi: 'कृपया अपना नाम डालें', mr: 'कृपया तुमचे नाव टाका' },
  need_consent: { en: 'Please tick the box to continue', hi: 'आगे बढ़ने के लिए बॉक्स पर टिक करें', mr: 'पुढे जाण्यासाठी बॉक्सवर टिक करा' },
  saving: { en: 'Saving…', hi: 'सेव हो रहा है…', mr: 'सेव्ह होत आहे…' },
} as const

type Key = keyof typeof T
type Step = 'start' | 'about' | 'problem' | 'health' | 'done'

type Existing = { id: string; name: string; age: number | null; gender: string | null; allergies: string | null; medical_history: string | null; current_medications: string | null }

function splitKnown(text: string | null | undefined, ids: string[]): { picked: string[]; rest: string } {
  const raw = String(text || '')
  const picked = ids.filter(id => raw.toLowerCase().includes(id.toLowerCase()))
  let rest = raw
  for (const id of picked) rest = rest.replace(new RegExp(id.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'ig'), '')
  rest = rest.split(/[,;]/).map(s => s.trim()).filter(Boolean).join(', ')
  return { picked, rest }
}

export default function TabletCheckInPage() {
  const router = useRouter()
  const [lang, setLang] = useState<Lang>('en')
  const t = (k: Key) => T[k][lang]
  const [dentistId, setDentistId] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [ready, setReady] = useState(false)

  const [step, setStep] = useState<Step>('start')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [existing, setExisting] = useState<Existing | null>(null)
  const [concerns, setConcerns] = useState<string[]>([])
  const [area, setArea] = useState<string | null>(null)
  const [since, setSince] = useState<string | null>(null)
  const [triggers, setTriggers] = useState<string[]>([])
  const [allergies, setAllergies] = useState<string[]>([])
  const [allergyNone, setAllergyNone] = useState(false)
  const [allergyOther, setAllergyOther] = useState('')
  const [conditions, setConditions] = useState<string[]>([])
  const [conditionNone, setConditionNone] = useState(false)
  const [conditionOther, setConditionOther] = useState('')
  const [meds, setMeds] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [doneName, setDoneName] = useState('')

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/for-dentists/login'); return }
      const d = await resolveCurrentDentist<{ id: string; name: string; clinic_name: string | null }>(supabase, 'id, name, clinic_name')
      if (!d) return
      setDentistId(d.id)
      setClinicName(d.clinic_name || d.name || '')
      setDoctorName(d.name || '')
      setReady(true)
    })()
  }, [router])

  function reset() {
    setStep('start'); setPhone(''); setName(''); setAge(''); setGender(''); setExisting(null)
    setConcerns([]); setArea(null); setSince(null); setTriggers([])
    setAllergies([]); setAllergyNone(false); setAllergyOther('')
    setConditions([]); setConditionNone(false); setConditionOther('')
    setMeds(''); setConsent(false); setError(null); setDoneName(''); setLang('en')
  }

  async function lookupPhone() {
    setError(null)
    const digits = phone.replace(/\D/g, '').slice(-10)
    if (digits.length !== 10) { setError(t('need_phone')); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('patients')
      .select('id, name, age, gender, allergies, medical_history, current_medications')
      .eq('dentist_id', dentistId)
      .ilike('phone', `%${digits}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      setExisting(data as Existing)
      const a = splitKnown(data.allergies, ALLERGIES.map(x => x.id))
      setAllergies(a.picked); setAllergyOther(a.rest)
      const c = splitKnown(data.medical_history, CONDITIONS.map(x => x.id))
      setConditions(c.picked); setConditionOther(c.rest)
      setMeds(data.current_medications || '')
      setStep('problem')
    } else {
      setExisting(null)
    }
  }

  function goProblem() {
    setError(null)
    const digits = phone.replace(/\D/g, '').slice(-10)
    if (digits.length !== 10) { setError(t('need_phone')); return }
    if (!existing && !name.trim()) { setError(t('need_name')); return }
    setStep('problem')
  }

  async function save(keepHealth: boolean) {
    setError(null)
    if (!consent && !existing) { setError(t('need_consent')); return }
    setSaving(true)
    try {
      const supabase = createClient()
      const allergyText = allergyNone ? null : [...allergies, allergyOther.trim()].filter(Boolean).join(', ') || null
      const historyText = conditionNone ? null : [...conditions, conditionOther.trim()].filter(Boolean).join(', ') || null
      const medsText = meds.trim() || null
      let patientId = existing?.id || ''
      if (existing) {
        const patch: Record<string, unknown> = {}
        if (!keepHealth) { patch.allergies = allergyText; patch.medical_history = historyText; patch.current_medications = medsText }
        if (!existing.age && age) patch.age = parseInt(age, 10) || null
        if (!existing.gender && gender) patch.gender = gender
        if (Object.keys(patch).length) {
          const { error: upErr } = await supabase.from('patients').update(patch).eq('id', existing.id)
          if (upErr) throw new Error(upErr.message)
        }
      } else {
        const { data: created, error: insErr } = await supabase.from('patients').insert({
          dentist_id: dentistId,
          name: name.trim(),
          phone: phone.replace(/\D/g, '').slice(-10),
          age: age ? parseInt(age, 10) || null : null,
          gender: gender || null,
          allergies: allergyText,
          medical_history: historyText,
          current_medications: medsText,
        }).select('id').single()
        if (insErr) throw new Error(insErr.message)
        patientId = created.id
      }
      const { error: inErr } = await supabase.from('patient_intakes').insert({
        dentist_id: dentistId,
        patient_id: patientId,
        complaint: { concerns, area, since, triggers, lang },
      })
      if (inErr) throw new Error(`Patient saved, but the waiting list is not set up yet (${inErr.message}). Please tell the clinic.`)
      setDoneName((existing?.name || name).trim().split(/\s+/)[0] || '')
      setStep('done')
    } catch (e: any) {
      setError(e?.message || 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ---- UI pieces -----------------------------------------------------------

  const chip = (on: boolean, label: string, onClick: () => void, dark = false) => (
    <button type="button" onClick={onClick} style={{
      border: `2px solid ${on ? (dark ? NAVY : TEAL) : LINE}`, background: on ? (dark ? NAVY : TEAL_TINT) : '#fff',
      color: on ? (dark ? '#fff' : TEAL_DARK) : NAVY, borderRadius: 999, padding: '12px 20px',
      fontSize: 17, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', minHeight: 50,
    }}>{label}</button>
  )
  const tile = (on: boolean, label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{
      border: `2px solid ${on ? TEAL : LINE}`, background: on ? TEAL_TINT : '#fff', color: on ? TEAL_DARK : NAVY,
      borderRadius: 16, padding: '18px 10px', fontSize: 17, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', minHeight: 72,
    }}>{label}</button>
  )
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  const label = (text: string, extra?: string) => (
    <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 10 }}>{text}{extra && <span style={{ fontWeight: 500, color: MUTED, fontSize: 14 }}> {extra}</span>}</div>
  )
  const input: React.CSSProperties = { width: '100%', border: `2px solid ${LINE}`, borderRadius: 14, padding: '14px 16px', fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-body)', color: NAVY, background: '#fff', boxSizing: 'border-box' }
  const bigBtn = (text: string, onClick: () => void, alt = false, disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      width: '100%', border: alt ? `2px solid ${LINE}` : 0, background: alt ? '#F8FAFC' : TEAL, color: alt ? NAVY : '#fff',
      borderRadius: 16, padding: '18px', fontSize: 19, fontWeight: 700, cursor: disabled ? 'wait' : 'pointer', fontFamily: 'var(--font-heading)', opacity: disabled ? 0.7 : 1,
    }}>{text}</button>
  )
  const progress = (n: number) => (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>{[1, 2, 3].map(i => <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= n ? TEAL : LINE }} />)}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('step')} {n} {t('of')} 3</div>
    </div>
  )
  const h = (text: string) => <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 800, margin: 0, color: NAVY }}>{text}</h1>
  const err = error && <div role="alert" style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 12, padding: '12px 16px', fontWeight: 600 }}>{error}</div>

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 24px', borderBottom: `1px solid ${LINE}`, background: '#fff', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: BRAND_GRADIENT, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{clinicName}</div>
          {doctorName && clinicName !== doctorName && <div style={{ fontSize: 13, color: MUTED }}>{doctorName}</div>}
        </div>
      </div>
      {step !== 'done' && (
        <div style={{ display: 'flex', gap: 6 }}>
          {([['en', 'English'], ['hi', 'हिंदी'], ['mr', 'मराठी']] as [Lang, string][]).map(([id, l]) => (
            <button key={id} type="button" onClick={() => setLang(id)} style={{
              border: `1px solid ${lang === id ? NAVY : LINE}`, background: lang === id ? NAVY : '#fff', color: lang === id ? '#fff' : MUTED,
              borderRadius: 10, padding: '8px 14px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>{l}</button>
          ))}
        </div>
      )}
    </div>
  )

  let body: React.ReactNode = null
  if (!ready) {
    body = <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>Loading…</div>
  } else if (step === 'start') {
    body = (
      <div style={{ display: 'grid', gap: 22, textAlign: 'center', paddingTop: 30 }}>
        {h(t('start_title'))}
        <p style={{ color: MUTED, fontSize: 18, margin: 0 }}>{t('start_sub')}</p>
        {bigBtn(t('begin'), () => setStep('about'))}
        <Link href="/for-dentists/dashboard/visit" style={{ color: MUTED, fontSize: 14, textDecoration: 'underline' }}>Clinic: exit tablet mode</Link>
      </div>
    )
  } else if (step === 'about') {
    body = (
      <div style={{ display: 'grid', gap: 22 }}>
        {progress(1)}
        {h(t('about_you'))}
        <div>
          {label(t('mobile'))}
          <input inputMode="numeric" autoComplete="off" value={phone} onChange={e => { setPhone(e.target.value); setExisting(null) }}
            onBlur={() => { if (phone.replace(/\D/g, '').length >= 10) lookupPhone() }} placeholder="98XXXXXXXX" style={input} />
        </div>
        <div>
          {label(t('name'))}
          <input autoComplete="off" value={name} onChange={e => setName(e.target.value)} style={input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 140px) 1fr', gap: 14 }}>
          <div>{label(t('age'))}<input inputMode="numeric" value={age} onChange={e => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} style={input} /></div>
          <div>{label(t('gender'))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {chip(gender === 'Male', t('male'), () => setGender('Male'))}
              {chip(gender === 'Female', t('female'), () => setGender('Female'))}
              {chip(gender === 'Other', t('other'), () => setGender('Other'))}
            </div>
          </div>
        </div>
        {err}
        {bigBtn(t('next'), goProblem)}
      </div>
    )
  } else if (step === 'problem') {
    body = (
      <div style={{ display: 'grid', gap: 22 }}>
        {existing && (
          <div style={{ background: '#DCFCE7', color: '#166534', borderRadius: 14, padding: '14px 18px', fontWeight: 600, fontSize: 17 }}>
            {t('welcome_back')}, {existing.name.split(/\s+/)[0]}! {t('we_have')}
          </div>
        )}
        {progress(2)}
        {h(t('problem'))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {CONCERNS.map(c => <div key={c.id} style={{ display: 'grid' }}>{tile(concerns.includes(c.id), c[lang], () => toggle(concerns, setConcerns, c.id))}</div>)}
        </div>
        {(concerns.includes('pain') || concerns.includes('broken') || concerns.includes('gums') || concerns.includes('missing')) && (
          <>
            <div>{label(t('where'))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 460 }}>
                {AREAS.map(a => <div key={a.id} style={{ display: 'grid' }}>{tile(area === a.id, a[lang], () => setArea(area === a.id ? null : a.id))}</div>)}
              </div>
            </div>
            <div>{label(t('since'))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SINCE.map(s => <span key={s.id}>{chip(since === s.id, s[lang], () => setSince(since === s.id ? null : s.id))}</span>)}</div>
            </div>
          </>
        )}
        {concerns.includes('pain') && (
          <div>{label(t('worse'), t('tap_all'))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{TRIGGERS.map(x => <span key={x.id}>{chip(triggers.includes(x.id), x[lang], () => toggle(triggers, setTriggers, x.id))}</span>)}</div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          {bigBtn(t('back'), () => setStep('about'), true)}
          {bigBtn(t('next'), () => { setError(null); setStep('health') })}
        </div>
      </div>
    )
  } else if (step === 'health') {
    const onFile = existing && (existing.allergies || existing.medical_history || existing.current_medications)
    body = (
      <div style={{ display: 'grid', gap: 22 }}>
        {progress(3)}
        {h(t('health'))}
        {onFile && (
          <div style={{ border: `2px solid ${TEAL}`, borderRadius: 16, padding: 16, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEAL_DARK, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('on_file')}</div>
            <div style={{ fontSize: 16 }}>{[existing!.allergies, existing!.medical_history, existing!.current_medications].filter(Boolean).join(' · ')}</div>
            {bigBtn(saving ? t('saving') : t('no_change'), () => save(true), false, saving)}
          </div>
        )}
        <div>{label(t('allergic'))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {chip(allergyNone, t('none'), () => { setAllergyNone(!allergyNone); setAllergies([]); setAllergyOther('') }, true)}
            {ALLERGIES.map(a => <span key={a.id}>{chip(allergies.includes(a.id), a[lang], () => { setAllergyNone(false); toggle(allergies, setAllergies, a.id) })}</span>)}
          </div>
          {!allergyNone && <input value={allergyOther} onChange={e => setAllergyOther(e.target.value)} placeholder={t('other')} style={{ ...input, fontSize: 17, marginTop: 10 }} />}
        </div>
        <div>{label(t('any_of'))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {chip(conditionNone, t('none'), () => { setConditionNone(!conditionNone); setConditions([]); setConditionOther('') }, true)}
            {CONDITIONS.map(c => <span key={c.id}>{chip(conditions.includes(c.id), c[lang], () => { setConditionNone(false); toggle(conditions, setConditions, c.id) })}</span>)}
          </div>
          {!conditionNone && <input value={conditionOther} onChange={e => setConditionOther(e.target.value)} placeholder={t('other')} style={{ ...input, fontSize: 17, marginTop: 10 }} />}
        </div>
        <div>{label(t('meds_now'), t('optional'))}<input value={meds} onChange={e => setMeds(e.target.value)} style={{ ...input, fontSize: 17 }} /></div>
        <label style={{ display: 'flex', gap: 14, alignItems: 'flex-start', fontSize: 16, color: MUTED, cursor: 'pointer' }}>
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ width: 26, height: 26, accentColor: TEAL, flexShrink: 0 }} />
          <span>{t('consent')}</span>
        </label>
        {err}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          {bigBtn(t('back'), () => setStep('problem'), true)}
          {bigBtn(saving ? t('saving') : t('done'), () => save(false), false, saving)}
        </div>
      </div>
    )
  } else {
    body = (
      <div style={{ display: 'grid', gap: 20, justifyItems: 'center', textAlign: 'center', paddingTop: 40 }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', background: TEAL_TINT, display: 'grid', placeItems: 'center' }}>
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke={TEAL_DARK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        {h(`${t('thanks')}${doneName ? `, ${doneName}` : ''}`)}
        <p style={{ color: MUTED, fontSize: 18, margin: 0, maxWidth: 420 }}>{t('seat')}</p>
        <div style={{ background: NAVY, color: '#fff', borderRadius: 16, padding: '18px 24px', fontWeight: 700, fontSize: 19 }}>{t('hand_back')}</div>
        <button type="button" onClick={reset} style={{ marginTop: 30, border: `1px solid ${LINE}`, background: '#fff', borderRadius: 12, padding: '12px 20px', fontSize: 15, color: MUTED, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          Reception: start next patient
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#F8FAFC', overflowY: 'auto', color: NAVY, fontFamily: 'var(--font-body)' }}>
      {header}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 60px' }}>{body}</div>
    </div>
  )
}
