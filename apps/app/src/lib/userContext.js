// Module-level store for the authenticated user's context.
// Set by auth.js → loadProfile() after login. Read by db.js at query time.

let _plantId = null
let _displayName = 'You'
let _orgId = null
let _userId = null
let _role = 'member'

export function setUserContext({ plantId, displayName, orgId, userId, role }) {
  _plantId = plantId || null
  _displayName = displayName || 'You'
  _orgId = orgId || null
  _userId = userId || null
  _role = role || 'member'
}

export function clearUserContext() {
  _plantId = null
  _displayName = 'You'
  _orgId = null
  _userId = null
  _role = 'member'
  try { localStorage.removeItem('md1-active-plant') } catch {}
}

export const getPlantId = () => _plantId
export const getDisplayName = () => _displayName
export const getOrgId = () => _orgId
export const getUserId = () => _userId
export const getRole = () => _role

export function getStoredActivePlant() {
  try { return localStorage.getItem('md1-active-plant') } catch { return null }
}
