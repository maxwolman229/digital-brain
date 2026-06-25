import { createHmac, timingSafeEqual } from 'node:crypto'

export const DANIELI_COOKIE_NAME = 'md1_danieli_share'
export const DANIELI_COOKIE_PATH = '/danieli'
export const DANIELI_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

const TOKEN_AUDIENCE = 'danieli-share'
const REDIRECT_BASE = 'https://md1.app'

export const DANIELI_DOCUMENTS = [
  {
    slug: 'ontology-and-kcards',
    title: 'WTP Ontology & K-Cards',
    path: '/danieli/ontology-and-kcards/',
    sourceFile: 'danieli-md1-ontology-and-kcards_6_25-v0.html',
  },
]

function getSharePassword(env = process.env) {
  return String(env.DANIELI_SHARE_PASSWORD || '')
}

function getCookieSecret(env = process.env) {
  return String(env.DANIELI_SHARE_COOKIE_SECRET || '')
}

function safeCompare(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue))
  const right = Buffer.from(String(rightValue))
  const length = Math.max(left.length, right.length, 1)
  const paddedLeft = Buffer.alloc(length)
  const paddedRight = Buffer.alloc(length)

  left.copy(paddedLeft)
  right.copy(paddedRight)

  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length
}

function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function requireDanieliShareConfig(env = process.env) {
  if (!getSharePassword(env)) {
    throw new Error('DANIELI_SHARE_PASSWORD is not configured')
  }

  if (!getCookieSecret(env)) {
    throw new Error('DANIELI_SHARE_COOKIE_SECRET is not configured')
  }
}

export function getDanieliDocument(slug) {
  return DANIELI_DOCUMENTS.find((document) => document.slug === slug) || null
}

export function isDanieliPasswordValid(input, env = process.env) {
  const configuredPassword = getSharePassword(env)

  if (!configuredPassword || !input) {
    return false
  }

  return safeCompare(input, configuredPassword)
}

export function createDanieliAccessToken(env = process.env, issuedAt = Math.floor(Date.now() / 1000)) {
  const secret = getCookieSecret(env)

  if (!secret) {
    throw new Error('DANIELI_SHARE_COOKIE_SECRET is not configured')
  }

  const payload = `${TOKEN_AUDIENCE}.${issuedAt}`
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url')
  const signature = signPayload(payload, secret)

  return `${encodedPayload}.${signature}`
}

export function isDanieliAccessTokenValid(token, env = process.env, now = Math.floor(Date.now() / 1000)) {
  const secret = getCookieSecret(env)

  if (!secret || !token) {
    return false
  }

  try {
    const [encodedPayload, signature] = String(token).split('.')

    if (!encodedPayload || !signature) {
      return false
    }

    const payload = Buffer.from(encodedPayload, 'base64url').toString('utf8')
    const expectedSignature = signPayload(payload, secret)

    if (!safeCompare(signature, expectedSignature)) {
      return false
    }

    const [audience, issuedAtRaw] = payload.split('.')
    const issuedAt = Number(issuedAtRaw)

    if (audience !== TOKEN_AUDIENCE || !Number.isFinite(issuedAt)) {
      return false
    }

    if (issuedAt > now + 60) {
      return false
    }

    return now - issuedAt <= DANIELI_COOKIE_MAX_AGE
  } catch {
    return false
  }
}

export function safeDanieliRedirect(value, fallback = '/danieli/') {
  const candidate = typeof value === 'string' ? value.trim() : ''

  if (!candidate) {
    return fallback
  }

  try {
    const parsed = new URL(candidate, REDIRECT_BASE)

    if (parsed.origin !== REDIRECT_BASE) {
      return fallback
    }

    const path = `${parsed.pathname}${parsed.search}`

    if (path === '/danieli') {
      return '/danieli/'
    }

    if (!path.startsWith('/danieli/')) {
      return fallback
    }

    if (path.startsWith('/danieli/session') || path.startsWith('/danieli/logout')) {
      return fallback
    }

    return path
  } catch {
    return fallback
  }
}

export function getDanieliCookieOptions(url) {
  return {
    httpOnly: true,
    maxAge: DANIELI_COOKIE_MAX_AGE,
    path: DANIELI_COOKIE_PATH,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
  }
}
