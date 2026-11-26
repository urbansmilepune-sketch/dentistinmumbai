'use client'

import { useEffect } from 'react'
import { rememberInvite } from '@/lib/inviteClient'

// Keeps the invite code on this phone for 30 days, so the signup still
// counts for the inviter if the colleague registers later.
export default function RememberInvite({ code }: { code: string }) {
  useEffect(() => { rememberInvite(code) }, [code])
  return null
}
