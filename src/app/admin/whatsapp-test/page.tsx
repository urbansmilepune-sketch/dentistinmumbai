import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/adminAuth'
import WhatsAppTestClient from './WhatsAppTestClient'

export const dynamic = 'force-dynamic'

export default async function WhatsAppTestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/for-dentists/login')
  const { data: adminRow } = await serviceClient()
    .from('admin_users').select('id').ilike('email', user.email).maybeSingle()
  if (!adminRow) redirect('/for-dentists/login')
  return <WhatsAppTestClient enabled={process.env.WHATSAPP_ENABLED === 'true'} />
}
