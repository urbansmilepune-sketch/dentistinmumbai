import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = 'hello@dentistinmumbai.in'
const ADMIN_EMAIL = 'dentistinmumbaiapp@gmail.com'

export async function sendRegistrationEmailToAdmin(data: {
  name: string
  clinic_name: string
  area: string
  phone: string
  email: string
  qualification: string
  ref_no: string
}) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `🦷 New Dentist Registration — ${data.name} | ${data.ref_no}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #0057A8; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">New Dentist Registration</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">dentistinmumbai.in</p>
        </div>
        <div style="background: #f8faff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 40%;">Reference</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0057A8;">${data.ref_no}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Name</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${data.name}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Clinic</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${data.clinic_name}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Area</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${data.area}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Phone</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${data.phone}</td></tr>
            <tr><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b;">Email</td><td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">${data.email}</td></tr>
            <tr><td style="padding: 10px 0; color: #64748b;">Qualification</td><td style="padding: 10px 0;">${data.qualification}</td></tr>
          </table>
          <div style="margin-top: 24px; text-align: center;">
            <a href="https://www.dentistinmumbai.in/admin" style="background: #0057A8; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Review in Admin Panel →</a>
          </div>
        </div>
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
}) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to: data.to_email,
    subject: `Welcome to DentistInMumbai.in — Your Registration is Confirmed!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #003F7A, #0057A8); padding: 32px 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 26px;">Welcome, ${data.name.split(' ')[0]}! 🎉</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 10px 0 0; font-size: 15px;">Your registration on dentistinmumbai.in is confirmed</p>
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
            <a href="https://www.dentistinmumbai.in/for-dentists/login" style="background: #FF6135; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">Access Your Dashboard →</a>
          </div>
          <div style="margin-top: 24px; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px;">Questions? WhatsApp us at <a href="https://wa.me/917719903232" style="color: #0057A8;">+91 7719903232</a></p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 4px;">© 2026 dentistinmumbai.in · A Dentaura Prime LLP initiative</p>
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
}) {
  // Reason is admin free-form text; render in a pre-wrap block so newlines
  // survive and any stray HTML chars don't break the layout.
  const safeReason = (data.reason || '').trim()
  const reasonBlock = safeReason
    ? `
          <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
            <p style="margin: 0 0 6px; color: #991B1B; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Reason from our team</p>
            <p style="margin: 0; color: #7F1D1D; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${safeReason.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>`
    : ''

  return resend.emails.send({
    from: FROM_EMAIL,
    to: data.to_email,
    subject: 'Update on your DentistInMumbai.in registration',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #475569, #0F1923); padding: 32px 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Registration Update</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 10px 0 0; font-size: 14px;">dentistinmumbai.in</p>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <p style="color: #374151; font-size: 15px;">Dear ${data.name},</p>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">Thank you for your interest in listing <strong>${data.clinic_name}</strong> on dentistinmumbai.in. After reviewing your registration, we are unable to approve your application at this time.</p>
          ${reasonBlock}
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">If you believe this was a mistake, or if you can address the points raised above, you are welcome to submit a fresh registration. Our team is also happy to discuss your application directly — please reach out and we will help where we can.</p>
          <div style="background: #f8faff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin: 22px 0;">
            <p style="margin: 0 0 8px; color: #0F1923; font-size: 14px; font-weight: bold;">Next steps</p>
            <p style="margin: 0 0 6px; color: #374151; font-size: 14px; line-height: 1.6;">• Reapply: <a href="https://www.dentistinmumbai.in/for-dentists/register" style="color: #0057A8;">dentistinmumbai.in/for-dentists/register</a></p>
            <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">• Contact us: <a href="mailto:dentistinmumbaiapp@gmail.com" style="color: #0057A8;">dentistinmumbaiapp@gmail.com</a></p>
          </div>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">We appreciate the time you took to apply and wish you the very best with your practice.</p>
          <p style="color: #374151; font-size: 15px; margin-top: 20px;">Warm regards,<br/><strong>The DentistInMumbai.in team</strong></p>
          <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">© 2026 dentistinmumbai.in · A Dentaura Prime LLP initiative</p>
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
}) {
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
            <a href="https://www.dentistinmumbai.in/for-dentists/dashboard/upgrade?plan=${data.selected_plan}" style="display: inline-block; background: #FF6135; color: white; padding: 11px 22px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">Activate Gold ${planCopy.label} →</a>
          </div>`
    : ''

  return resend.emails.send({
    from: FROM_EMAIL,
    to: data.to_email,
    subject: `🎉 Your DentistInMumbai.in profile is LIVE!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #00A878, #0057A8); padding: 32px 20px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 26px;">Your Profile is Live! 🎉</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 10px 0 0;">Patients can now find and book you on dentistinmumbai.in</p>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <p style="color: #374151; font-size: 15px;">Dear ${data.name},</p>
          <p style="color: #374151; font-size: 15px;">Great news! Your clinic <strong>${data.clinic_name}</strong> is now live on dentistinmumbai.in and patients can find and book you directly.</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="https://www.dentistinmumbai.in/dentist/${data.slug}" style="background: #0057A8; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">View Your Live Profile →</a>
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
          <div style="text-align: center;">
            <a href="https://www.dentistinmumbai.in/for-dentists/login" style="background: #FF6135; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">Complete Your Profile →</a>
          </div>
          <div style="margin-top: 24px; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px;">© 2026 dentistinmumbai.in · A Dentaura Prime LLP initiative</p>
          </div>
        </div>
      </div>
    `,
  })
}
