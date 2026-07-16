// Cloudinary on-the-fly transform helper. Dentist photos are stored as
// full-size Cloudinary uploads but rendered into small card thumbnails, so we
// inject a width + auto format/quality transform into the delivery URL to serve
// an appropriately-sized image instead of the multi-MB original.
//
// Non-Cloudinary URLs (legacy uploads, external avatars) and empty values pass
// through untouched.
export function cdnImg(url: string, w: number): string {
  if (!url?.includes('res.cloudinary.com')) return url ?? ''
  return url.replace('/upload/', `/upload/w_${w},f_auto,q_auto/`)
}
