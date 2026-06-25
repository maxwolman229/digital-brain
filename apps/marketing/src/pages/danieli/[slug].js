import ontologyAndKcardsHtml from '../../danieli-html/danieli-md1-ontology-and-kcards_6_25-v0.html?raw'
import {
  DANIELI_COOKIE_NAME,
  getDanieliDocument,
  isDanieliAccessTokenValid,
} from '../../lib/danieliShare.js'

export const prerender = false

const DOCUMENT_HTML = {
  'ontology-and-kcards': ontologyAndKcardsHtml,
}

function redirect(path, baseUrl) {
  const response = Response.redirect(new URL(path, baseUrl), 303)

  return new Response(null, {
    status: response.status,
    headers: {
      'cache-control': 'no-store',
      location: response.headers.get('location'),
    },
  })
}

export function GET({ params, cookies, url }) {
  const document = getDanieliDocument(params.slug)

  if (!document) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  }

  const token = cookies.get(DANIELI_COOKIE_NAME)?.value

  if (!isDanieliAccessTokenValid(token)) {
    return redirect(`/danieli/?next=${encodeURIComponent(document.path)}`, url)
  }

  const documentHtml = DOCUMENT_HTML[document.slug]

  if (!documentHtml) {
    return new Response('Document unavailable', {
      status: 500,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  }

  return new Response(documentHtml, {
    headers: {
      'cache-control': 'no-store, private',
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
