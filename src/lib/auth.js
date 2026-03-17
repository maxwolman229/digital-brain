import { supabase, storeJwt, clearJwt, getStoredJwt } from './supabase.js'
import { setUserContext, clearUserContext } from './userContext.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ─── Raw auth helper ──────────────────────────────────────────────────────────
// Bypasses supabase-js auth (which hangs with sb_publishable_* keys).

async function rawSignIn(email, password) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)

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
  const timer = setTimeout(() => controller.abort(), 12000)

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

  if (json.access_token) storeJwt(json.access_token)
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
  const timer = setTimeout(() => controller.abort(), 10000)

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

export async function createPlant(orgId, plantName, industry) {
  const { data, error } = await supabase
    .from('plants')
    .insert({ org_id: orgId, name: plantName.trim(), industry: industry?.trim() || null })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createProfile(userId, displayName, orgId, plantId, role = 'admin') {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ user_id: userId, display_name: displayName.trim(), org_id: orgId, plant_id: plantId, role })
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
  const { data: plants } = await supabase
    .from('plants')
    .select('id, name, org_id, process_areas, invite_code, industry')
    .in('id', plantIds)

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
      inviteCode: plant.invite_code || '',
      orgId: plant.org_id,
      orgName: org.name || '',
      industry: plant.industry || '',
      role: m.role,
      joinedAt: m.joined_at,
    }
  })
}

export async function joinPlantByCode(inviteCode) {
  const jwt = getStoredJwt()
  if (!jwt) throw new Error('Not authenticated')

  const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  const userId = payload.sub

  const { data: plant, error: plantErr } = await supabase
    .from('plants')
    .select('id, name, org_id, process_areas, invite_code, industry')
    .eq('invite_code', inviteCode.trim().toUpperCase())
    .single()

  if (plantErr || !plant) throw new Error('Invalid invite code. Please check and try again.')

  const { data: membership, error: mErr } = await supabase
    .from('plant_memberships')
    .insert({ user_id: userId, plant_id: plant.id, role: 'contributor' })
    .select()
    .single()

  if (mErr) {
    if (mErr.code === '23505') throw new Error('You are already a member of this plant.')
    throw new Error(mErr.message)
  }

  let orgName = ''
  if (plant.org_id) {
    const { data: org } = await supabase.from('organisations').select('name').eq('id', plant.org_id).single()
    orgName = org?.name || ''
  }

  return {
    membershipId: membership.id,
    plantId: plant.id,
    plantName: plant.name,
    processAreas: plant.process_areas || [],
    inviteCode: plant.invite_code,
    orgId: plant.org_id,
    orgName,
    industry: plant.industry || '',
    role: 'contributor',
    joinedAt: membership.joined_at,
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
