import {
  DANIELI_COOKIE_NAME,
  createDanieliAccessToken,
  getDanieliCookieOptions,
  isDanieliPasswordValid,
  requireDanieliShareConfig,
  safeDanieliRedirect,
} from '../../lib/danieliShare.js'

export const prerender = false

function redirectTo(location, status = 303) {
  return new Response(null, {
    status,
    headers: {
      Location: location,
    },
  })
}

export async function POST({ request, cookies, url }) {
  requireDanieliShareConfig()

  const formData = await request.formData()
  const password = String(formData.get('password') || '')
  const next = safeDanieliRedirect(formData.get('next') || '/danieli/')

  if (!isDanieliPasswordValid(password)) {
    return redirectTo(`/danieli/?error=1&next=${encodeURIComponent(next)}`)
  }

  cookies.set(DANIELI_COOKIE_NAME, createDanieliAccessToken(), getDanieliCookieOptions(url))

  return redirectTo(next)
}

export function GET() {
  return redirectTo('/danieli/')
}
