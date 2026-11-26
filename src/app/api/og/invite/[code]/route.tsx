import { brandCard, cardFormat, inviteCard, safePhoto } from '@/lib/shareCards'
import { findInviter, normalizeInviteCode } from '@/lib/invites'
import { drName } from '@/lib/dentistName'
import { cityNameOf } from '@/lib/national'

// Share card picture for an invite link: /api/og/invite/<CODE>.

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const format = cardFormat(req)
  try {
    const norm = normalizeInviteCode(code)
    const d = norm ? await findInviter(norm) : null
    if (!d) return brandCard(format)
    const city = cityNameOf(d.city)
    return inviteCard({ name: drName(d.name), photo: await safePhoto(d.profile_photo), line: city ? `Dentist in ${city}` : null }, format)
  } catch (e) {
    console.error('[og/invite] failed', e)
    return brandCard(format)
  }
}
