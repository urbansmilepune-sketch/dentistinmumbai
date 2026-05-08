'use client'

import { useState, useEffect } from 'react'

interface Treatment {
  id: string
  name: string
  slug: string
  icon: string
}

interface DentistTreatment {
  fee_from: number | null
  fee_to: number | null
  treatments: Treatment
}

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
  dentist: {
    id: string
    name: string
    clinic_name: string | null
    working_hours: any
  }
  treatments: DentistTreatment[]
}

function generateTimeSlots(openTime: string, closeTime: string, breakStart?: string, breakEnd?: string): string[] {
  const slots: string[] = []
  const [openH, openM] = openTime.split(':').map(Number)
  const [closeH, closeM] = closeTime.split(':').map(Number)
  const breakS = breakStart ? breakStart.split(':').map(Number) : null
  const breakE = breakEnd ? breakEnd.split(':').map(Number) : null

  let h = openH, m = openM
  while (h * 60 + m < closeH * 60 + closeM - 30) {
    if (breakS && breakE) {
      const curr = h * 60 + m
      const bs = breakS[0] * 60 + breakS[1]
      const be = breakE[0] * 60 + breakE[1]
      if (curr >= bs && curr < be) { m += 30; if (m >= 60) { h++; m -= 60 }; continue }
    }
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    m += 30
    if (m >= 60) { h++; m -= 60 }
  }
  return slots
}

function getClosedDays(working_hours: any): number[] {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return days.map((d, i) => (!working_hours?.[d]?.is_open ? i : -1)).filter(i => i >= 0)
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

function getSlotPeriod(time: string): 'morning' | 'afternoon' | 'evening' {
  const h = parseInt(time.split(':')[0])
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

const PERIOD_LABELS = { morning: '🌅 Morning', afternoon: '☀️ Afternoon', evening: '🌙 Evening' }

export default function BookingModal({ isOpen, onClose, dentist, treatments }: BookingModalProps) {
  const [step, setStep] = useState(1)
  const [selectedTreatment, setSelectedTreatment] = useState<DentistTreatment | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [bookedSlots, setBookedSlots] = useState<string[]>([])
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', consent: false })
  const [submitting, setSubmitting] = useState(false)
  const [reference, setReference] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  const closedDays = getClosedDays(dentist.working_hours)

  // Fetch booked slots when date selected
  useEffect(() => {
    if (!selectedDate) return
    const dateStr = selectedDate.toISOString().split('T')[0]
    fetch(`/api/bookings/slots?dentist_id=${dentist.id}&date=${dateStr}`)
      .then(r => r.json())
      .then(d => setBookedSlots(d.slots || []))
      .catch(() => setBookedSlots([]))
  }, [selectedDate, dentist.id])

  // Get time slots for selected date
  const dayKey = selectedDate ? ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][selectedDate.getDay()] : null
  const dayHours = dayKey ? dentist.working_hours?.[dayKey] : null
  const availableSlots = dayHours?.is_open
    ? generateTimeSlots(dayHours.open_time || '09:00', dayHours.close_time || '19:00', dayHours.has_break ? dayHours.break_start : undefined, dayHours.has_break ? dayHours.break_end : undefined)
    : []

  // Group slots by period
  const slotsByPeriod = {
    morning: availableSlots.filter(s => getSlotPeriod(s) === 'morning'),
    afternoon: availableSlots.filter(s => getSlotPeriod(s) === 'afternoon'),
    evening: availableSlots.filter(s => getSlotPeriod(s) === 'evening'),
  }

  // Calendar helpers
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 60)

  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate()
  }
  function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay()
  }

  const year = calendarMonth.getFullYear()
  const month = calendarMonth.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const monthName = calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  function isDateDisabled(d: Date) {
    const day = d.getDay()
    return d < today || d > maxDate || closedDays.includes(day)
  }

  async function handleSubmit() {
    if (!selectedTreatment || !selectedDate || !selectedSlot || !form.name || !form.phone || !form.consent) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dentist_id: dentist.id,
          treatment_id: selectedTreatment.treatments.id,
          appt_date: selectedDate.toISOString().split('T')[0],
          time_slot: selectedSlot,
          patient_name: form.name,
          patient_phone: form.phone,
          patient_email: form.email,
          notes: form.notes,
          consent: form.consent,
        }),
      })
      const data = await res.json()
      if (data.reference_no) {
        setReference(data.reference_no)
        setStep(5)
      }
    } catch {}
    setSubmitting(false)
  }

  function reset() {
    setStep(1); setSelectedTreatment(null); setSelectedDate(null)
    setSelectedSlot(null); setForm({ name: '', phone: '', email: '', notes: '', consent: false })
    setReference(''); onClose()
  }

  if (!isOpen) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />

      {/* Modal */}
      <div style={{
        position: 'relative', background: '#fff', borderRadius: 20,
        width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 2 }}>Book Appointment</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>{dentist.name} · {dentist.clinic_name}</p>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Progress bar */}
        {step < 5 && (
          <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[1, 2, 3, 4].map(s => (
                <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? 'var(--blue)' : 'var(--border)', transition: 'background 0.3s' }} />
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Step {step} of 4 — {['', 'Select Treatment', 'Pick Date', 'Pick Time', 'Your Details'][step]}
            </p>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* STEP 1: Treatment */}
          {step === 1 && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Which treatment do you need?</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {treatments.map(dt => (
                  <button
                    key={dt.treatments.id}
                    onClick={() => { setSelectedTreatment(dt); setStep(2) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 18px', borderRadius: 12, textAlign: 'left',
                      border: `2px solid ${selectedTreatment?.treatments.id === dt.treatments.id ? 'var(--blue)' : 'var(--border)'}`,
                      background: selectedTreatment?.treatments.id === dt.treatments.id ? 'var(--blue-light)' : '#fff',
                      cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 22 }}>{dt.treatments.icon}</span>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{dt.treatments.name}</span>
                    </div>
                    {(dt.fee_from || dt.fee_to) && (
                      <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 700 }}>
                        {dt.fee_from && dt.fee_to ? `₹${dt.fee_from}–₹${dt.fee_to}` : dt.fee_from ? `From ₹${dt.fee_from}` : ''}
                      </span>
                    )}
                  </button>
                ))}
                {treatments.length === 0 && (
                  <button
                    onClick={() => { setSelectedTreatment({ treatments: { id: 'general', name: 'General Consultation', slug: 'general', icon: '🦷' }, fee_from: null, fee_to: null }); setStep(2) }}
                    style={{ padding: '14px 18px', borderRadius: 12, border: '2px solid var(--border)', background: '#fff', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 15, cursor: 'pointer', textAlign: 'left' }}
                  >🦷 General Consultation</button>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Date */}
          {step === 2 && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Pick a date</h3>

              {/* Calendar */}
              <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '16px', border: '1px solid var(--border)' }}>
                {/* Month nav */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <button onClick={() => setCalendarMonth(new Date(year, month - 1))} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 16 }}>‹</button>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{monthName}</span>
                  <button onClick={() => setCalendarMonth(new Date(year, month + 1))} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 16 }}>›</button>
                </div>

                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '4px 0' }}>{d}</div>
                  ))}
                </div>

                {/* Days grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const date = new Date(year, month, i + 1)
                    const disabled = isDateDisabled(date)
                    const isSelected = selectedDate?.toDateString() === date.toDateString()
                    const isToday = date.toDateString() === today.toDateString()
                    return (
                      <button
                        key={i}
                        onClick={() => { if (!disabled) { setSelectedDate(date); setSelectedSlot(null) } }}
                        disabled={disabled}
                        style={{
                          height: 36, borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 500,
                          fontFamily: 'var(--font-body)', cursor: disabled ? 'not-allowed' : 'pointer',
                          background: isSelected ? 'var(--blue)' : isToday ? 'var(--blue-light)' : 'transparent',
                          color: isSelected ? '#fff' : disabled ? '#CBD5E1' : isToday ? 'var(--blue)' : 'var(--text)',
                          fontWeight: isSelected || isToday ? 700 : 500,
                          transition: 'all 0.15s',
                        }}
                      >{i + 1}</button>
                    )
                  })}
                </div>
              </div>

              {closedDays.length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                  * Greyed out dates are closed days
                </p>
              )}
            </div>
          )}

          {/* STEP 3: Time slot */}
          {step === 3 && selectedDate && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                Pick a time slot
              </h3>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
                {selectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>

              {availableSlots.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg)', borderRadius: 12 }}>
                  <p style={{ color: 'var(--muted)' }}>No slots available on this day.</p>
                  <button onClick={() => setStep(2)} style={{ marginTop: 12, color: 'var(--blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>← Choose another date</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {(Object.keys(slotsByPeriod) as (keyof typeof slotsByPeriod)[]).map(period => (
                    slotsByPeriod[period].length > 0 && (
                      <div key={period}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 10 }}>{PERIOD_LABELS[period]}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {slotsByPeriod[period].map(slot => {
                            const booked = bookedSlots.includes(slot)
                            const selected = selectedSlot === slot
                            return (
                              <button
                                key={slot}
                                onClick={() => { if (!booked) setSelectedSlot(slot) }}
                                disabled={booked}
                                style={{
                                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                  fontFamily: 'var(--font-body)', cursor: booked ? 'not-allowed' : 'pointer',
                                  border: `2px solid ${selected ? 'var(--blue)' : booked ? 'var(--border)' : 'var(--border)'}`,
                                  background: selected ? 'var(--blue)' : booked ? 'var(--bg)' : '#fff',
                                  color: selected ? '#fff' : booked ? '#CBD5E1' : 'var(--text)',
                                  textDecoration: booked ? 'line-through' : 'none',
                                  transition: 'all 0.15s',
                                }}
                              >{formatTime(slot)}</button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Patient details */}
          {step === 4 && (
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Your Details</h3>

              {/* Booking summary */}
              <div style={{ background: 'var(--blue-light)', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 16px', marginBottom: 24, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><strong>Treatment:</strong> {selectedTreatment?.treatments.name}</div>
                <div><strong>Date:</strong> {selectedDate?.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div><strong>Time:</strong> {selectedSlot && formatTime(selectedSlot)}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'Full Name *', key: 'name', type: 'text', placeholder: 'Your full name' },
                  { label: 'Phone Number *', key: 'phone', type: 'tel', placeholder: '10-digit mobile number' },
                  { label: 'Email Address', key: 'email', type: 'email', placeholder: 'For booking confirmation' },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>{field.label}</label>
                    <input
                      type={field.type}
                      value={form[field.key as keyof typeof form] as string}
                      onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' }}
                    />
                  </div>
                ))}

                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Additional Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any specific concerns or medical history..."
                    rows={3}
                    style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical' }}
                  />
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={e => setForm(f => ({ ...f, consent: e.target.checked }))}
                    style={{ marginTop: 3, accentColor: 'var(--blue)', width: 16, height: 16, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    I consent to share my contact details with {dentist.name} for appointment purposes. *
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 5: Confirmation */}
          {step === 5 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Appointment Confirmed!</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
                Your booking request has been sent to {dentist.name}.
              </p>

              <div style={{ background: 'var(--blue-light)', border: '1px solid #BFDBFE', borderRadius: 14, padding: '20px', marginBottom: 24 }}>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Booking Reference</p>
                <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: 'var(--blue)', letterSpacing: '0.05em' }}>{reference}</p>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', marginBottom: 24, textAlign: 'left', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Treatment</span>
                  <span style={{ fontWeight: 600 }}>{selectedTreatment?.treatments.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Date</span>
                  <span style={{ fontWeight: 600 }}>{selectedDate?.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Time</span>
                  <span style={{ fontWeight: 600 }}>{selectedSlot && formatTime(selectedSlot)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Clinic</span>
                  <span style={{ fontWeight: 600 }}>{dentist.clinic_name}</span>
                </div>
              </div>

              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
                📱 A confirmation will be sent to your phone. The clinic will call to confirm your appointment.
              </p>

              <button onClick={reset} className="btn btn-primary" style={{ width: '100%' }}>Done</button>
            </div>
          )}
        </div>

        {/* Footer with nav buttons */}
        {step < 5 && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0, background: '#fff' }}>
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} className="btn btn-outline" style={{ flex: 1 }}>← Back</button>
            )}
            {step === 2 && selectedDate && (
              <button onClick={() => setStep(3)} className="btn btn-primary" style={{ flex: 2 }}>Continue →</button>
            )}
            {step === 3 && selectedSlot && (
              <button onClick={() => setStep(4)} className="btn btn-primary" style={{ flex: 2 }}>Continue →</button>
            )}
            {step === 4 && (
              <button
                onClick={handleSubmit}
                disabled={submitting || !form.name || !form.phone || !form.consent}
                className="btn btn-primary"
                style={{ flex: 2, opacity: (!form.name || !form.phone || !form.consent) ? 0.5 : 1 }}
              >{submitting ? 'Booking...' : 'Confirm Booking 🎉'}</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
