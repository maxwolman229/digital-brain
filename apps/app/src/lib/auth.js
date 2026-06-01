import { supabase, storeJwt, storeRefreshToken, clearJwt, getStoredJwt } from './supabase.js'
import { setUserContext, clearUserContext } from './userContext.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ─── Raw auth helper ──────────────────────────────────────────────────────────
// Bypasses supabase-js auth (which hangs with sb_publishable_* keys).

async function rawSignIn(email, password) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)

  const resp = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  clearTimeout(timer)

  const json = await resp.json()

  if (!resp.ok) {
    throw new Error(json.error_description || json.msg || json.message || `Auth failed (${resp.status})`)
  }

  storeJwt(json.access_token)
  if (json.refresh_token) storeRefreshToken(json.refresh_token)
  return json // { access_token, refresh_token, user, ... }
}

// ─── Sign in ──────────────────────────────────────────────────────────────────

export async function signIn(email, password) {
  const data = await rawSignIn(email, password)
  return { user: data.user, session: data }
}

// ─── Sign up ──────────────────────────────────────────────────────────────────

export async function signUp(email, password) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)

  const resp = await fetch(SUPABASE_URL + '/auth/v1/signup', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  clearTimeout(timer)

  const json = await resp.json()

  if (!resp.ok) {
    throw new Error(json.error_description || json.msg || json.message || `Signup failed (${resp.status})`)
  }

  // When email confirmation is required, Supabase returns the user but no access_token.
  // The user must click the confirmation link before they can sign in.
  if (json.access_token) {
    storeJwt(json.access_token)
    if (json.refresh_token) storeRefreshToken(json.refresh_token)
    return { user: json.user || json, session: json, needsConfirmation: false }
  }

  // No access_token = confirmation required
  return { user: json.user || json, session: null, needsConfirmation: true }
}

// ─── Resend confirmation email ───────────────────────────────────────────────

export async function resendConfirmationEmail(email) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  const resp = await fetch(SUPABASE_URL + '/auth/v1/resend', {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'signup', email }),
  })
  clearTimeout(timer)

  if (!resp.ok) {
    const json = await resp.json().catch(() => ({}))
    throw new Error(json.error_description || json.msg || json.message || 'Failed to resend')
  }
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut() {
  clearUserContext()
  clearJwt()
}

// ─── Load profile ─────────────────────────────────────────────────────────────
// Uses raw fetch to avoid supabase-js getSession() hanging internally.

export async function loadProfile(userId) {
  const jwt = getStoredJwt()
  if (!jwt) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)

  let resp
  try {
    resp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
      {
        signal: controller.signal,
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + jwt,
          'Accept': 'application/json',
        },
      }
    )
  } finally {
    clearTimeout(timer)
  }

  if (!resp.ok) return null
  const rows = await resp.json()
  const data = Array.isArray(rows) ? rows[0] : rows
  if (!data) return null

  setUserContext({
    plantId: data.plant_id,
    displayName: data.display_name,
    orgId: data.org_id,
    userId,
    role: data.role || 'member',
  })

  return {
    id: data.id,
    userId: data.user_id,
    displayName: data.display_name,
    role: data.role || 'member',
    plantId: data.plant_id,
    orgId: data.org_id,
  }
}

// ─── Restore session from storage ─────────────────────────────────────────────
// Used by App.jsx on mount instead of the hanging supabase.auth.getSession().

export function getRestoredSession() {
  const jwt = getStoredJwt()
  if (!jwt) return null
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.exp && payload.exp < Date.now() / 1000) {
      clearJwt()
      return null
    }
    return { user: { id: payload.sub, email: payload.email } }
  } catch {
    clearJwt()
    return null
  }
}

// ─── Onboarding helpers ───────────────────────────────────────────────────────

export async function findOrCreateOrg(name) {
  const { data: existing } = await supabase
    .from('organisations')
    .select('id, name')
    .ilike('name', name.trim())
    .limit(1)
    .single()

  if (existing) return existing

  const { data, error } = await supabase
    .from('organisations')
    .insert({ name: name.trim() })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createPlant(orgId, plantName, industry, shortCode) {
  const row = { org_id: orgId, name: plantName.trim(), industry: industry?.trim() || null }
  if (shortCode?.trim()) row.short_code = shortCode.trim().toUpperCase()
  const { data, error } = await supabase
    .from('plants')
    .insert(row)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createProfile(userId, displayName, orgId, plantId, role = 'admin') {
  const row = { user_id: userId, display_name: displayName.trim(), org_id: orgId, plant_id: plantId, role }
  const { data, error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

// Simplified profile — no org/plant yet (new onboarding flow).
export async function createProfileSimple(userId, displayName) {
  return createProfile(userId, displayName, null, null, 'member')
}

// ─── Plant memberships ────────────────────────────────────────────────────────

export async function createMembership(userId, plantId, role = 'admin', invitedBy = null) {
  const { data, error } = await supabase
    .from('plant_memberships')
    .insert({ user_id: userId, plant_id: plantId, role, invited_by: invitedBy })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function fetchMemberships(userId) {
  console.log('[fetchMemberships] querying for user_id:', userId)
  const { data: membRows, error: membErr } = await supabase
    .from('plant_memberships')
    .select('id, plant_id, role, joined_at, invited_by')
    .eq('user_id', userId)

  console.log('[fetchMemberships] plant_memberships rows:', membRows?.length ?? 0, membRows?.map(m => m.plant_id), membErr ? '— ERROR: ' + membErr.message : '')

  // If no membership rows found, check the profiles table for a legacy plant_id.
  // This handles accounts created before the multi-plant migration, or the demo
  // user created via the old onboarding flow.
  if (!membRows?.length) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('plant_id, role')
      .eq('user_id', userId)
      .limit(1)
    const profilePlantId = profileRows?.[0]?.plant_id
    if (profilePlantId) {
      // Auto-insert the membership so future logins don't need this fallback
      await supabase.from('plant_memberships').insert({
        user_id: userId,
        plant_id: profilePlantId,
        role: profileRows[0].role === 'admin' ? 'admin' : 'contributor',
      }).select().single()
      // Re-fetch now that the row exists
      const { data: retried } = await supabase
        .from('plant_memberships')
        .select('id, plant_id, role, joined_at, invited_by')
        .eq('user_id', userId)
      if (!retried?.length) return []
      return _buildMemberships(retried)
    }
    return []
  }

  const result = await _buildMemberships(membRows)
  console.log('[fetchMemberships] built memberships:', result.map(m => `${m.plantName} (${m.plantId})`))
  return result
}

async function _buildMemberships(membRows) {
  const plantIds = membRows.map(m => m.plant_id)
  let { data: plants, error: plantsErr } = await supabase
    .from('plants')
    .select('id, name, org_id, process_areas, invite_code, industry, short_code')
    .in('id', plantIds)

  // If short_code column doesn't exist yet (migration not run), retry without it
  if (plantsErr) {
    const retry = await supabase
      .from('plants')
      .select('id, name, org_id, process_areas, invite_code, industry')
      .in('id', plantIds)
    plants = retry.data
  }

  const plantMap = {}
  plants?.forEach(p => { plantMap[p.id] = p })

  const orgIds = [...new Set((plants || []).map(p => p.org_id).filter(Boolean))]
  let orgMap = {}
  if (orgIds.length) {
    const { data: orgs } = await supabase
      .from('organisations')
      .select('id, name')
      .in('id', orgIds)
    orgs?.forEach(o => { orgMap[o.id] = o })
  }

  return membRows.map(m => {
    const plant = plantMap[m.plant_id] || {}
    const org = orgMap[plant.org_id] || {}
    return {
      membershipId: m.id,
      plantId: m.plant_id,
      plantName: plant.name || 'Unknown Plant',
      processAreas: plant.process_areas || [],
      orgId: plant.org_id,
      orgName: org.name || '',
      industry: plant.industry || '',
      shortCode: plant.short_code || '',
      role: m.role,
      joinedAt: m.joined_at,
    }
  })
}

// ─── Plant invites ───────────────────────────────────────────────────────────
//
// Staged flow:
//   1. Member invites someone → status='pending_approval'
//      EXCEPTION: if member is an admin, status='approved' immediately.
//   2. Admin approves → status='approved' (or rejects → 'rejected').
//   3. On 'approved', edge function sends email with invite link via Resend.
//   4. Recipient clicks link → /accept-invite → status='accepted', membership created.

const INVITE_EDGE_URL = `${SUPABASE_URL}/functions/v1/invite`

// Fires the invite edge function for a token. Used both by sendPlantInvite
// (when the inviter is an admin) and approveInvite (when an admin approves a
// pending invite). The edge function looks up the invite by token, sends the
// email, and tolerates "user already exists" (creating membership directly).
async function triggerInviteEmail(token, jwt) {
  try {
    const resp = await fetch(INVITE_EDGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    })
    const result = await resp.json().catch(() => ({}))
    if (!resp.ok) console.warn('[triggerInviteEmail] edge function error:', result?.error)
    return { sent: !!result?.sent, result }
  } catch (err) {
    console.warn('[triggerInviteEmail] failed:', err.message)
    return { sent: false, result: null }
  }
}

// Returns true if the current logged-in user is an admin of the given plant.
async function isInviterAdmin(plantId, userId) {
  const { data } = await supabase
    .from('plant_memberships')
    .select('role')
    .eq('plant_id', plantId)
    .eq('user_id', userId)
    .maybeSingle()
  return data?.role === 'admin'
}

// Stage 1: send an invite. If inviter is admin, skip approval and email immediately.
// Returns { invite, autoApproved, emailSent }.
export async function sendPlantInvite(plantId, email, role = 'contributor') {
  const jwt = getStoredJwt()
  if (!jwt) throw new Error('Not authenticated')
  const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  const userId = payload.sub

  const trimmedEmail = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw new Error('Enter a valid email address.')
  }
  if (role !== 'contributor' && role !== 'viewer') {
    throw new Error('Role must be contributor or viewer.')
  }

  // Block inviting someone who's already a member of this plant.
  const { data: existingUserId } = await supabase
    .rpc('get_user_id_by_email', { lookup_email: trimmedEmail })
  if (existingUserId) {
    const { data: existingMembership } = await supabase
      .from('plant_memberships')
      .select('id')
      .eq('plant_id', plantId)
      .eq('user_id', existingUserId)
      .maybeSingle()
    if (existingMembership) {
      throw new Error('This person is already a member of this plant.')
    }
  }

  const inviterIsAdmin = await isInviterAdmin(plantId, userId)
  const initialStatus = inviterIsAdmin ? 'approved' : 'pending_approval'
  const insertRow = {
    plant_id: plantId,
    recipient_email: trimmedEmail,
    invited_by: userId,
    role,
    status: initialStatus,
  }
  if (inviterIsAdmin) {
    insertRow.approved_by = userId
    insertRow.approved_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('plant_invites')
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    // Exclusion constraint name from migration 030
    if (error.code === '23P01' || /no_dupe_active|already exists/.test(error.message || '')) {
      throw new Error('An invite is already pending for this email.')
    }
    if (error.code === '23505') {
      throw new Error('An invite is already pending for this email.')
    }
    throw new Error(error.message)
  }

  // If admin auto-approved, fire the email now.
  let emailSent = false
  if (inviterIsAdmin) {
    const result = await triggerInviteEmail(data.token, jwt)
    emailSent = result.sent
  }

  return { invite: data, autoApproved: inviterIsAdmin, emailSent }
}

// All invites for a plant (admin view).
export async function fetchPlantInvites(plantId) {
  const { data, error } = await supabase
    .from('plant_invites')
    .select('id, recipient_email, status, invited_by, role, invited_at, approved_at, rejected_at, accepted_at, expires_at')
    .eq('plant_id', plantId)
    .order('invited_at', { ascending: false })

  if (error) throw new Error(error.message)

  const inviterIds = [...new Set((data || []).map(i => i.invited_by).filter(Boolean))]
  let nameMap = {}
  if (inviterIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', inviterIds)
    profiles?.forEach(p => { nameMap[p.user_id] = p.display_name })
  }

  return (data || []).map(i => ({
    id: i.id,
    email: i.recipient_email,
    status: i.status,
    role: i.role,
    invitedByName: nameMap[i.invited_by] || 'Unknown',
    invitedById: i.invited_by,
    invitedAt: i.invited_at,
    approvedAt: i.approved_at,
    rejectedAt: i.rejected_at,
    acceptedAt: i.accepted_at,
    expiresAt: i.expires_at,
  }))
}

// Pending invites the current user sent (so non-admins can confirm their
// invite is awaiting admin approval).
export async function fetchOwnPendingInvites(plantId) {
  const userId = getStoredJwt()
    ? JSON.parse(atob(getStoredJwt().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub
    : null
  if (!userId) return []
  const { data } = await supabase
    .from('plant_invites')
    .select('id, recipient_email, status, role, invited_at')
    .eq('plant_id', plantId)
    .eq('invited_by', userId)
    .eq('status', 'pending_approval')
    .order('invited_at', { ascending: false })
  return (data || []).map(i => ({
    id: i.id,
    email: i.recipient_email,
    status: i.status,
    role: i.role,
    invitedAt: i.invited_at,
  }))
}

// Stage 2: admin approves. Flips status, fires email.
export async function approveInvite(inviteId) {
  const jwt = getStoredJwt()
  if (!jwt) throw new Error('Not authenticated')
  const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  const adminUserId = payload.sub

  const { data: invite, error: fetchErr } = await supabase
    .from('plant_invites')
    .select('id, token, status, plant_id')
    .eq('id', inviteId)
    .single()
  if (fetchErr || !invite) throw new Error('Invite not found.')
  if (invite.status !== 'pending_approval') {
    throw new Error(`Invite is ${invite.status}, can't approve.`)
  }

  const { error: updateErr } = await supabase
    .from('plant_invites')
    .update({
      status: 'approved',
      approved_by: adminUserId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', inviteId)
  if (updateErr) throw new Error(updateErr.message)

  const result = await triggerInviteEmail(invite.token, jwt)
  return { approved: true, emailSent: result.sent }
}

// Stage 2: admin rejects. No email is sent.
export async function rejectInvite(inviteId) {
  const jwt = getStoredJwt()
  if (!jwt) throw new Error('Not authenticated')
  const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  const adminUserId = payload.sub

  const { error } = await supabase
    .from('plant_invites')
    .update({
      status: 'rejected',
      rejected_by: adminUserId,
      rejected_at: new Date().toISOString(),
    })
    .eq('id', inviteId)
  if (error) throw new Error(error.message)
}

// Public lookup for /accept-invite. Returns invite metadata (without the
// secret token, since the caller already has it in the URL).
export async function lookupInviteByToken(token) {
  const { data, error } = await supabase
    .rpc('lookup_invite_by_token', { p_token: token })
  if (error) throw new Error(error.message)
  if (!data?.length) return null
  const row = data[0]
  return {
    id: row.id,
    plantId: row.plant_id,
    plantName: row.plant_name,
    recipientEmail: row.recipient_email,
    status: row.status,
    expiresAt: row.expires_at,
    role: row.role,
  }
}

// Stage 4: recipient (logged in) accepts the invite.
// Server-validated: matches recipient_email to auth.users(email), creates
// membership, flips status to 'accepted'. Returns { success, plantId, message }.
export async function acceptInviteByToken(token) {
  const { data, error } = await supabase
    .rpc('accept_invite', { p_token: token })
  if (error) throw new Error(error.message)
  const row = data?.[0]
  return {
    success: !!row?.success,
    plantId: row?.accepted_plant_id || null,
    message: row?.message || '',
  }
}

export async function fetchPlantMembers(plantId) {
  const { data } = await supabase
    .from('plant_memberships')
    .select('id, user_id, role, joined_at, invited_by')
    .eq('plant_id', plantId)

  if (!data?.length) return []

  const userIds = data.map(m => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .in('user_id', userIds)

  const profileMap = {}
  profiles?.forEach(p => { profileMap[p.user_id] = p.display_name })

  return data.map(m => ({
    membershipId: m.id,
    userId: m.user_id,
    displayName: profileMap[m.user_id] || 'Unknown',
    role: m.role,
    joinedAt: m.joined_at,
    invitedBy: m.invited_by,
  }))
}

export async function updateMemberRole(membershipId, role) {
  const { error } = await supabase
    .from('plant_memberships')
    .update({ role })
    .eq('id', membershipId)
  if (error) throw new Error(error.message)
}

export async function removeMember(membershipId) {
  const { error } = await supabase
    .from('plant_memberships')
    .delete()
    .eq('id', membershipId)
  if (error) throw new Error(error.message)
}

// ─── BevCan application helpers ───────────────────────────────────────────────

export async function createBevcanApplication(userId, fields) {
  const { data, error } = await supabase
    .from('bevcan_applications')
    .insert({ user_id: userId, ...fields })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function fetchBevcanApplicationStatus(userId) {
  const { data } = await supabase
    .from('bevcan_applications')
    .select('status')
    .eq('user_id', userId)
    .order('applied_at', { ascending: false })
    .limit(1)
    .single()
  return data?.status || null // 'pending' | 'approved' | 'rejected' | null
}
