import { DANIELI_COOKIE_NAME, DANIELI_COOKIE_PATH } from '../../lib/danieliShare.js'

export const prerender = false

export function GET({ cookies }) {
  cookies.delete(DANIELI_COOKIE_NAME, {
    path: DANIELI_COOKIE_PATH,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/danieli/',
    },
  })
}

export const POST = GET
