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
      const { error: mErr } = await admin.from('plant_memberships').upsert(
        { user_id: existingUserId, plant_id: invite.plant_id, role: 'contributor' },
        { onConflict: 'user_id,plant_id' }
      )
      if (mErr) console.error('[invite] membership upsert error:', mErr.message)
      console.log(`[invite] User ${invite.email} already exists — membership created`)
      return json({ sent: false, reason: 'user_exists', membership_created: true })
    }

    // ── Generate invite link ─────────────────────────────────────────────────
    // This creates the auth user and returns a magic link.
    // The user clicks it → lands on the app → sets password.
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

    console.log(`[invite] Created invite for ${invite.email}, user_id=${linkData?.user?.id}`)

    return json({
      sent: true,
      user_id: linkData?.user?.id,
      action_link: actionLink,
    })

  } catch (err) {
    console.error('[invite] Unhandled error:', err)
    return json({ error: String(err) }, 500)
  }
})
