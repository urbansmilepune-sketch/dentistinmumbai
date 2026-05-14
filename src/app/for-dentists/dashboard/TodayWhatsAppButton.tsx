'use client'

export interface TodayAppt {
  time_slot: string | null
  patient_name: string | null
  treatment: string | null
  status: string | null
}

interface Props {
  dateLabel: string
  clinicName: string
  total: number
  newCount: number
  followUpCount: number
  nextAppt: { time_slot: string | null; patient_name: string | null } | null
  pendingDue: number
  appts: TodayAppt[]
}

function formatTime(slot: string | null): string {
  if (!slot) return '—'
  const [h, m] = slot.split(':').map(Number)
  if (isNaN(h)) return slot
  const hour12 = ((h + 11) % 12) + 1
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${hour12}:${String(m || 0).padStart(2, '0')} ${ampm}`
}

export default function TodayWhatsAppButton({
  dateLabel, clinicName, total, newCount, followUpCount, nextAppt, pendingDue, appts,
}: Props) {
  function buildMessage(): string {
    const header = [
      `🦷 Today's Schedule — ${dateLabel}`,
      clinicName || '',
      '',
      `📋 ${total} appointment${total !== 1 ? 's' : ''}`,
      `👤 ${newCount} new · 🔁 ${followUpCount} follow-up${followUpCount !== 1 ? 's' : ''}`,
      nextAppt ? `⏰ Next: ${formatTime(nextAppt.time_slot)} — ${nextAppt.patient_name ?? 'Patient'}` : '',
      pendingDue > 0 ? `💰 Pending dues: ₹${pendingDue.toLocaleString('en-IN')}` : '',
    ].filter(Boolean).join('\n')

    if (appts.length === 0) return header

    const list = appts.map(a => {
      const time = formatTime(a.time_slot)
      const name = a.patient_name ?? 'Unknown'
      const tx = a.treatment ? ` (${a.treatment})` : ''
      const status = a.status && a.status !== 'scheduled' && a.status !== 'pending' && a.status !== 'confirmed'
        ? ` [${a.status}]` : ''
      return `${time} — ${name}${tx}${status}`
    }).join('\n')

    return `${header}\n\n${list}`
  }

  function handleClick() {
    const text = buildMessage()
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <button type="button" onClick={handleClick}
      title="Share today's schedule on WhatsApp"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 18px', minHeight: 44,
        background: '#25D366', color: '#fff',
        border: 'none', borderRadius: 10,
        fontWeight: 700, fontSize: 14, cursor: 'pointer',
        fontFamily: 'var(--font-body)',
      }}>
      💬 Share on WhatsApp
    </button>
  )
}
