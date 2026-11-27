import type { Metadata } from 'next'
import { NATIONAL_ORIGIN } from '@/config/cities'

// Link preview (Open Graph) helpers for dentistinindia.in pages.
//
// A page that sets `openGraph` replaces the layout's openGraph entirely, so
// a page with its own title but no `images` shared on WhatsApp shows no
// picture. Pages use this to always carry one.

export const NATIONAL_OG_IMAGE = `${NATIONAL_ORIGIN}/api/og/brand`

export function nationalPreview(p: { title: string; description: string; path: string; image?: string }): Pick<Metadata, 'openGraph' | 'twitter'> {
  const image = p.image ?? NATIONAL_OG_IMAGE
  return {
    openGraph: {
      title: p.title,
      description: p.description,
      url: `${NATIONAL_ORIGIN}${p.path}`,
      siteName: 'DentistIn India',
      type: 'website',
      locale: 'en_IN',
      images: [{ url: image, width: 1200, height: 630, type: 'image/png', alt: p.title }],
    },
    twitter: { card: 'summary_large_image', title: p.title, description: p.description, images: [image] },
  }
}
