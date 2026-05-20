// GET /api/india/feed — JSON feed for the signed-in dentist. Returns
// cases from dentists they follow, or trending cases as a fallback.
// Mirrors the shape the /feed page renders. Auth required.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { buildFeedFor } from '@/lib/feed'

const admin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Sign in to view your feed' }, { status: 401 })

  const { data: dentist } = await supabase
    .from('dentists').select('id').eq('email', user.email).single()
  if (!dentist) return NextResponse.json({ error: 'Dentist profile not found' }, { status: 404 })

  const result = await buildFeedFor(admin, dentist.id)
  return NextResponse.json(result)
}
