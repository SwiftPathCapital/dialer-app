import type { createServerClient } from './supabase'
import { sendSms } from './sms'
import { sendEmail, isEmailConfigured } from './email'
import { getAppUrl } from './telnyx'

type Db = ReturnType<typeof createServerClient>

// Delivers a signing link by text (from the sending agent's line) or email.
export async function deliverSigningLink(db: Db, c: {
  tenantId: string; agentId: string; delivery: 'sms' | 'email'; token: string
  signerName: string; signerEmail: string | null; signerPhone: string | null; templateName: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [{ data: tenant }, { data: agent }, appUrl] = await Promise.all([
    db.from('tenants').select('name').eq('id', c.tenantId).maybeSingle(),
    db.from('agents').select('did').eq('id', c.agentId).maybeSingle(),
    getAppUrl(),
  ])
  const business = tenant?.name || 'Your representative'
  const url = `${appUrl.replace(/\/$/, '')}/sign/${c.token}`
  const firstName = c.signerName.split(/\s+/)[0]

  try {
    if (c.delivery === 'sms') {
      if (!c.signerPhone) return { ok: false, error: 'Add the signer\'s phone number to send by text.' }
      if (!agent?.did) return { ok: false, error: 'Your login has no phone number to text from. Ask an admin to set your number.' }
      await sendSms({ from: agent.did, to: c.signerPhone, agentId: c.agentId, body: `Hi ${firstName}, ${business} sent you "${c.templateName}" to review and sign: ${url}` })
    } else {
      if (!isEmailConfigured()) return { ok: false, error: 'Email isn\'t connected yet. Send by text for now.' }
      if (!c.signerEmail) return { ok: false, error: 'Add the signer\'s email to send by email.' }
      await sendEmail({ to: c.signerEmail, subject: `${business}: please sign "${c.templateName}"`, body: `Hi ${firstName},\n\n${business} sent you "${c.templateName}" to review and sign:\n${url}\n\nThis link expires in 30 days.` })
    }
    return { ok: true }
  } catch (err) {
    console.error('[contracts] delivery failed', err)
    return { ok: false, error: `Couldn't send the ${c.delivery === 'sms' ? 'text' : 'email'}: ${err instanceof Error ? err.message : 'unknown error'}` }
  }
}
