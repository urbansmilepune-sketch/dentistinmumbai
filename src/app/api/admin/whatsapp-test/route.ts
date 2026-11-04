// Admin-only: send one WhatsApp template to a test number with sample values.
// Used by /admin/whatsapp-test. Works even when WHATSAPP_ENABLED is off, so
// templates can be checked before switching WhatsApp on for real patients.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { sendWhatsAppTemplate, TEMPLATE_VALUE_COUNT, whatsAppEnabled, type WhatsAppTemplate } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = await requireAdmin()
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ enabled: whatsAppEnabled() })
}

export async function POST(request: NextRequest) {
  const db = await requireAdmin()
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const template = String(body.template || '') as WhatsAppTemplate
  if (!(template in TEMPLATE_VALUE_COUNT)) {
    return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  }
  const values = Array.isArray(body.values) ? body.values.map((v: unknown) => String(v ?? '')) : []
  const r = await sendWhatsAppTemplate(String(body.phone || ''), template, values, { force: true })
  return NextResponse.json(r, { status: r.success ? 200 : 502 })
}
