import { PostgrestClient } from '@supabase/postgrest-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ─── JWT store ────────────────────────────────────────────────────────────────

const JWT_KEY = 'md1-access-token'
const REFRESH_KEY = 'md1-refresh-token'

let _jwt = null
let _refreshToken = null

try { _jwt = localStorage.getItem(JWT_KEY) } catch {
  try { _jwt = sessionStorage.getItem(JWT_KEY) } catch {}
}
try { _refreshToken = localStorage.getItem(REFRESH_KEY) } catch {
  try { _refreshToken = sessionStorage.getItem(REFRESH_KEY) } catch {}
}

export function storeJwt(token) {
  _jwt = token
  try { localStorage.setItem(JWT_KEY, token) } catch {
    try { sessionStorage.setItem(JWT_KEY, token) } catch {}
  }
}

export function storeRefreshToken(token) {
  _refreshToken = token
  try { localStorage.setItem(REFRESH_KEY, token) } catch {
    try { sessionStorage.setItem(REFRESH_KEY, token) } catch {}
  }
}

export function clearJwt() {
  _jwt = null
  _refreshToken = null
  try { localStorage.removeItem(JWT_KEY) } catch {}
  try { sessionStorage.removeItem(JWT_KEY) } catch {}
  try { localStorage.removeItem(REFRESH_KEY) } catch {}
  try { sessionStorage.removeItem(REFRESH_KEY) } catch {}
}

export function getStoredJwt() { return _jwt }
export function getStoredRefreshToken() { return _refreshToken }

// ─── Auth expired callback ────────────────────────────────────────────────────
// App.jsx registers a logout handler here so that when token refresh fails,
// the user is redirected to /auth automatically rather than seeing empty data.

let _onAuthExpired = null
export function setAuthExpiredHandler(fn) { _onAuthExpired = fn }

// ─── Token refresh ────────────────────────────────────────────────────────────
// Called when a 401 is received. Tries to exchange the refresh token for a new
// access token. Returns true on success, false if the session cannot be rescued.

let _refreshPromise = null // deduplicate concurrent refresh attempts

export async function refreshAccessToken() {
  if (!_refreshToken) return false

  // If a refresh is already in flight, wait for it rather than firing twice
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async () => {
    try {
      const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: _refreshToken }),
      })
      const json = await resp.json()
      if (!resp.ok || !json.access_token) {
        console.warn('[refreshAccessToken] refresh failed:', json.error_description || json.msg || resp.status)
        clearJwt()
        _onAuthExpired?.()
        return false
      }
      storeJwt(json.access_token)
      if (json.refresh_token) storeRefreshToken(json.refresh_token)
      return true
    } catch (err) {
      console.warn('[refreshAccessToken] network error:', err.message)
      clearJwt()
      _onAuthExpired?.()
      return false
    } finally {
      _refreshPromise = null
    }
  })()

  return _refreshPromise
}

// ─── Authenticated fetch ──────────────────────────────────────────────────────
// Used by both the PostgREST client and raw auth calls in auth.js.
// On 401: attempts token refresh once, then retries the original request.
// On second 401 after refresh: gives up (session expired — user must re-login).

export async function authFetch(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  // Safely extract incoming headers — options.headers may be a Headers instance
  const incoming = {}
  if (options.headers) {
    if (typeof options.headers.forEach === 'function') {
      options.headers.forEach((value, key) => { incoming[key] = value })
    } else {
      Object.assign(incoming, options.headers)
    }
  }

  function buildHeaders() {
    return {
      'apikey': supabaseAnonKey,
      ...incoming,
      'Authorization': 'Bearer ' + (_jwt || supabaseAnonKey),
    }
  }

  let resp
  try {
    resp = await fetch(url, { ...options, headers: buildHeaders(), signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }

  // On 401, try to refresh and retry once
  if (resp.status === 401) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      // Retry with the new token (fresh controller — old one already fired)
      const controller2 = new AbortController()
      const timer2 = setTimeout(() => controller2.abort(), 15000)
      try {
        resp = await fetch(url, { ...options, headers: buildHeaders(), signal: controller2.signal })
      } finally {
        clearTimeout(timer2)
      }
    }
    // If refresh failed or second attempt also 401, return original 401 — caller
    // will see empty data and the user will be prompted to log in again on next
    // page load (getRestoredSession() clears expired JWTs at startup).
  }

  return resp
}

// ─── PostgREST client (no GoTrue, no hanging initializePromise) ───────────────
// Directly hits /rest/v1 with our stored JWT injected on every request.

export const supabase = new PostgrestClient(`${supabaseUrl}/rest/v1`, {
  headers: {
    'apikey': supabaseAnonKey,
  },
  fetch: authFetch,
})
