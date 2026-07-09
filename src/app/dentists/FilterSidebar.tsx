'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import NearMeButton from './NearMeButton'

interface Area { name: string; slug: string; dentist_count: number; zone?: string | null }
interface Treatment { name: string; slug: string }

const SPECIALTIES = ['Implants', 'Orthodontics', 'Pediatric', 'Cosmetic', 'Oral Surgery']
const LANGUAGES = ['Hindi', 'English', 'Marathi', 'Gujarati']

// Stable ordering for Mumbai zone subheaders. Anything not in this list falls
// to the end alphabetically, so a stray new zone won't disappear.
const MUMBAI_ZONE_ORDER = ['Western', 'Central', 'Harbour', 'South', 'South Mumbai', 'Navi Mumbai']

interface FilterSidebarProps {
  areas: Area[]
  treatments: Treatment[]
  hasCoords?: boolean
  groupAreasByZone?: boolean
  activeFilters: {
    areas: string[]
    treatments: string[]
    specialties: string[]
    languages: string[]
    rating: string
    fee: string
    gender: string
    emi: boolean
    openNow: boolean
    verified: boolean
  }
}

export default function FilterSidebar({ areas, treatments, hasCoords, groupAreasByZone, activeFilters }: FilterSidebarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [areaSearch, setAreaSearch] = useState('')
  const [treatmentSearch, setTreatmentSearch] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  const activeCount = [
    activeFilters.areas.length > 0,
    activeFilters.treatments.length > 0,
    activeFilters.specialties.length > 0,
    activeFilters.languages.length > 0,
    !!activeFilters.rating,
    !!activeFilters.fee,
    !!activeFilters.gender,
    activeFilters.emi,
    activeFilters.openNow,
    activeFilters.verified,
  ].filter(Boolean).length

  function updateFilter(key: string, value: string | string[] | boolean | null) {
    const params = new URLSearchParams(searchParams.toString())
    // Reset to page 1 by dropping the param entirely — page 1 is the bare URL,
    // we never emit &page=1 (Section 4 de-parameterisation).
    params.delete('page')

    if (value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0)) {
      params.delete(key)
    } else if (Array.isArray(value)) {
      params.set(key, value.join(','))
    } else if (typeof value === 'boolean') {
      if (value) params.set(key, 'true')
      else params.delete(key)
    } else {
      params.set(key, value)
    }

    startTransition(() => {
      router.push(`/dentists?${params.toString()}`)
    })
  }

  function toggleArea(slug: string) {
    const current = activeFilters.areas
    const next = current.includes(slug) ? current.filter(a => a !== slug) : [...current, slug]
    updateFilter('area', next)
  }

  function toggleTreatment(slug: string) {
    const current = activeFilters.treatments
    const next = current.includes(slug) ? current.filter(t => t !== slug) : [...current, slug]
    updateFilter('treatment', next)
  }

  function toggleSpecialty(name: string) {
    const current = activeFilters.specialties
    const next = current.includes(name) ? current.filter(s => s !== name) : [...current, name]
    updateFilter('specialty', next)
  }

  function toggleLanguage(name: string) {
    const current = activeFilters.languages
    const next = current.includes(name) ? current.filter(l => l !== name) : [...current, name]
    updateFilter('language', next)
  }

  function clearAll() {
    startTransition(() => {
      router.push('/dentists')
    })
  }

  const filteredAreas = areas.filter(a => a.name.toLowerCase().includes(areaSearch.toLowerCase()))
  const filteredTreatments = treatments.filter(t => t.name.toLowerCase().includes(treatmentSearch.toLowerCase()))

  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>
          Filters {activeCount > 0 && <span style={{ color: 'var(--blue)' }}>({activeCount})</span>}
        </span>
        {activeCount > 0 && (
          <button onClick={clearAll} style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Clear all
          </button>
        )}
      </div>

      {/* GPS — most prominent slot */}
      <NearMeButton active={!!hasCoords} />

      {/* 1. Area */}
      <FilterPanel title="Area" active={activeFilters.areas.length > 0} onClear={() => updateFilter('area', [])}>
        <input
          type="text" placeholder="Search areas..." value={areaSearch}
          onChange={e => setAreaSearch(e.target.value)}
          style={searchInputStyle}
        />
        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* When zone grouping is on (Mumbai) AND search is empty, render
              non-clickable zone subheaders above the matching areas. Typing in
              the search box collapses back to a flat list so results aren't
              broken up. */}
          {groupAreasByZone && !areaSearch
            ? (() => {
                const byZone = new Map<string, Area[]>()
                for (const a of filteredAreas) {
                  const key = a.zone || 'Other'
                  if (!byZone.has(key)) byZone.set(key, [])
                  byZone.get(key)!.push(a)
                }
                const sortedZones = Array.from(byZone.keys()).sort((a, b) => {
                  const ai = MUMBAI_ZONE_ORDER.indexOf(a)
                  const bi = MUMBAI_ZONE_ORDER.indexOf(b)
                  if (ai === -1 && bi === -1) return a.localeCompare(b)
                  if (ai === -1) return 1
                  if (bi === -1) return -1
                  return ai - bi
                })
                return sortedZones.map(zone => (
                  <div key={zone}>
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      padding: '8px 4px 4px', marginTop: 4,
                    }}>{zone === 'Other' ? zone : `${zone} Line`}</div>
                    {byZone.get(zone)!.map(area => (
                      <label key={area.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer', borderRadius: 6 }}>
                        <input
                          type="checkbox"
                          checked={activeFilters.areas.includes(area.slug)}
                          onChange={() => toggleArea(area.slug)}
                          style={{ accentColor: 'var(--blue)', width: 16, height: 16 }}
                        />
                        <span style={{ flex: 1, fontSize: 14 }}>{area.name}</span>
                        {area.dentist_count > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>({area.dentist_count})</span>}
                      </label>
                    ))}
                  </div>
                ))
              })()
            : filteredAreas.map(area => (
                <label key={area.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer', borderRadius: 6 }}>
                  <input
                    type="checkbox"
                    checked={activeFilters.areas.includes(area.slug)}
                    onChange={() => toggleArea(area.slug)}
                    style={{ accentColor: 'var(--blue)', width: 16, height: 16 }}
                  />
                  <span style={{ flex: 1, fontSize: 14 }}>{area.name}</span>
                  {/* Compact "(N)" filter idiom — but never show "(0)" to a
                      patient (a zero-supply area renders with no count). */}
                  {area.dentist_count > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>({area.dentist_count})</span>}
                </label>
              ))}
        </div>
      </FilterPanel>

      {/* 2. Treatment */}
      <FilterPanel title="Treatment" active={activeFilters.treatments.length > 0} onClear={() => updateFilter('treatment', [])}>
        <input
          type="text" placeholder="Search treatments..." value={treatmentSearch}
          onChange={e => setTreatmentSearch(e.target.value)}
          style={searchInputStyle}
        />
        <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredTreatments.map(t => (
            <label key={t.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer', borderRadius: 6 }}>
              <input
                type="checkbox"
                checked={activeFilters.treatments.includes(t.slug)}
                onChange={() => toggleTreatment(t.slug)}
                style={{ accentColor: 'var(--blue)', width: 16, height: 16 }}
              />
              <span style={{ fontSize: 14 }}>{t.name}</span>
            </label>
          ))}
        </div>
      </FilterPanel>

      {/* 3. Rating */}
      <FilterPanel title="Minimum Rating" active={!!activeFilters.rating} onClear={() => updateFilter('rating', null)}>
        {[{ label: '4.5★ & above', value: '4.5' }, { label: '4.0★ & above', value: '4.0' }, { label: '3.0★ & above', value: '3.0' }].map(opt => (
          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer' }}>
            <input
              type="radio" name="rating" value={opt.value}
              checked={activeFilters.rating === opt.value}
              onChange={() => updateFilter('rating', opt.value)}
              style={{ accentColor: 'var(--blue)', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14 }}>{opt.label}</span>
          </label>
        ))}
      </FilterPanel>

      {/* 4. Fee */}
      <FilterPanel title="Consultation Fee" active={!!activeFilters.fee} onClear={() => updateFilter('fee', null)}>
        {[
          { label: 'Under ₹500', value: 'under500' },
          { label: '₹500 – ₹2,000', value: '500-2000' },
          { label: 'Above ₹2,000', value: 'above2000' },
        ].map(opt => (
          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer' }}>
            <input
              type="radio" name="fee" value={opt.value}
              checked={activeFilters.fee === opt.value}
              onChange={() => updateFilter('fee', opt.value)}
              style={{ accentColor: 'var(--blue)', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 14 }}>{opt.label}</span>
          </label>
        ))}
      </FilterPanel>

      {/* 4b. Specialty */}
      <FilterPanel title="Specialty" active={activeFilters.specialties.length > 0} onClear={() => updateFilter('specialty', [])}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SPECIALTIES.map(s => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={activeFilters.specialties.includes(s)}
                onChange={() => toggleSpecialty(s)}
                style={{ accentColor: 'var(--blue)', width: 16, height: 16 }}
              />
              <span style={{ fontSize: 14 }}>{s}</span>
            </label>
          ))}
        </div>
      </FilterPanel>

      {/* 4c. Language */}
      <FilterPanel title="Language Spoken" active={activeFilters.languages.length > 0} onClear={() => updateFilter('language', [])}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {LANGUAGES.map(l => (
            <label key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={activeFilters.languages.includes(l)}
                onChange={() => toggleLanguage(l)}
                style={{ accentColor: 'var(--blue)', width: 16, height: 16 }}
              />
              <span style={{ fontSize: 14 }}>{l}</span>
            </label>
          ))}
        </div>
      </FilterPanel>

      {/* 5. Gender */}
      <FilterPanel title="Doctor Gender" active={!!activeFilters.gender} onClear={() => updateFilter('gender', null)}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['male', 'female'].map(g => (
            <button
              key={g}
              onClick={() => updateFilter('gender', activeFilters.gender === g ? null : g)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `2px solid ${activeFilters.gender === g ? 'var(--blue)' : 'var(--border)'}`,
                background: activeFilters.gender === g ? 'var(--blue)' : '#fff',
                color: activeFilters.gender === g ? '#fff' : 'var(--text)',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                transition: 'all 0.15s',
              }}
            >{g === 'male' ? '👨 Male' : '👩 Female'}</button>
          ))}
        </div>
      </FilterPanel>

      {/* 6. More Filters */}
      <FilterPanel
        title="More Filters"
        active={activeFilters.openNow || activeFilters.verified || activeFilters.emi}
        onClear={() => { updateFilter('open', null); updateFilter('verified', null); updateFilter('emi', null) }}
      >
        {[
          { label: 'Open Now', key: 'open', value: activeFilters.openNow },
          { label: 'Verified Only', key: 'verified', value: activeFilters.verified },
          { label: 'EMI Available', key: 'emi', value: activeFilters.emi },
        ].map(toggle => (
          <div key={toggle.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px' }}>
            <span style={{ fontSize: 14 }}>{toggle.label}</span>
            <button
              onClick={() => updateFilter(toggle.key, !toggle.value)}
              style={{
                width: 44, height: 24, borderRadius: 12,
                background: toggle.value ? 'var(--blue)' : 'var(--border)',
                border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: toggle.value ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
        ))}
      </FilterPanel>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside style={{
        width: 280, flexShrink: 0,
        background: '#fff', border: '1px solid var(--border)', borderRadius: 16,
        position: 'sticky', top: 88, maxHeight: 'calc(100vh - 108px)', overflowY: 'auto',
      }} className="filter-sidebar-desktop">
        {sidebar}
      </aside>

      {/* Mobile filter button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="filter-mobile-btn"
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, padding: '12px 28px', background: 'var(--blue)', color: '#fff',
          border: 'none', borderRadius: 40, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,87,168,0.35)',
          fontFamily: 'var(--font-body)',
          display: 'none',
        }}
      >🎛️ Filters {activeCount > 0 ? `(${activeCount})` : ''}</button>

      {/* Mobile bottom drawer */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: '#fff', borderRadius: '20px 20px 0 0',
            maxHeight: '85vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>Filters</span>
              <button onClick={() => setMobileOpen(false)} style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            {sidebar}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setMobileOpen(false)} className="btn btn-primary" style={{ width: '100%' }}>
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media (max-width: 768px) {
          .filter-sidebar-desktop { display: none !important; }
          .filter-mobile-btn { display: flex !important; }
        }
      `}</style>
    </>
  )
}

const searchInputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', fontSize: 13,
  fontFamily: 'var(--font-body)', marginBottom: 8, outline: 'none',
  color: 'var(--text)', background: 'var(--bg)',
}

function FilterPanel({ title, active, onClear, children }: {
  title: string; active: boolean; onClear: () => void; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-body)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: active ? 'var(--blue)' : 'var(--text)' }}>
          {title} {active && '●'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {active && (
            <span
              onClick={e => { e.stopPropagation(); onClear() }}
              style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600, cursor: 'pointer' }}
            >Clear</span>
          )}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && <div style={{ padding: '0 20px 16px' }}>{children}</div>}
    </div>
  )
}
