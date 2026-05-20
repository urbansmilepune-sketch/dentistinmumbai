import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// /professional/me — shortcut to "my professional profile". Auth-gated:
// signed-out visitors get bounced to login; signed-in dentists are
// redirected to their public /professional/[slug] page.

export const dynamic = 'force-dynamic'

export default async function ProfessionalMePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/for-dentists/login?next=/professional/me')

  const { data: dentist } = await supabase
    .from('dentists').select('slug').eq('email', user.email).single()
  if (!dentist?.slug) redirect('/for-dentists/register')

  redirect(`/professional/${dentist.slug}`)
}
