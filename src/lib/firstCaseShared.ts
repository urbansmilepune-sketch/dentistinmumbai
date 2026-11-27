// First-case constants safe to use in browser components (no server code).

/** WhatsApp number dentists send case photos to. */
export const CASE_WHATSAPP_NUMBER = '917719013232'
export const POST_BY_WHATSAPP_URL = `https://wa.me/${CASE_WHATSAPP_NUMBER}?text=` + encodeURIComponent('Hi, I want to post a case')

/** Simple ideas shown under the "post your first case" buttons. */
export const FIRST_CASE_IDEAS = ['A crown', 'RCT on X-ray', 'Filling before/after', 'Tricky extraction', 'Ask about a case']
