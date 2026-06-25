import {
  DANIELI_COOKIE_NAME,
  createDanieliAccessToken,
  getDanieliCookieOptions,
  isDanieliPasswordValid,
  requireDanieliShareConfig,
  safeDanieliRedirect,
} from '../../lib/danieliShare.js'

export const prerender = false

function redirect(path, baseUrl) {
  return Response.redirect(new URL(path, baseUrl), 303)
}

function notConfiguredResponse() {
  return new Response('Danieli share is not configured.', {
    status: 500,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}

export function GET({ url }) {
  return redirect('/danieli/', url)
}

export async function POST({ request, cookies, url }) {
  try {
    requireDanieliShareConfig()
  } catch {
    return notConfiguredResponse()
  }

  const form = await request.formData()
  const password = String(form.get('password') || '')
  const nextPath = safeDanieliRedirect(String(form.get('next') || ''))

  if (!isDanieliPasswordValid(password)) {
    return redirect(`/danieli/?error=1&next=${encodeURIComponent(nextPath)}`, url)
  }

  cookies.set(DANIELI_COOKIE_NAME, createDanieliAccessToken(), getDanieliCookieOptions(url))

  return redirect(nextPath, url)
}
