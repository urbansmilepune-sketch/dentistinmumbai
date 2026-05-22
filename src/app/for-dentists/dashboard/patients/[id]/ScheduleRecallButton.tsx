'use client'

// "Schedule Recall" button + modal on the patient detail page. Inserts a
// row into recall_reminders directly via the user-bound supabase client —
// the table's RLS policy already restricts writes to the owning dentist,
// so no API route is needed. The recall surfaces on
// /for-dentists/dashboard/recalls and on the daily cron once due.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ReminderType = '6month_checkup' | 'annual_cleaning' | 'follow_up' | 'custom'
type Channel = 'sms' | 'whatsapp' | 'email'

interface Props {
  patientId: string
  dentistId: string
}

const TYPE_OPTIONS: { value: ReminderType; label: string; months: number }[] = [
  { value: '6month_checkup',  label: '6-month checkup',   months: 6 },
  { value: 'annual_cleaning', label: 'Annual cleaning',   months: 12 },
  { value: 'follow_up',       label: 'Follow-up',         months: 1 },
  { value: 'custom',          label: 'Custom',            months: 6 },
]

function isoDaysFromToday(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ScheduleRecallButton({ patientId, dentistId }: Props) {
  const [open, setOpen] = useState(false)
  const [reminderType, setReminderType] = useState<ReminderType>('6month_checkup')
  const [dueDate, setDueDate] = useState(isoDaysFromToday(6))
  const [channel, setChannel] = useState<Channel>('sms')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function pickType(t: ReminderType) {
    setReminderType(t)
    // Auto-update the due date when the type changes, but only if the
    // dentist hasn't already overridden it to a value outside the type's
    // natural window. (Cheap heuristic: any time they pick a type, snap.)
    const opt = TYPE_OPTIONS.find(o => o.value === t)
    if (opt) setDueDate(isoDaysFromToday(opt.months))
  }

  async function save() {
    setError(null)
    if (!dueDate) { setError('Pick a due date.'); return }
    setSaving(true)
    const supabase = createClient()
    const { error: insertErr } = await supabase
      .from('recall_reminders')
      .insert({
        dentist_id: dentistId,
        patient_id: patientId,
        reminder_type: reminderType,
        due_date: dueDate,
        message_channel: channel,
        notes: notes.trim() || null,
        status: 'pending',
      })
    setSaving(false)
    if (insertErr) {
      setError(insertErr.message)
      return
    }
    setOpen(false)
    setToast(`Recall scheduled for ${new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`)
    setTimeout(() => setToast(null), 4000)
    // Reset for next use
    setNotes('')
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{
          padding: '8px 14px', minHeight: 38, background: '#EDE9FE', color: '#5B21B6',
          border: '1px solid #DDD6FE', borderRadius: 8, fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'var(--font-body)',
        }}>
        📅 Schedule Recall
      </button>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#166534', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 1100, boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
          ✓ {toast}
        </div>
      )}

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>Schedule Recall</h2>
              <button onClick={() => !saving && setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ padding: 22 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Reminder Type</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TYPE_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => pickType(o.value)}
                      style={{
                        padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: reminderType === o.value ? 'var(--blue)' : '#fff',
                        color:      reminderType === o.value ? '#fff' : 'var(--text)',
                        border: `1.5px solid ${reminderType === o.value ? 'var(--blue)' : 'var(--border)'}`,
                        cursor: 'pointer', fontFamily: 'var(--font-body)',
                      }}>{o.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Due Date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Channel</label>
                  <select value={channel} onChange={e => setChannel(e.target.value as Channel)} style={inputStyle}>
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 6 }}>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Internal reminder — e.g. 'Check filling on #16'"
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              {error && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginTop: 10 }}>{error}</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => !saving && setOpen(false)}
                style={{ padding: '9px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                style={{ padding: '9px 18px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Scheduling…' : 'Schedule Recall'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--muted)',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)',
  fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', background: '#fff',
}
