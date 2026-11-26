import { brandCard, cardFormat, profileCard, safePhoto } from '@/lib/shareCards'
import { loadExpertProfile, expertHeadline } from '@/lib/expertProfile'
import { cityNameOf, isFoundingDentist } from '@/lib/national'
import { drName } from '@/lib/dentistName'

// Share card picture for an expert profile: /api/og/profile/<slug>.
// ?format=story gives the tall Instagram story version. Uses the same
// numbers as the profile page; zero counts are left off the card.

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const format = cardFormat(req)
  try {
    const data = await loadExpertProfile(slug)
    if (!data) return brandCard(format)
    const d = data.dentist
    const badges: string[] = []
    if (isFoundingDentist(d.created_at)) badges.push('Founding Dentist')
    if (d.is_verified) badges.push('Registration verified')
    return profileCard({
      name: drName(d.name),
      headline: expertHeadline(d, data.topSpecialties),
      city: cityNameOf(d.city),
      photo: await safePhoto(d.profile_photo),
      stats: [
        { n: data.caseCount, label: 'cases shared' },
        { n: data.followupCount, label: 'checked later' },
        { n: data.helpfulCount, label: 'helpful replies' },
        { n: data.followerCount, label: 'dentist followers' },
      ],
      badges,
      slug: d.slug,
    }, format)
  } catch (e) {
    console.error('[og/profile] failed', e)
    return brandCard(format)
  }
}
