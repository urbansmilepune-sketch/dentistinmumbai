import { Resend } from 'resend'
import { CITY_CONFIGS, DEFAULT_CITY, type CitySlug } from '@/config/cities'

const resend = new Resend(process.env.RESEND_API_KEY)

const ADMIN_EMAIL = 'dentistinmumbaiapp@gmail.com'

/**
 * Domains that have been DKIM-verified in Resend and can therefore be used
 * as a from-address without bounces. Anything outside this set is rewritten
 * to the mumbai address by getCityEmail below — better to send a slightly
 * off-brand from-address than to have the message rejected.
 *
 * To enable a new city's branded sender:
 *   1. Add the apex domain in Resend (Settings → Domains → Add Domain).
 *   2. Wait for DKIM/SPF green checkmarks.
 *   3. Append the slug here.
 */
const VERIFIED_RESEND_DOMAINS: ReadonlySet<CitySlug> = new Set<CitySlug>([
  'mumbai',
])

/**
 * The per-city from-address used in Resend `from:` headers. Format is
 * always `hello@<city-domain>`, which lines up with the CityConfig.domain
 * values in src/config/cities.ts (both `.in` and `.com` TLDs supported).
 * Unknown slugs and unverified domains both fall back to the mumbai
 * sender so the send still goes through.
 */
export function getCityEmail(citySlug?: string | null): string {
  const slug = (citySlug && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, citySlug)
    ? citySlug
    : DEFAULT_CITY) as CitySlug
  if (VERIFIED_RESEND_DOMAINS.has(slug)) return `hello@${CITY_CONFIGS[slug].domain}`
  return `hello@${CITY_CONFIGS[DEFAULT_CITY].domain}`
}

/**
 * Resolve a CitySlug-ish input to a CityConfig with sensible fallback.
 * Email callers pass the city slug they have on the row (or omit it for
 * legacy data), and we use that to brand every template.
 */
function resolveCity(v: string | null | undefined) {
  const slug = (v && Object.prototype.hasOwnProperty.call(CITY_CONFIGS, v) ? v : DEFAULT_CITY) as CitySlug
  const cfg = CITY_CONFIGS[slug]
  return { ...cfg, origin: `https://${cfg.domain}` }
}

export async function sendRegistrationEmailToAdmin(data: {
  name: string
  clinic_name: string
  area: string
  phone: string
  email: string
  qualification: string
  ref_no: string
  city?: string
}) {
  const city = resolveCity(data.city)
  return resend.emails.send({
    from: getCityEmail(city.citySlug),
    to: ADMIN_EMAIL,
    subject: `🦷 New Dentist Registration — ${data.name} | ${data.ref_no}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #0057A8; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">New Dentist Registration</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">${city.domain}</p>
        </div>
        <div style="background: #f8faff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 40%;">Reference</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0057A8;">${data.ref_no}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Name</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${data.name}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Clinic</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${data.clinic_name}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">City</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${city.cityName}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Area</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${data.area}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Phone</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${data.phone}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Email</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${data.email}</td></tr>
            <tr><td style="padding: 10px 0; color: #64748b;">Qualification</td><td style="padding: 10px 0;">${data.qualification}</td></tr>
          </table>
          <div style="margin-top: 24px; text-align: center;">
            <a href="${city.origin}/admin" style="background: #0057A8; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Review in Admin Panel →</a>
          </div>
        </div>
      </div>
    `,
  })
}

export async function sendAutoApprovedAdminAlert(data: {
  name: string
  clinic_name: string
  area: string
  phone: string
  email: string
  ref_no: string
  slug: string
  city?: string
}) {
  const city = resolveCity(data.city)
  return resend.emails.send({
    from: getCityEmail(city.citySlug),
    to: ADMIN_EMAIL,
    subject: `✅ Auto-approved: ${data.name} (${data.ref_no})`,
    text: `Auto-approved at signup: ${data.name}, ${data.clinic_name}, ${data.area}, ${data.phone}. Profile is live at ${city.origin}/dentist/${data.slug}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="background: #DCFCE7; border: 1px solid #BBF7D0; border-radius: 10px; padding: 16px 20px; margin-bottom: 18px;">
          <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 700;">✅ Auto-approved at signup — no admin action needed</p>
          <p style="margin: 6px 0 0; color: #166534; font-size: 13px;">All gating checks passed (phone, MCI, name, clinic, area).</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #64748b; width: 40%;">Reference</td><td style="padding: 8px 0; font-weight: bold; color: #0057A8;">${data.ref_no}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Name</td><td style="padding: 8px 0; font-weight: bold;">${data.name}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Clinic</td><td style="padding: 8px 0;">${data.clinic_name}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">City · Area</td><td style="padding: 8px 0;">${city.cityName} · ${data.area}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Phone</td><td style="padding: 8px 0;">${data.phone}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">Email</td><td style="padding: 8px 0;">${data.email}</td></tr>
        </table>
        <div style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
          <a href="${city.origin}/dentist/${data.slug}" style="background: #0057A8; color: #fff; padding: 11px 20px; border-radius: 8px; text-decoration: none; font-weight: 700; display: inline-block; font-size: 14px;">View Live Profile →</a>
          <a href="${city.origin}/admin" style="background: #fff; color: #0057A8; border: 2px solid #0057A8; padding: 9px 18px; border-radius: 8px; text-decoration: none; font-weight: 700; display: inline-block; font-size: 14px;">Open Admin Panel</a>
        </div>
      </div>
    `,
  })
}

export async function sendStaffInviteEmail(data: {
  to_email: string
  invite_url: string
  clinic_name: string
  owner_name: string
  role: 'owner' | 'associate_dentist' | 'reception'
  city?: string
}) {
  const city = resolveCity(data.city)
  const roleLabel = data.role === 'reception'
    ? 'Reception'
    : data.role === 'associate_dentist'
      ? 'Associate Dentist'
      : 'Clinic Owner'
  return resend.emails.send({
    from: getCityEmail(city.citySlug),
    to: data.to_email,
    subject: `${data.owner_name} invited you to join ${data.clinic_name} on ${city.domain}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #003F7A, #0057A8); padding: 28px 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">You're invited 👋</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Join ${data.clinic_name} on ${city.domain}</p>
        </div>
        <div style="background: #fff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            <strong>${data.owner_name}</strong> has invited you to join <strong>${data.clinic_name}</strong> as <strong>${roleLabel}</strong>.
          </p>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Click the button below to accept the invite and sign in. The link is single-use and expires in 24 hours.
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${data.invite_url}" style="background: #0057A8; color: white; padding: 14px 30px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block;">Accept Invite →</a>
          </div>
          <p style="color: #64748b; font-size: 12px; line-height: 1.6;">
            If you weren't expecting this email, you can safely ignore it — the invite won't activate until you click the link.
          </p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 18px;">
            © ${new Date().getFullYear()} ${city.domain} · A Dentaura Prime LLP initiative
          </p>
        </div>
      </div>
    `,
  })
}

export async function sendNewRegistrationAdminAlert(data: {
  name: string
  clinic_name: string
  area: string
  phone: string
  city?: string
}) {
  const city = resolveCity(data.city)
  const summary = `New dentist registration: ${data.name}, ${data.clinic_name}, ${data.area}, ${data.phone}. Approve here: ${city.origin}/admin`
  return resend.emails.send({
    from: getCityEmail(city.citySlug),
    to: ADMIN_EMAIL,
    subject: `🚨 New dentist registration — ${data.name}`,
    text: summary,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <p style="font-size: 15px; color: #0F1923; line-height: 1.6; margin: 0 0 18px;">${summary.replace('Approve here:', '<br/><br/>Approve here:')}</p>
        <a href="${city.origin}/admin" style="background: #0057A8; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 700; display: inline-block;">Open Admin Panel →</a>
      </div>
    `,
  })
}

export async function sendRegistrationEmailToDentist(data: {
  name: string
  clinic_name: string
  area: string
  phone: string
  ref_no: string
  to_email: string
  city?: string
}) {
  const city = resolveCity(data.city)
  return resend.emails.send({
    from: getCityEmail(city.citySlug),
    to: data.to_email,
    subject: `Welcome to ${city.domain} — Your Registration is Confirmed!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #003F7A, #0057A8); padding: 32px 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 26px;">Welcome, ${data.name.split(' ')[0]}! 🎉</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 10px 0 0; font-size: 15px;">Your registration on ${city.domain} is confirmed</p>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <div style="background: #E8F3FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <p style="color: #64748b; margin: 0 0 4px; font-size: 13px;">Your Reference Number</p>
            <p style="color: #0057A8; font-size: 28px; font-weight: bold; margin: 0;">${data.ref_no}</p>
          </div>
          <h3 style="color: #0F1923; margin-bottom: 16px;">What happens next?</h3>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; gap: 12px; align-items: flex-start; padding: 12px; background: #f8faff; border-radius: 8px;">
              <span style="font-size: 20px;">✅</span>
              <p style="margin: 0; color: #374151; font-size: 14px;">Our team will review your registration and build your clinic profile for <strong>${data.clinic_name}</strong> in <strong>${data.area}</strong> within 24 hours.</p>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start; padding: 12px; background: #f8faff; border-radius: 8px;">
              <span style="font-size: 20px;">📱</span>
              <p style="margin: 0; color: #374151; font-size: 14px;">We will call you on <strong>${data.phone}</strong> to collect your clinic photos and any additional details.</p>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-start; padding: 12px; background: #FEF3C7; border-radius: 8px;">
              <span style="font-size: 20px;">🏅</span>
              <p style="margin: 0; color: #374151; font-size: 14px;">As a <strong>Founding Member</strong>, you get a free listing forever plus priority placement in search results.</p>
            </div>
          </div>
          <div style="margin-top: 28px; text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #64748b; font-size: 13px; margin-bottom: 16px;">Once your profile is live, you can manage it from your dashboard</p>
            <a href="${city.origin}/for-dentists/login" style="background: #FF6135; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">Access Your Dashboard →</a>
          </div>
          <div style="margin-top: 24px; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px;">Questions? WhatsApp us at <a href="https://wa.me/917719903232" style="color: #0057A8;">+91 7719903232</a></p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 4px;">© ${new Date().getFullYear()} ${city.domain} · A Dentaura Prime LLP initiative</p>
          </div>
        </div>
      </div>
    `,
  })
}

export async function sendDeclineEmail(data: {
  name: string
  clinic_name: string
  to_email: string
  reason: string | null
  city?: string
}) {
  const city = resolveCity(data.city)
  const safeReason = (data.reason || '').trim()
  const reasonBlock = safeReason
    ? `
          <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
            <p style="margin: 0 0 6px; color: #991B1B; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Reason from our team</p>
            <p style="margin: 0; color: #7F1D1D; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${safeReason.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>`
    : ''

  return resend.emails.send({
    from: getCityEmail(city.citySlug),
    to: data.to_email,
    subject: `Update on your ${city.domain} registration`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #475569, #0F1923); padding: 32px 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Registration Update</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 10px 0 0; font-size: 14px;">${city.domain}</p>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <p style="color: #374151; font-size: 15px;">Dear ${data.name},</p>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">Thank you for your interest in listing <strong>${data.clinic_name}</strong> on ${city.domain}. After reviewing your registration, we are unable to approve your application at this time.</p>
          ${reasonBlock}
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">If you believe this was a mistake, or if you can address the points raised above, you are welcome to submit a fresh registration. Our team is also happy to discuss your application directly — please reach out and we will help where we can.</p>
          <div style="background: #f8faff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin: 22px 0;">
            <p style="margin: 0 0 8px; color: #0F1923; font-size: 14px; font-weight: bold;">Next steps</p>
            <p style="margin: 0 0 6px; color: #374151; font-size: 14px; line-height: 1.6;">• Reapply: <a href="${city.origin}/for-dentists/register" style="color: #0057A8;">${city.domain}/for-dentists/register</a></p>
            <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">• Contact us: <a href="mailto:${ADMIN_EMAIL}" style="color: #0057A8;">${ADMIN_EMAIL}</a></p>
          </div>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">We appreciate the time you took to apply and wish you the very best with your practice.</p>
          <p style="color: #374151; font-size: 15px; margin-top: 20px;">Warm regards,<br/><strong>The ${city.domain} team</strong></p>
          <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} ${city.domain} · A Dentaura Prime LLP initiative</p>
          </div>
        </div>
      </div>
    `,
  })
}

export async function sendProfileReminderEmail(data: {
  name: string
  to_email: string
  completion_pct: number
  missing: Array<{ label: string; href: string }>
  unsubscribe_url: string
  city?: string
}) {
  const city = resolveCity(data.city)
  const missingRows = data.missing.map(item => `
    <a href="${city.origin}${item.href}" style="display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; text-decoration: none; margin-bottom: 8px;">
      <span style="display: inline-block; width: 24px; height: 24px; border-radius: 50%; background: #FEE2E2; color: #991B1B; text-align: center; line-height: 24px; font-size: 14px; font-weight: bold; flex-shrink: 0;">✗</span>
      <span style="color: #0F1923; font-size: 14px; font-weight: 600; flex: 1;">${item.label}</span>
      <span style="color: #0057A8; font-size: 13px; font-weight: 600;">Fix →</span>
    </a>
  `).join('')

  return resend.emails.send({
    from: getCityEmail(city.citySlug),
    to: data.to_email,
    subject: `Your ${city.domain} profile needs attention 🦷`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #003F7A, #0057A8); padding: 28px 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Hi ${data.name.split(' ')[0]}, your profile needs a little love 🦷</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 10px 0 0; font-size: 14px;">Your profile is <strong>${data.completion_pct}% complete</strong></p>
        </div>
        <div style="background: #f8faff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <div style="background: linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%); border: 1px solid #FDE68A; border-radius: 10px; padding: 16px 18px; margin-bottom: 22px;">
            <p style="margin: 0; color: #7C2D12; font-size: 14px; line-height: 1.5;">
              <strong>Dentists with complete profiles get 5x more patient enquiries.</strong> A few minutes today could mean a lot more bookings this week.
            </p>
          </div>

          <h3 style="margin: 0 0 12px; color: #0F1923; font-size: 15px;">Still to do:</h3>
          ${missingRows}

          <div style="text-align: center; margin-top: 24px;">
            <a href="${city.origin}/for-dentists/dashboard" style="background: #FF6135; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">Open My Dashboard →</a>
          </div>

          <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0 0 6px;">
              Don't want profile reminders? <a href="${data.unsubscribe_url}" style="color: #64748b; text-decoration: underline;">Unsubscribe</a>
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} ${city.domain} · A Dentaura Prime LLP initiative</p>
          </div>
        </div>
      </div>
    `,
  })
}

export async function sendApprovalEmail(data: {
  name: string
  clinic_name: string
  slug: string
  to_email: string
  selected_plan?: 'monthly' | 'annual' | null
  city?: string
  /** One-time magic link minted by lib/approval.ts. When present, the email
   * leads with a big "Access Your Dashboard" CTA that skips the password
   * step entirely. When null (link generation failed), the email falls back
   * to the regular login URL. */
  auth_link?: string | null
}) {
  const city = resolveCity(data.city)
  const planCopy = data.selected_plan === 'annual'
    ? { label: 'Annual', price: '₹9,999/year' }
    : data.selected_plan === 'monthly'
      ? { label: 'Monthly', price: '₹999/month' }
      : null

  const planBlock = planCopy
    ? `
          <div style="background: linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%); border: 1.5px solid #FDE68A; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            <p style="margin: 0 0 8px; color: #7C2D12; font-size: 15px; font-weight: bold;">⭐ Your Gold ${planCopy.label} plan is ready to activate</p>
            <p style="margin: 0 0 14px; color: #7C2D12; font-size: 14px; line-height: 1.6;">You selected <strong>Gold ${planCopy.label} — ${planCopy.price}</strong> at registration. Click below to complete payment and unlock priority placement, full analytics, and PMS tools.</p>
            <a href="${city.origin}/for-dentists/dashboard/upgrade?plan=${data.selected_plan}" style="display: inline-block; background: #FF6135; color: white; padding: 11px 22px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">Activate Gold ${planCopy.label} →</a>
          </div>`
    : ''

  // Lead CTA: when we have a working magic link the dentist can skip the
  // password step entirely. Without one we still ship the email — they hit
  // /for-dentists/login and use Forgot Password to recover access.
  const dashboardBlock = data.auth_link
    ? `
          <div style="background: linear-gradient(135deg, #E8F3FF 0%, #DCFCE7 100%); border: 1.5px solid #BFDBFE; border-radius: 12px; padding: 22px; margin-bottom: 24px; text-align: center;">
            <p style="margin: 0 0 6px; color: #0F1923; font-size: 15px; font-weight: 700;">🚀 Access your dashboard in one click</p>
            <p style="margin: 0 0 16px; color: #3D4F60; font-size: 14px; line-height: 1.6;">
              Click below to access your dashboard — no password needed for first login. You can set a password from your profile settings.
            </p>
            <a href="${data.auth_link}" style="display: inline-block; background: #0057A8; color: white; padding: 14px 30px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">Access Your Dashboard →</a>
            <p style="margin: 12px 0 0; color: #64748B; font-size: 12px;">This single-use link expires in 24 hours. Keep this email safe until you log in.</p>
          </div>`
    : `
          <div style="background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
            <p style="margin: 0 0 6px; color: #7C2D12; font-size: 14px; font-weight: 700;">Set up your dashboard access</p>
            <p style="margin: 0 0 12px; color: #7C2D12; font-size: 13px; line-height: 1.6;">Your account is ready. Use the "Forgot password" link on the sign-in page to set a password for the first time.</p>
            <a href="${city.origin}/for-dentists/login" style="display: inline-block; background: #FF6135; color: white; padding: 11px 22px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px;">Go to Sign In →</a>
          </div>`

  return resend.emails.send({
    from: getCityEmail(city.citySlug),
    to: data.to_email,
    subject: `🎉 Your ${city.domain} profile is LIVE!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #00A878, #0057A8); padding: 32px 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 26px;">Your Profile is Live! 🎉</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 10px 0 0;">Patients can now find and book you on ${city.domain}</p>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <p style="color: #374151; font-size: 15px;">Dear ${data.name},</p>
          <p style="color: #374151; font-size: 15px;">Great news! Your clinic <strong>${data.clinic_name}</strong> is now live on ${city.domain} and patients can find and book you directly.</p>

          ${dashboardBlock}

          <div style="text-align: center; margin: 24px 0;">
            <a href="${city.origin}/dentist/${data.slug}" style="background: #fff; color: #0057A8; border: 2px solid #0057A8; padding: 12px 26px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px;">View Your Live Profile →</a>
          </div>${planBlock}

          <div style="background: #f8faff; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #0F1923;">Complete your profile to get more patients:</h3>
            <ul style="color: #374151; font-size: 14px; padding-left: 20px; line-height: 2;">
              <li>Add your profile photo and clinic photos</li>
              <li>Add your WhatsApp number for direct leads</li>
              <li>Set your working hours</li>
              <li>Add all treatments with fee ranges</li>
            </ul>
          </div>
          <div style="margin-top: 24px; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} ${city.domain} · A Dentaura Prime LLP initiative</p>
          </div>
        </div>
      </div>
    `,
  })
}

/**
 * Sends an ad-hoc admin-authored message to a single dentist. Used by the
 * Communications tab — the API route fans these out, one call per recipient,
 * so each gets the city-branded from-address that matches their own clinic.
 *
 * The message body is treated as plain text with newlines preserved as
 * <br/>. We intentionally do not pass admin-typed HTML through verbatim:
 * admins are trusted, but a stray `<script>` or malformed tag breaks the
 * template for every recipient. Bold/italic via markdown can be a later
 * polish; for now the constraint keeps blast-radius low.
 */
export async function sendAdminBulkMessage(data: {
  to_email: string
  dentist_name: string | null
  subject: string
  message: string
  city?: string
}) {
  const city = resolveCity(data.city)
  const safeBody = escapeHtml(data.message).replace(/\n/g, '<br/>')
  const greeting = data.dentist_name
    ? `Hi ${escapeHtml(data.dentist_name.split(' ')[0])},`
    : 'Hello,'
  return resend.emails.send({
    from: getCityEmail(city.citySlug),
    to: data.to_email,
    subject: data.subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #003F7A, #0057A8); padding: 24px 20px; border-radius: 10px 10px 0 0;">
          <h1 style="color: #fff; margin: 0; font-size: 18px; font-family: Arial, sans-serif;">${city.domain}</h1>
        </div>
        <div style="background: #fff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <p style="color: #374151; font-size: 15px; margin: 0 0 14px;">${greeting}</p>
          <div style="color: #374151; font-size: 15px; line-height: 1.7;">${safeBody}</div>
          <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center;">
            <a href="${city.origin}/for-dentists/dashboard" style="display: inline-block; background: #0057A8; color: #fff; padding: 11px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px;">Open Dashboard →</a>
          </div>
          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 20px 0 0;">
            © ${new Date().getFullYear()} ${city.domain} · A Dentaura Prime LLP initiative
          </p>
        </div>
      </div>
    `,
  })
}

// Minimal HTML escape — covers the five characters that can break the
// surrounding template. We're not trying to neutralise XSS for untrusted
// input here; admins are trusted. The goal is to keep stray `<` `>` `&`
// from rendering as broken markup when an admin types something like
// "fees < ₹500" in the message body.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
