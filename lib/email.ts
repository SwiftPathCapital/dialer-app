interface SendEmailParams {
  to: string
  subject: string
  body: string
}

// STUB — no email provider is connected yet. Once one is (Resend, SendGrid, etc.),
// replace this function's body with the real API call. Everything that calls
// sendEmail() (lib/workflows.ts) already has the right shape and will work
// unchanged once this is filled in — no caller-side changes needed.
//
// Example for Resend:
//   import { Resend } from 'resend'
//   const resend = new Resend(await getConfigValue('resend_api_key'))
//   await resend.emails.send({ from: '...', to, subject, html: body })
//
// Follow the same app_config pattern lib/telnyx.ts uses for API keys — add a
// row via the admin config page, read it here, never hardcode a key.
export async function sendEmail({ to, subject, body }: SendEmailParams): Promise<void> {
  throw new Error(`Email is not connected yet — cannot send "${subject}" to ${to}. Wire up a provider in lib/email.ts.`)
}
