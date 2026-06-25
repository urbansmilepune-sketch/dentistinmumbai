// SECTION 5 — Trust pills. Only pills backed by real data render; if every
// pill is empty the whole row is hidden (caller renders nothing because this
// returns null).

import { NAVY } from './profileTheme'
import { ShieldCheckIcon, CardIcon, LanguagesIcon, GenderMaleIcon, GenderFemaleIcon } from './profileIcons'

interface Props {
  isVerified: boolean
  emiAvailable: boolean
  languages: string[]
  gender: string | null
}

const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 12px', borderRadius: 999,
  background: '#fff', border: '1px solid var(--border)',
  fontSize: 12.5, fontWeight: 600, color: NAVY,
}

export default function TrustPills({ isVerified, emiAvailable, languages, gender }: Props) {
  const g = (gender || '').toLowerCase()
  const showGender = g === 'male' || g === 'female'
  const langs = (languages || []).filter(l => l && l.trim())

  if (!isVerified && !emiAvailable && langs.length === 0 && !showGender) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {isVerified && (
        <span style={{ ...pill, background: '#ECFDF5', borderColor: '#A7F3D0', color: '#047857' }}>
          <ShieldCheckIcon size={15} color="#059669" /> MCI Verified
        </span>
      )}
      {emiAvailable && (
        <span style={{ ...pill, background: '#FEF9EC', borderColor: '#FCE8B6', color: '#92400E' }}>
          <CardIcon size={15} color="#B45309" /> EMI available
        </span>
      )}
      {langs.length > 0 && (
        <span style={pill}>
          <LanguagesIcon size={14} color="#0D9488" /> {langs.join(', ')}
        </span>
      )}
      {showGender && (
        <span style={pill}>
          {g === 'male'
            ? <GenderMaleIcon size={14} color="#0D9488" />
            : <GenderFemaleIcon size={14} color="#0D9488" />}
          {g === 'male' ? 'Male dentist' : 'Female dentist'}
        </span>
      )}
    </div>
  )
}
