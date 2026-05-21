'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

// Standalone before/after page was retired when the X-Rays & Photos vault
// landed on the patient detail page. The legacy patient_photos table was
// merged into patient_images by migration 20260521170000, and the new
// ImageVault renders before/after rows with a drag-to-reveal slider plus
// every other image type — so a separate page no longer makes sense.
//
// Existing bookmarks hit here. Redirect to the patient detail page on the
// `images` tab so they still land somewhere useful.
export default function LegacyPhotosRedirect() {
  const router = useRouter()
  const params = useParams()
  const patientId = params?.id as string | undefined

  useEffect(() => {
    if (!patientId) {
      router.replace('/for-dentists/dashboard/patients')
      return
    }
    router.replace(`/for-dentists/dashboard/patients/${patientId}?tab=images`)
  }, [patientId, router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: 'var(--muted)' }}>Opening X-Rays &amp; Photos…</p>
    </div>
  )
}
