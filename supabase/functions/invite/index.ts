/**
 * invite — Supabase Edge Function
 *
 * Sends a plant invite email via Resend, given a plant_invites.token.
 * The invite must already be in status='approved' for the email to send.
 *
 * POST body:
 *   { token: string }
 *
 * The accept link is hardcoded to https://md1.app/accept-invite?token=...
 * (never the request origin — preview deploys would create broken links).
 *
 * If the recipient already has an MD1 account, the email tells them to log in
 * to accept. If not, the email links them to a signup form.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_DOMAIN = 'https://md1.app'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function emailHtml(args: {
  plantName: string
  acceptUrl: string
  recipientHasAccount: boolean
}) {
  const { plantName, acceptUrl, recipientHasAccount } = args
  const headline = recipientHasAccount
    ? `You've been invited to ${plantName}`
    : `You've been invited to ${plantName} on M/D/1`
  const body = recipientHasAccount
    ? `A colleague invited you to join <strong>${plantName}</strong> on M/D/1. You already have an account — click the button below to log in and accept the invite.`
    : `A colleague invited you to join <strong>${plantName}</strong> on M/D/1. Click below to create your account and start contributing.`
  const cta = recipientHasAccount ? 'Accept Invite' : 'Create Account & Join'

  return `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #062044; border: 2px solid #062044; padding: 5px 14px 7px;">M/D/1</div>
      </div>
      <h2 style="font-size: 18px; font-weight: 700; color: #062044; margin-bottom: 8px;">${headline}</h2>
      <p style="font-size: 14px; color: #5a5550; line-height: 1.6; margin-bottom: 24px;">${body}</p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${acceptUrl}" style="display: inline-block; padding: 12px 32px; background: #062044; color: #ffffff; text-decoration: none; border-radius: 3px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px;">${cta}</a>
      </div>
      <p style="font-size: 11px; color: #b0a898; line-height: 1.5;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${acceptUrl}" style="color: #4FA89A; word-break: break-all;">${acceptUrl}</a>
      </p>
      <p style="font-size: 10px; color: #b0a898; line-height: 1.5; margin-top: 16px;">
        This invite expires in 7 days. If you weren't expecting it, you can ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e8e4e0; margin: 24px 0;" />
      <p style="font-size: 10px; color: #b0a898; text-align: center;">M/D/1 — The operational brain that never retires.</p>
    </div>
  `
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })

  try {
    const body = await req.json().catch(() => null)
    if (!body) return json({ error: 'Body must be JSON' }, 400)

    const { token } = body as { token?: string }
    if (!token) return json({ error: 'Required: { token: string }' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // Fetch the invite by token
    const { data: invite, error: invErr } = await admin
      .from('plant_invites')
      .select('id, plant_id, recipient_email, status, expires_at')
      .eq('token', token)
      .single()

    if (invErr || !invite) {
      console.error('[invite] Not found by token:', invErr?.message)
      return json({ error: 'Invite not found' }, 404)
    }
    if (invite.status !== 'approved') {
      return json({ error: `Invite status is '${invite.status}', must be 'approved' to send email.` }, 400)
    }
    if (new Date(invite.expires_at) < new Date()) {
      await admin.from('plant_invites').update({ status: 'expired' }).eq('id', invite.id)
      return json({ error: 'Invite has expired' }, 400)
    }

    // Plant name for the email
    const { data: plant } = await admin
      .from('plants')
      .select('name')
      .eq('id', invite.plant_id)
      .single()
    const plantName = plant?.name || 'a plant on M/D/1'

    // Does the recipient already have an MD1 account?
    const { data: existingUserId } = await admin
      .rpc('get_user_id_by_email', { lookup_email: invite.recipient_email })
    const recipientHasAccount = !!existingUserId

    const acceptUrl = `${APP_DOMAIN}/accept-invite?token=${encodeURIComponent(token)}`
    const subject = `You've been invited to ${plantName} on M/D/1`

    // Send via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      console.error('[invite] RESEND_API_KEY not set')
      return json({ sent: false, accept_url: acceptUrl, error: 'Email provider not configured' }, 500)
    }

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'M/D/1 <noreply@md1.app>',
        to: [invite.recipient_email],
        subject,
        html: emailHtml({ plantName, acceptUrl, recipientHasAccount }),
      }),
    })
    const emailResult = await emailResp.json().catch(() => ({}))

    if (!emailResp.ok) {
      console.error('[invite] Resend error:', JSON.stringify(emailResult))
      return json({ sent: false, accept_url: acceptUrl, resend_error: emailResult }, 500)
    }

    console.log(`[invite] Email sent to ${invite.recipient_email} for plant ${plantName} (id=${emailResult?.id})`)
    return json({
      sent: true,
      accept_url: acceptUrl,
      recipient_has_account: recipientHasAccount,
      resend_id: emailResult?.id || null,
    })

  } catch (err) {
    console.error('[invite] Unhandled error:', err)
    return json({ error: String(err) }, 500)
  }
})
