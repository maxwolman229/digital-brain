import { DANIELI_COOKIE_NAME, DANIELI_COOKIE_PATH } from '../../lib/danieliShare.js'

export const prerender = false

function clearSession({ cookies, url }) {
  cookies.delete(DANIELI_COOKIE_NAME, {
    path: DANIELI_COOKIE_PATH,
  })

  return Response.redirect(new URL('/danieli/', url), 303)
}

export function GET(context) {
  return clearSession(context)
}

export function POST(context) {
  return clearSession(context)
}
