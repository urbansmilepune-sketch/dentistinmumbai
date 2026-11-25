// POST /api/cases/[id]/followup — the case owner attaches a follow-up
// photo or X-ray (already uploaded via /api/cases/upload-photo) with the
// number of months since treatment. Works on approved cases too, which
// the owner can't otherwise edit, so it goes through the service role
// after checking ownership by email.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb, getViewerDentist, isMissingColumnError } from '@/lib/national'

const KINDS = new Set(['after', 'xray_after'])

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: caseId } = await ctx.params
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const kind = typeof body.kind === 'string' ? body.kind : ''
  const months = Number(body.months_after)
  if (!/^https:\/\/res\.cloudinary\.com\//.test(url)) return NextResponse.json({ error: 'Invalid photo' }, { status: 400 })
  if (!KINDS.has(kind)) return NextResponse.json({ error: 'Invalid photo type' }, { status: 400 })
  if (!Number.isInteger(months) || months < 1 || months > 120) return NextResponse.json({ error: 'Invalid month' }, { status: 400 })

  const db = adminDb()
  const { data: row } = await db.from('cases').select('id, dentist_id').eq('id', caseId).single()
  if (!row || row.dentist_id !== viewer.id) return NextResponse.json({ error: 'Only the dentist who posted this case can add follow-ups' }, { status: 403 })

  const { count } = await db.from('case_photos').select('id', { count: 'exact', head: true }).eq('case_id', caseId)
  if ((count ?? 0) >= 24) return NextResponse.json({ error: 'This case already has the maximum number of photos' }, { status: 400 })

  const base = { case_id: caseId, url, kind, caption: `${months}-month follow-up`, display_order: 100 + months }
  let { error } = await db.from('case_photos').insert({ ...base, months_after: months })
  if (error && isMissingColumnError(error)) ({ error } = await db.from('case_photos').insert(base))
  if (error) return NextResponse.json({ error: `Could not save: ${error.message}` }, { status: 500 })
  return NextResponse.json({ success: true })
}
