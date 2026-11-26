// /api/cases/drafts — save, update and delete a dentist's private case drafts.
//   POST   { id?, data, whatsapp_draft_ids? } → { success, id }
//   DELETE { id, source: 'form' | 'whatsapp' } → { success }
// Drafts live in case_drafts (service role only) and are always matched to
// the signed-in dentist, so nobody can read or change another dentist's
// draft. Publishing still goes through POST /api/cases with its consent check.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminDb } from '@/lib/national'
import { cleanDraft, isMissingTable } from '@/lib/caseDraft'

const NOT_READY = 'Drafts are not switched on yet. Please try again later.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function currentDentist() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const { data } = await supabase.from('dentists').select('id, is_active').eq('email', user.email).single()
  return data && data.is_active ? (data as { id: string }) : null
}

export async function POST(request: NextRequest) {
  const dentist = await currentDentist()
  if (!dentist) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })

  let payload: any
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const data = cleanDraft(payload?.data)
  const waIds: string[] = (Array.isArray(payload?.whatsapp_draft_ids) ? payload.whatsapp_draft_ids : [])
    .filter((x: unknown): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 20)
  const now = new Date().toISOString()
  const row = { title: data.title.trim() || null, data, whatsapp_draft_ids: waIds, updated_at: now }
  const db = adminDb()

  let id: string | null = typeof payload?.id === 'string' && UUID.test(payload.id) ? payload.id : null
  if (id) {
    const { data: upd, error } = await db.from('case_drafts').update(row)
      .eq('id', id).eq('dentist_id', dentist.id).select('id')
    if (error) return NextResponse.json({ error: isMissingTable(error) ? NOT_READY : 'Could not save the draft' }, { status: 500 })
    if (!upd?.length) id = null   // deleted elsewhere: save as a new draft
  }
  if (!id) {
    const { data: ins, error } = await db.from('case_drafts').insert({ ...row, dentist_id: dentist.id }).select('id').single()
    if (error || !ins) return NextResponse.json({ error: isMissingTable(error) ? NOT_READY : 'Could not save the draft' }, { status: 500 })
    id = (ins as { id: string }).id
  }

  // The WhatsApp photos now live in this draft, so the WhatsApp draft is
  // closed (it stops showing separately, and new WhatsApp photos start a
  // fresh case). Best-effort.
  if (waIds.length) {
    await db.from('whatsapp_case_drafts').update({ used_at: now })
      .in('id', waIds).eq('dentist_id', dentist.id).is('used_at', null).then(() => {}, () => {})
  }
  return NextResponse.json({ success: true, id })
}

export async function DELETE(request: NextRequest) {
  const dentist = await currentDentist()
  if (!dentist) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  let payload: any
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const id = typeof payload?.id === 'string' && UUID.test(payload.id) ? payload.id : null
  if (!id) return NextResponse.json({ error: 'Unknown draft' }, { status: 400 })

  const db = adminDb()
  const { error } = payload?.source === 'whatsapp'
    // Close the WhatsApp draft rather than delete it: the webhook log and
    // dedupe rely on the row.
    ? await db.from('whatsapp_case_drafts').update({ used_at: new Date().toISOString() }).eq('id', id).eq('dentist_id', dentist.id)
    : await db.from('case_drafts').delete().eq('id', id).eq('dentist_id', dentist.id)
  if (error) return NextResponse.json({ error: 'Could not delete the draft' }, { status: 500 })
  return NextResponse.json({ success: true })
}
