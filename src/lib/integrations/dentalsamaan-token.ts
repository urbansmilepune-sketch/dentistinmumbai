// Mints the short-lived JWT that DentistIn appends as `?ds_token=` when it
// redirects a dentist over to DentalSamaan to buy supplies. DentalSamaan
// verifies it with the same shared secret (see its lib/integrations/
// dentistin-auth.ts → verifyDentistInToken).
//
// HS256 + a 5-minute expiry: the token only has to survive the redirect hop,
// so a tight window limits the blast radius if a URL leaks (browser history,
// referer headers, server logs).

import { SignJWT } from 'jose'

const SHARED_SECRET = process.env.DENTISTIN_SHARED_SECRET!

export interface DentistInTokenPayload {
  dentistId: string
  email: string
  name: string
  clinicName: string
  phone: string | null
  gstin: string | null
  deliveryAddress: {
    line1: string
    city: string
    pincode: string
  } | null
  cartItems?: Array<{
    productSlug: string
    quantity: number
    productName: string
  }>
}

function getSecret(): Uint8Array {
  if (!SHARED_SECRET || SHARED_SECRET.length < 32) {
    throw new Error('DENTISTIN_SHARED_SECRET missing or too short (min 32 chars)')
  }
  return new TextEncoder().encode(SHARED_SECRET)
}

export async function mintDentalSamaanToken(
  payload: DentistInTokenPayload,
): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(getSecret())
}
