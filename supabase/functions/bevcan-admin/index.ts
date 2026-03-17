/**
 * bevcan-admin — Supabase Edge Function
 *
 * Admin-only API for managing BevCan 1.0 membership applications and members.
 * Uses the service role key to bypass RLS.
 *
 * POST body:
 *   { action: 'list' }
 *   { action: 'approve',        application_id: string }
 *   { action: 'reject',         application_id: string }
 *   { action: 'reapprove',      application_id: string }
 *   { action: 'list_members' }
 *   { action: 'change_role',    membership_id: string, role: string }
 *   { action: 'remove_member',  membership_id: string }
 *   { action: 'get_stats' }
 *   { action: 'list_all_plants' }
 *
 * Admin check: caller's email must be in ADMIN_EMAILS or is_super_admin=true in profiles.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BEVCAN_PLANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

// Fallback email whitelist (also checked via is_super_admin DB flag)
const ADMIN_EMAILS = ['mw@korfsteel.com']

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })

  console.log(`[bevcan-admin] ${req.method} ${req.url}`)

  try {
    // ── Validate JWT and extract caller identity ──────────────────────────────
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ error: 'Unauthorized' }, 401)

    let callerEmail: string
    let callerUserId: string
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      callerEmail = payload.email || ''
      callerUserId = payload.sub || ''
    } catch {
      return json({ error: 'Invalid token' }, 401)
    }

    // ── Service role client ───────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // ── Admin check: email whitelist OR is_super_admin in profiles ────────────
    let isAdmin = ADMIN_EMAILS.includes(callerEmail)
    if (!isAdmin && callerUserId) {
      const { data: prof } = await admin
        .from('profiles')
        .select('is_super_admin')
        .eq('user_id', callerUserId)
        .single()
      isAdmin = prof?.is_super_admin === true
    }
    if (!isAdmin) {
      console.warn(`[bevcan-admin] Rejected non-admin caller: ${callerEmail}`)
      return json({ error: 'Forbidden' }, 403)
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: { action?: string; application_id?: string; membership_id?: string; role?: string }
    try { body = await req.json() }
    catch { return json({ error: 'Body must be JSON' }, 400) }

    const { action, application_id, membership_id, role } = body
    console.log(`[bevcan-admin] action=${action}`)

    // ── LIST applications ─────────────────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await admin
        .from('bevcan_applications')
        .select('*')
        .order('applied_at', { ascending: false })
      if (error) throw new Error(error.message)
      return json({ applications: data ?? [] })
    }

    // ── APPROVE ───────────────────────────────────────────────────────────────
    if (action === 'approve' || action === 'reapprove') {
      if (!application_id) return json({ error: 'application_id required' }, 400)

      const { data: app, error: appErr } = await admin
        .from('bevcan_applications')
        .select('*')
        .eq('id', application_id)
        .single()
      if (appErr || !app) return json({ error: 'Application not found' }, 404)

      // Create plant membership (contributor role)
      const { error: mErr } = await admin
        .from('plant_memberships')
        .insert({ user_id: app.user_id, plant_id: BEVCAN_PLANT_ID, role: 'contributor' })
        .select()
        .single()
      if (mErr && mErr.code !== '23505') throw new Error('Failed to create membership: ' + mErr.message)

      // Update application status
      const { error: upErr } = await admin
        .from('bevcan_applications')
        .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: callerEmail })
        .eq('id', application_id)
      if (upErr) throw new Error(upErr.message)

      console.log(`[bevcan-admin] Approved application ${application_id} for user ${app.user_id}`)
      return json({ ok: true })
    }

    // ── REJECT ────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      if (!application_id) return json({ error: 'application_id required' }, 400)

      const { error: upErr } = await admin
        .from('bevcan_applications')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: callerEmail })
        .eq('id', application_id)
      if (upErr) throw new Error(upErr.message)

      console.log(`[bevcan-admin] Rejected application ${application_id}`)
      return json({ ok: true })
    }

    // ── LIST MEMBERS ──────────────────────────────────────────────────────────
    if (action === 'list_members') {
      // Get all memberships for BevCan plant
      const { data: memberships, error: mErr } = await admin
        .from('plant_memberships')
        .select('id, user_id, role, joined_at')
        .eq('plant_id', BEVCAN_PLANT_ID)
        .order('joined_at', { ascending: false })
      if (mErr) throw new Error(mErr.message)

      const userIds = (memberships ?? []).map((m: any) => m.user_id)
      if (userIds.length === 0) return json({ members: [] })

      // Get applications for these users (full profile info)
      const [appsResult, profilesResult, rulesResult] = await Promise.all([
        admin.from('bevcan_applications')
          .select('user_id, full_name, email, nickname, current_position, current_company, year_joined_industry, status')
          .in('user_id', userIds),
        admin.from('profiles')
          .select('user_id, display_name')
          .in('user_id', userIds),
        admin.from('rules')
          .select('created_by')
          .eq('plant_id', BEVCAN_PLANT_ID),
      ])

      const appMap: Record<string, any> = {}
      appsResult.data?.forEach((a: any) => { appMap[a.user_id] = a })

      const profileMap: Record<string, string> = {}
      profilesResult.data?.forEach((p: any) => { profileMap[p.user_id] = p.display_name })

      // Count rules per display name
      const rulesByName: Record<string, number> = {}
      rulesResult.data?.forEach((r: any) => {
        rulesByName[r.created_by] = (rulesByName[r.created_by] || 0) + 1
      })

      const members = (memberships ?? []).map((m: any) => {
        const app = appMap[m.user_id] || {}
        const displayName = profileMap[m.user_id] || app.nickname || 'Unknown'
        return {
          membershipId: m.id,
          userId: m.user_id,
          role: m.role,
          joinedAt: m.joined_at,
          displayName,
          email: app.email || '',
          fullName: app.full_name || '',
          nickname: app.nickname || displayName,
          currentPosition: app.current_position || '',
          currentCompany: app.current_company || '',
          yearJoined: app.year_joined_industry || null,
          ruleCount: rulesByName[displayName] || 0,
        }
      })

      return json({ members })
    }

    // ── CHANGE ROLE ───────────────────────────────────────────────────────────
    if (action === 'change_role') {
      if (!membership_id) return json({ error: 'membership_id required' }, 400)
      if (!role) return json({ error: 'role required' }, 400)
      if (!['admin', 'contributor', 'viewer'].includes(role)) return json({ error: 'Invalid role' }, 400)

      const { error: upErr } = await admin
        .from('plant_memberships')
        .update({ role })
        .eq('id', membership_id)
        .eq('plant_id', BEVCAN_PLANT_ID) // safety: only BevCan memberships
      if (upErr) throw new Error(upErr.message)

      return json({ ok: true })
    }

    // ── REMOVE MEMBER ─────────────────────────────────────────────────────────
    if (action === 'remove_member') {
      if (!membership_id) return json({ error: 'membership_id required' }, 400)

      const { error: delErr } = await admin
        .from('plant_memberships')
        .delete()
        .eq('id', membership_id)
        .eq('plant_id', BEVCAN_PLANT_ID) // safety: only BevCan memberships
      if (delErr) throw new Error(delErr.message)

      return json({ ok: true })
    }

    // ── GET STATS ─────────────────────────────────────────────────────────────
    if (action === 'get_stats') {
      const [membCount, ruleCount, assertCount, eventCount, qCount, topContribs] = await Promise.all([
        admin.from('plant_memberships').select('id', { count: 'exact', head: true }).eq('plant_id', BEVCAN_PLANT_ID),
        admin.from('rules').select('id', { count: 'exact', head: true }).eq('plant_id', BEVCAN_PLANT_ID),
        admin.from('assertions').select('id', { count: 'exact', head: true }).eq('plant_id', BEVCAN_PLANT_ID),
        admin.from('events').select('id', { count: 'exact', head: true }).eq('plant_id', BEVCAN_PLANT_ID),
        admin.from('questions').select('id', { count: 'exact', head: true }).eq('plant_id', BEVCAN_PLANT_ID),
        // Top contributors by rule count
        admin.from('rules').select('created_by').eq('plant_id', BEVCAN_PLANT_ID),
      ])

      // Aggregate top contributors
      const contribCounts: Record<string, number> = {}
      topContribs.data?.forEach((r: any) => {
        contribCounts[r.created_by] = (contribCounts[r.created_by] || 0) + 1
      })
      const topContributors = Object.entries(contribCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))

      return json({
        stats: {
          members: membCount.count ?? 0,
          rules: ruleCount.count ?? 0,
          assertions: assertCount.count ?? 0,
          events: eventCount.count ?? 0,
          questions: qCount.count ?? 0,
          topContributors,
        },
      })
    }

    // ── LIST ALL PLANTS ───────────────────────────────────────────────────────
    if (action === 'list_all_plants') {
      const { data: plants, error: pErr } = await admin
        .from('plants')
        .select('id, name, industry, org_id, created_at')
        .order('created_at', { ascending: false })
      if (pErr) throw new Error(pErr.message)

      const plantIds = (plants ?? []).map((p: any) => p.id)
      const [membCounts, ruleCounts, orgResult] = await Promise.all([
        admin.from('plant_memberships').select('plant_id').in('plant_id', plantIds),
        admin.from('rules').select('plant_id').in('plant_id', plantIds),
        admin.from('organisations').select('id, name'),
      ])

      const membByPlant: Record<string, number> = {}
      membCounts.data?.forEach((m: any) => {
        membByPlant[m.plant_id] = (membByPlant[m.plant_id] || 0) + 1
      })
      const rulesByPlant: Record<string, number> = {}
      ruleCounts.data?.forEach((r: any) => {
        rulesByPlant[r.plant_id] = (rulesByPlant[r.plant_id] || 0) + 1
      })
      const orgMap: Record<string, string> = {}
      orgResult.data?.forEach((o: any) => { orgMap[o.id] = o.name })

      const result = (plants ?? []).map((p: any) => ({
        plantId: p.id,
        name: p.name,
        industry: p.industry || '',
        orgName: orgMap[p.org_id] || '',
        memberCount: membByPlant[p.id] || 0,
        ruleCount: rulesByPlant[p.id] || 0,
        createdAt: p.created_at,
      }))

      return json({ plants: result })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err) {
    const message = (err as Error).message
    console.error(`[bevcan-admin] Unhandled error: ${message}`)
    return json({ error: message }, 500)
  }
})
