/**
 * invite — Supabase Edge Function
 *
 * Creates a Supabase invite for a new user and returns the magic link.
 * Called when a plant admin approves a pending invite.
 *
 * POST body:
 *   { action: 'send_invite', invite_id: string }
 *
 * Security: The invite must already have status='approved' in plant_invites.
 * Only plant admins can set that status (enforced by RLS).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })

  try {
    const body = await req.json().catch(() => null)
    if (!body) return json({ error: 'Body must be JSON' }, 400)

    const { action, invite_id } = body as { action?: string; invite_id?: string }

    if (action !== 'send_invite' || !invite_id) {
      return json({ error: 'Required: { action: "send_invite", invite_id: string }' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // ── Fetch the invite ─────────────────────────────────────────────────────
    const { data: invite, error: invErr } = await admin
      .from('plant_invites')
      .select('id, plant_id, email, status')
      .eq('id', invite_id)
      .single()

    if (invErr || !invite) {
      console.error('[invite] Not found:', invite_id, invErr?.message)
      return json({ error: 'Invite not found' }, 404)
    }
    if (invite.status !== 'approved') {
      return json({ error: `Invite status is '${invite.status}', must be 'approved'` }, 400)
    }

    // ── Check if user already has an account ─────────────────────────────────
    const { data: existingUserId } = await admin
      .rpc('get_user_id_by_email', { lookup_email: invite.email })

    if (existingUserId) {
      // User already has an account — create membership and send notification email
      const { error: mErr } = await admin.from('plant_memberships').upsert(
        { user_id: existingUserId, plant_id: invite.plant_id, role: 'contributor' },
        { onConflict: 'user_id,plant_id' }
      )
      if (mErr) console.error('[invite] membership upsert error:', mErr.message)

      // Send notification email
      const { data: plant } = await admin.from('plants').select('name').eq('id', invite.plant_id).single()
      const plantName = plant?.name || 'a Knowledge Bank'
      const resendKey = Deno.env.get('RESEND_API_KEY')
      if (resendKey) {
        try {
          const origin = req.headers.get('origin') || 'https://md1.app'
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'M/D/1 <noreply@md1.app>',
              to: [invite.email],
              subject: `You've been approved to join ${plantName} on M/D/1`,
              html: `
                <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
                  <div style="text-align: center; margin-bottom: 32px;">
                    <div style="display: inline-block; font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #062044; border: 2px solid #062044; padding: 5px 14px 7px;">M/D/1</div>
                  </div>
                  <h2 style="font-size: 18px; font-weight: 700; color: #062044; margin-bottom: 8px;">You've been approved</h2>
                  <p style="font-size: 14px; color: #5a5550; line-height: 1.6; margin-bottom: 24px;">
                    An admin has approved your access to <strong>${plantName}</strong> on M/D/1. Log in to start contributing.
                  </p>
                  <div style="text-align: center; margin-bottom: 24px;">
                    <a href="${origin}/auth" style="display: inline-block; padding: 12px 32px; background: #062044; color: #ffffff; text-decoration: none; border-radius: 3px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px;">
                      Log In
                    </a>
                  </div>
                  <hr style="border: none; border-top: 1px solid #e8e4e0; margin: 24px 0;" />
                  <p style="font-size: 10px; color: #b0a898; text-align: center;">M/D/1 — The operational brain that never retires.</p>
                </div>
              `,
            }),
          })
          console.log(`[invite] Approval email sent to existing user ${invite.email}`)
        } catch (emailErr) {
          console.error('[invite] Approval email error:', emailErr)
        }
      }

      console.log(`[invite] User ${invite.email} already exists — membership created + notified`)
      return json({ sent: true, reason: 'user_exists', membership_created: true })
    }

    // ── Generate invite link ─────────────────────────────────────────────────
    const origin = req.headers.get('origin') || 'https://md1.app'
    const redirectTo = `${origin}/auth`

    console.log(`[invite] Generating invite link for ${invite.email}`)

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: invite.email,
      options: { redirectTo },
    })

    if (linkErr) {
      console.error('[invite] generateLink error:', JSON.stringify(linkErr))
      return json({ error: linkErr.message }, 500)
    }

    // Build the verification URL from the token
    const token = linkData?.properties?.hashed_token
    const actionLink = token
      ? `${supabaseUrl}/auth/v1/verify?token=${token}&type=invite&redirect_to=${encodeURIComponent(redirectTo)}`
      : null

    // Get plant name for the email
    const { data: plant } = await admin
      .from('plants')
      .select('name')
      .eq('id', invite.plant_id)
      .single()
    const plantName = plant?.name || 'a Knowledge Bank'

    // ── Send invite email via Resend ─────────────────────────────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY')
    let emailSent = false

    if (resendKey && actionLink) {
      try {
        const emailResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'M/D/1 <noreply@md1.app>',
            to: [invite.email],
            subject: `You've been invited to ${plantName} on M/D/1`,
            html: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
                <div style="text-align: center; margin-bottom: 32px;">
                  <div style="display: inline-block; font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #062044; border: 2px solid #062044; padding: 5px 14px 7px;">M/D/1</div>
                </div>
                <h2 style="font-size: 18px; font-weight: 700; color: #062044; margin-bottom: 8px;">You're invited to ${plantName}</h2>
                <p style="font-size: 14px; color: #5a5550; line-height: 1.6; margin-bottom: 24px;">
                  A colleague has invited you to join their Knowledge Bank on M/D/1. Click the button below to create your account and set a password.
                </p>
                <div style="text-align: center; margin-bottom: 24px;">
                  <a href="${actionLink}" style="display: inline-block; padding: 12px 32px; background: #062044; color: #ffffff; text-decoration: none; border-radius: 3px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px;">
                    Accept Invite
                  </a>
                </div>
                <p style="font-size: 11px; color: #b0a898; line-height: 1.5;">
                  If the button doesn't work, copy and paste this link into your browser:<br/>
                  <a href="${actionLink}" style="color: #4FA89A; word-break: break-all;">${actionLink}</a>
                </p>
                <hr style="border: none; border-top: 1px solid #e8e4e0; margin: 24px 0;" />
                <p style="font-size: 10px; color: #b0a898; text-align: center;">
                  M/D/1 — The operational brain that never retires.
                </p>
              </div>
            `,
          }),
        })
        const emailResult = await emailResp.json()
        emailSent = emailResp.ok
        console.log(`[invite] Resend HTTP ${emailResp.status}: ${JSON.stringify(emailResult)}`)
        if (!emailResp.ok) {
          console.error('[invite] Resend error:', JSON.stringify(emailResult))
          // Surface the Resend error in the response
          return json({
            sent: false,
            action_link: actionLink,
            user_id: linkData?.user?.id,
            resend_error: emailResult,
          })
        } else {
          console.log(`[invite] Email sent to ${invite.email} via Resend (id: ${emailResult.id})`)
        }
      } catch (emailErr) {
        console.error('[invite] Resend fetch error:', emailErr)
      }
    } else if (!resendKey) {
      console.warn('[invite] RESEND_API_KEY not set — email not sent')
    }

    console.log(`[invite] Created invite for ${invite.email}, user_id=${linkData?.user?.id}, emailSent=${emailSent}`)

    return json({
      sent: emailSent,
      user_id: linkData?.user?.id,
      action_link: actionLink,
    })

  } catch (err) {
    console.error('[invite] Unhandled error:', err)
    return json({ error: String(err) }, 500)
  }
})
