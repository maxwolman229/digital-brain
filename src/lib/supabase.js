import { PostgrestClient } from '@supabase/postgrest-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// ─── JWT store ────────────────────────────────────────────────────────────────

const JWT_KEY = 'md1-access-token'
let _jwt = null
try { _jwt = localStorage.getItem(JWT_KEY) } catch {
  try { _jwt = sessionStorage.getItem(JWT_KEY) } catch {}
}

export function storeJwt(token) {
  _jwt = token
  try {
    localStorage.setItem(JWT_KEY, token)
  } catch {
    try { sessionStorage.setItem(JWT_KEY, token) } catch {}
  }
}

export function clearJwt() {
  _jwt = null
  try { localStorage.removeItem(JWT_KEY) } catch {}
  try { sessionStorage.removeItem(JWT_KEY) } catch {}
}

export function getStoredJwt() { return _jwt }

// ─── Authenticated fetch ──────────────────────────────────────────────────────
// Used by both the PostgREST client and raw auth calls in auth.js.

export function authFetch(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  // Safely extract incoming headers — options.headers may be a Headers instance
  // (not a plain object), so spread alone won't enumerate its entries.
  const incoming = {}
  if (options.headers) {
    if (typeof options.headers.forEach === 'function') {
      options.headers.forEach((value, key) => { incoming[key] = value })
    } else {
      Object.assign(incoming, options.headers)
    }
  }

  const headers = {
    'apikey': supabaseAnonKey,
    ...incoming,
    'Authorization': 'Bearer ' + (_jwt || supabaseAnonKey),
  }

  return fetch(url, { ...options, headers, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

// ─── PostgREST client (no GoTrue, no hanging initializePromise) ───────────────
// Directly hits /rest/v1 with our stored JWT injected on every request.

export const supabase = new PostgrestClient(`${supabaseUrl}/rest/v1`, {
  headers: {
    'apikey': supabaseAnonKey,
  },
  fetch: authFetch,
})
