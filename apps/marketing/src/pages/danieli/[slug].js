import {
  DANIELI_COOKIE_NAME,
  getDanieliDocument,
  isDanieliAccessTokenValid,
  safeDanieliRedirect,
} from '../../lib/danieliShare.js'

export const prerender = false

const protectedHtml = import.meta.glob('../../danieli-html/*.html', {
  eager: true,
  import: 'default',
  query: '?raw',
})

function redirectTo(location) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
    },
  })
}

export function GET({ params, cookies, url }) {
  const document = getDanieliDocument(params.slug)

  if (!document) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  }

  const token = cookies.get(DANIELI_COOKIE_NAME)?.value

  if (!isDanieliAccessTokenValid(token)) {
    const next = safeDanieliRedirect(`${url.pathname}${url.search}`)

    return redirectTo(`/danieli/?next=${encodeURIComponent(next)}`)
  }

  const html = protectedHtml[`../../danieli-html/${document.sourceFile}`]

  if (!html) {
    return new Response('Protected document unavailable', {
      status: 500,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  }

  return new Response(html, {
    status: 200,
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'text/html; charset=utf-8',
    },
  })
}
