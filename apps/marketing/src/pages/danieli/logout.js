import { DANIELI_COOKIE_NAME, DANIELI_COOKIE_PATH } from '../../lib/danieliShare.js'

export const prerender = false

function clearSession({ cookies, url }) {
  cookies.delete(DANIELI_COOKIE_NAME, {
    path: DANIELI_COOKIE_PATH,
  })

  return new Response(null, {
    status: 303,
    headers: {
      'cache-control': 'no-store',
      location: new URL('/danieli/', url).toString(),
    },
  })
}

export function GET(context) {
  return clearSession(context)
}

export function POST(context) {
  return clearSession(context)
}
