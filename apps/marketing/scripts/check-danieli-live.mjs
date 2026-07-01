import assert from 'node:assert/strict'

const baseUrl = (process.env.DANIELI_LIVE_URL || 'http://127.0.0.1:4321').replace(/\/$/, '')
const password = process.env.DANIELI_SHARE_PASSWORD || 'correct-client-code'

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  })
}

const gate = await request('/danieli/')
const gateHtml = await gate.text()
assert.equal(gate.status, 200, 'GET /danieli/ should render the gate')
assert.match(gateHtml, /MD1 review materials/, 'The gate should have a client-friendly title')
assert.match(gateHtml, /name="password"/, 'The gate should include a password field')

const blocked = await request('/danieli/ontology-and-kcards/')
assert.equal(blocked.status, 303, 'The protected document should redirect without a cookie')
assert.match(
  blocked.headers.get('location') || '',
  /^\/danieli\/\?next=%2Fdanieli%2Fontology-and-kcards%2F/,
  'Unauthenticated document requests should preserve a safe next URL'
)

const wrong = await request('/danieli/session', {
  method: 'POST',
  body: new URLSearchParams({ password: 'wrong-code', next: '/danieli/ontology-and-kcards/' }),
})
assert.equal(wrong.status, 303, 'Wrong passwords should redirect after POST')
assert.equal(wrong.headers.get('set-cookie'), null, 'Wrong passwords should not set an access cookie')
assert.match(wrong.headers.get('location') || '', /^\/danieli\/\?error=1/, 'Wrong passwords should return an error marker')

const login = await request('/danieli/session', {
  method: 'POST',
  body: new URLSearchParams({ password, next: '/danieli/ontology-and-kcards/' }),
})
assert.equal(login.status, 303, 'Correct password should redirect after POST')
assert.equal(login.headers.get('location'), '/danieli/ontology-and-kcards/', 'Correct password should redirect to next')
const cookie = login.headers.get('set-cookie') || ''
assert.match(cookie, /md1_danieli_share=/, 'Login should set the Danieli access cookie')
assert.match(cookie, /HttpOnly/i, 'The Danieli access cookie should be HTTP-only')
assert.match(cookie, /SameSite=Lax/i, 'The Danieli access cookie should be SameSite=Lax')

const documentResponse = await request('/danieli/ontology-and-kcards/', {
  headers: {
    Cookie: cookie.split(';')[0],
  },
})
const documentHtml = await documentResponse.text()
assert.equal(documentResponse.status, 200, 'Authenticated document requests should return the protected HTML')
assert.match(
  documentResponse.headers.get('content-type') || '',
  /text\/html;\s*charset=utf-8/,
  'The protected document should be served as UTF-8 HTML'
)
assert.match(documentHtml, /MD1 — WTP \/ CLO \/ WCU Ontology/, 'The 7_1 document title should render')
assert.match(documentHtml, /data-view="wcu">WCU<\/button>/, 'The 7_1 WCU tab should render')

const logout = await request('/danieli/logout', {
  headers: {
    Cookie: cookie.split(';')[0],
  },
})
assert.equal(logout.status, 303, 'Logout should redirect')
assert.match(
  logout.headers.get('set-cookie') || '',
  /md1_danieli_share=deleted; Path=\/danieli; Expires=Thu, 01 Jan 1970 00:00:00 GMT/i,
  'Logout should clear the cookie'
)

console.log('Danieli live route check passed.')
