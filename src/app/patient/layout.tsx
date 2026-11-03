import { patientAppMetadata, patientAppViewport } from '@/lib/patientApp'
import { INSTALL_PROMPT_CATCHER } from '@/lib/dentistApp'

export const metadata = patientAppMetadata
export const viewport = patientAppViewport

// Patient app shell. The inline script runs before React hydrates so Chrome's
// one-time install event is caught for the install banner.
export default function PatientAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_CATCHER }} />
      {children}
    </>
  )
}
