import type { createServerClient } from './supabase'
import { sendSms } from './sms'
import { sendEmail, isEmailConfigured, escapeHtml } from './email'
import { getAppUrl } from './telnyx'

type Db = ReturnType<typeof createServerClient>

// Delivers a signing link by text (from the sending agent's line) or email.
export async function deliverSigningLink(db: Db, c: {
  tenantId: string; agentId: string; delivery: 'sms' | 'email'; token: string
  signerName: string; signerEmail: string | null; signerPhone: string | null; templateName: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [{ data: tenant }, { data: agent }, appUrl] = await Promise.all([
    db.from('tenants').select('name').eq('id', c.tenantId).maybeSingle(),
    db.from('agents').select('did, email').eq('id', c.agentId).maybeSingle(),
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
      if (!(await isEmailConfigured(c.tenantId))) return { ok: false, error: 'Email isn\'t set up for this account yet. Send by text for now.' }
      if (!c.signerEmail) return { ok: false, error: 'Add the signer\'s email to send by email.' }
      const text = `Hi ${firstName},\n\n${business} sent you "${c.templateName}" to review and sign:\n${url}\n\nThis link expires in 30 days.`
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:520px">`
        + `<p>Hi ${escapeHtml(firstName)},</p>`
        + `<p>${escapeHtml(business)} sent you <strong>${escapeHtml(c.templateName)}</strong> to review and sign.</p>`
        + `<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="background:#0891b2;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">Review &amp; sign</a></p>`
        + `<p style="color:#555;font-size:13px">Or open this link: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a><br>This link expires in 30 days.</p></div>`
      // Replies go to the agent who sent it (when their login has an email), else the account's reply-to.
      await sendEmail({ tenantId: c.tenantId, to: c.signerEmail, subject: `${business}: please sign "${c.templateName}"`, text, html, replyTo: agent?.email || null })
    }
    return { ok: true }
  } catch (err) {
    console.error('[contracts] delivery failed', err)
    return { ok: false, error: `Couldn't send the ${c.delivery === 'sms' ? 'text' : 'email'}: ${err instanceof Error ? err.message : 'unknown error'}` }
  }
}
