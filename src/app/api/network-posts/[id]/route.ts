// DELETE /api/network-posts/<id> — the author removes their own post.
import { NextRequest, NextResponse } from 'next/server'
import { adminDb, getViewerDentist } from '@/lib/national'

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const viewer = await getViewerDentist()
  if (!viewer) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { data, error } = await adminDb().from('network_posts').delete()
    .eq('id', id).eq('dentist_id', viewer.id).select('id')
  if (error) return NextResponse.json({ error: 'Could not delete. Please try again.' }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
