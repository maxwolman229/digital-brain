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
    body: JSON.stringify({ email, password, data: { email_confirm: true } }),
  })
  clearTimeout(timer)

  const json = await resp.json()

  if (!resp.ok) {
    throw new Error(json.error_description || json.msg || json.message || `Signup failed (${resp.status})`)
  }

  if (json.access_token) storeJwt(json.access_token)
  if (json.refresh_token) storeRefreshToken(json.refresh_token)
  return { user: json.user || json, session: json }
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
    isSuperAdmin: data.is_super_admin || false,
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

export async function sendPlantInvite(plantId, email) {
  const jwt = getStoredJwt()
  if (!jwt) throw new Error('Not authenticated')
  const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  const userId = payload.sub

  const trimmedEmail = email.trim().toLowerCase()

  const { data, error } = await supabase
    .from('plant_invites')
    .insert({ plant_id: plantId, email: trimmedEmail, invited_by: userId })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('This email has already been invited to this plant.')
    throw new Error(error.message)
  }

  // Send the invite email immediately via the edge function.
  // This creates the auth account (if new) and sends the branded email.
  // The invite stays "pending" — admin approval controls plant access, not the email.
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/invite`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'send_invite', invite_id: data.id }),
    })
    const result = await resp.json()
    if (!resp.ok) console.warn('[sendPlantInvite] edge function error:', result.error)
    return { ...data, emailSent: result.sent || false, actionLink: result.action_link || null }
  } catch (err) {
    console.warn('[sendPlantInvite] email send failed:', err.message)
    return { ...data, emailSent: false, actionLink: null }
  }
}

export async function fetchPlantInvites(plantId) {
  const { data, error } = await supabase
    .from('plant_invites')
    .select('id, email, status, invited_by, reviewed_by, created_at, updated_at')
    .eq('plant_id', plantId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  // Resolve inviter names
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
    email: i.email,
    status: i.status,
    invitedByName: nameMap[i.invited_by] || 'Unknown',
    createdAt: i.created_at,
  }))
}

export async function approveInvite(inviteId) {
  const jwt = getStoredJwt()
  if (!jwt) throw new Error('Not authenticated')
  const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  const adminUserId = payload.sub

  // Fetch the invite
  const { data: invite, error: fetchErr } = await supabase
    .from('plant_invites')
    .select('id, email, plant_id, status')
    .eq('id', inviteId)
    .single()

  if (fetchErr || !invite) throw new Error('Invite not found.')
  if (invite.status !== 'pending') throw new Error('Invite is no longer pending.')

  // Update invite status to approved
  const { error: updateErr } = await supabase
    .from('plant_invites')
    .update({ status: 'approved', reviewed_by: adminUserId, updated_at: new Date().toISOString() })
    .eq('id', inviteId)

  if (updateErr) throw new Error(updateErr.message)

  // The invite email was already sent when the invite was created (sendPlantInvite).
  // On approval, just create the plant membership if the user already signed up.
  try {
    const { data: userId } = await supabase.rpc('get_user_id_by_email', { lookup_email: invite.email })
    if (userId) {
      await supabase.from('plant_memberships')
        .upsert({ user_id: userId, plant_id: invite.plant_id, role: 'contributor', invited_by: adminUserId },
                 { onConflict: 'user_id,plant_id' })
    }
    return { approved: true, userExists: !!userId }
  } catch (err) {
    console.warn('[approveInvite] membership creation:', err.message)
    return { approved: true, userExists: false }
  }
}

export async function rejectInvite(inviteId) {
  const jwt = getStoredJwt()
  if (!jwt) throw new Error('Not authenticated')
  const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  const adminUserId = payload.sub

  const { error } = await supabase
    .from('plant_invites')
    .update({ status: 'rejected', reviewed_by: adminUserId, updated_at: new Date().toISOString() })
    .eq('id', inviteId)

  if (error) throw new Error(error.message)
}

// Called after signup to check if this user's email has any approved invites
// and auto-create memberships for them.
export async function claimApprovedInvites(userId, email) {
  const { data: invites } = await supabase
    .from('plant_invites')
    .select('id, plant_id, invited_by')
    .eq('email', email.toLowerCase())
    .eq('status', 'approved')

  if (!invites?.length) return []

  const claimed = []
  for (const inv of invites) {
    const { error } = await supabase
      .from('plant_memberships')
      .insert({ user_id: userId, plant_id: inv.plant_id, role: 'contributor', invited_by: inv.invited_by })
      .select()
      .single()
    if (!error || error.code === '23505') {
      claimed.push(inv.plant_id)
    }
  }
  return claimed
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
