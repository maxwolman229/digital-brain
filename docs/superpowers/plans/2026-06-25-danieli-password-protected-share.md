# Danieli Password-Protected Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side shared-password gate under `md1.app/danieli/` for temporary Danieli client HTML review pages.

**Architecture:** Implement this in `apps/marketing` as a small Astro on-demand rendered area while leaving the rest of the marketing site static. Store raw Danieli HTML outside `public`, validate a server-only shared password, set a signed HTTP-only cookie scoped to `/danieli`, and serve allowlisted HTML only through protected server endpoints.

**Tech Stack:** Astro 5, `@astrojs/vercel`, Vercel serverless/on-demand routes, Node `crypto`, Node test runner, Tailwind CSS, npm workspaces.

---

## Source Spec

Read this first:

```text
docs/superpowers/specs/2026-06-25-danieli-password-protected-share-design.md
```

## Working Tree Warning

The repository currently has unrelated untracked/deleted files from prior work:

```text
archive/landingpage-original.html
docs/danieli-k-card-knowledge-product-architecture.html
docs/danieli-k-card-knowledge-product-architecture.md
docs/danieli-k-card-knowledge-product-architecture.pdf
docs/html/
```

Do not revert, delete, or stage unrelated changes unless the user explicitly asks.

## File Structure

- Create `apps/marketing/src/lib/danieliShare.js`
  - Shared allowlist, password check, signed token creation/verification, safe redirect handling, and cookie options.

- Create `apps/marketing/src/lib/danieliShare.test.mjs`
  - Node unit tests for the shared helper.

- Modify `apps/marketing/package.json`
  - Add `@astrojs/vercel`.
  - Add focused Danieli test/check scripts.

- Modify `package-lock.json`
  - Update via npm install.

- Modify `apps/marketing/astro.config.mjs`
  - Add the Vercel adapter while keeping static output as the default.

- Create `apps/marketing/src/danieli-html/danieli-md1-ontology-and-kcards_6_25-v0.html`
  - Protected raw HTML copied from `docs/html/danieli-md1-ontology-and-kcards_6_25-v0.html`.

- Create `apps/marketing/scripts/check-danieli-adapter.mjs`
  - Static check that adapter/config/source-file setup is present.

- Create `apps/marketing/src/pages/danieli/index.astro`
  - Password form when unauthenticated, document index when authenticated.

- Create `apps/marketing/src/pages/danieli/session.js`
  - `POST` login endpoint that validates the password and sets the cookie.

- Create `apps/marketing/src/pages/danieli/logout.js`
  - Clears the Danieli cookie.

- Create `apps/marketing/scripts/check-danieli-auth-routes.mjs`
  - Static route checks for the login/index/logout/session files.

- Create `apps/marketing/src/pages/danieli/[slug].js`
  - Protected document endpoint.

- Create `apps/marketing/scripts/check-danieli-protected-document.mjs`
  - Static route checks for the protected document endpoint.

- Modify `docs/technical/vercel-deployments.md`
  - Document Danieli env vars and cookie secret generation.

---

### Task 1: Shared Danieli Access Helper

**Files:**
- Create: `apps/marketing/src/lib/danieliShare.test.mjs`
- Create: `apps/marketing/src/lib/danieliShare.js`
- Modify: `apps/marketing/package.json`

- [ ] **Step 1: Add the failing helper tests**

Add this script to `apps/marketing/package.json`:

```json
"test:danieli-share": "node --test src/lib/danieliShare.test.mjs"
```

The scripts block should become:

```json
"scripts": {
  "dev": "ASTRO_TELEMETRY_DISABLED=1 astro dev",
  "test:danieli-share": "node --test src/lib/danieliShare.test.mjs",
  "test:tooltips": "node ./scripts/check-tooltips.mjs",
  "test:ux": "node ./scripts/check-ux-regressions.mjs",
  "build": "ASTRO_TELEMETRY_DISABLED=1 astro check && ASTRO_TELEMETRY_DISABLED=1 astro build",
  "preview": "ASTRO_TELEMETRY_DISABLED=1 astro dev"
}
```

Create `apps/marketing/src/lib/danieliShare.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DANIELI_COOKIE_MAX_AGE,
  DANIELI_COOKIE_NAME,
  DANIELI_COOKIE_PATH,
  DANIELI_DOCUMENTS,
  createDanieliAccessToken,
  getDanieliCookieOptions,
  getDanieliDocument,
  isDanieliAccessTokenValid,
  isDanieliPasswordValid,
  requireDanieliShareConfig,
  safeDanieliRedirect,
} from './danieliShare.js'

const env = {
  DANIELI_SHARE_PASSWORD: 'correct-client-code',
  DANIELI_SHARE_COOKIE_SECRET: 'local-cookie-secret-with-enough-entropy',
}

test('defines the initial ontology/K-cards document', () => {
  assert.deepEqual(DANIELI_DOCUMENTS, [
    {
      slug: 'ontology-and-kcards',
      title: 'WTP Ontology & K-Cards',
      path: '/danieli/ontology-and-kcards/',
      sourceFile: 'danieli-md1-ontology-and-kcards_6_25-v0.html',
    },
  ])
  assert.equal(getDanieliDocument('ontology-and-kcards')?.title, 'WTP Ontology & K-Cards')
  assert.equal(getDanieliDocument('missing'), null)
})

test('validates the configured shared password without accepting partial matches', () => {
  assert.equal(isDanieliPasswordValid('correct-client-code', env), true)
  assert.equal(isDanieliPasswordValid('correct-client-code ', env), false)
  assert.equal(isDanieliPasswordValid('wrong-code', env), false)
  assert.equal(isDanieliPasswordValid('', env), false)
  assert.equal(isDanieliPasswordValid('correct-client-code', {}), false)
})

test('requires both server-only environment variables', () => {
  assert.doesNotThrow(() => requireDanieliShareConfig(env))
  assert.throws(
    () => requireDanieliShareConfig({ DANIELI_SHARE_COOKIE_SECRET: 'secret' }),
    /DANIELI_SHARE_PASSWORD/
  )
  assert.throws(
    () => requireDanieliShareConfig({ DANIELI_SHARE_PASSWORD: 'password' }),
    /DANIELI_SHARE_COOKIE_SECRET/
  )
})

test('creates and verifies a signed access token', () => {
  const issuedAt = 1_800_000_000
  const token = createDanieliAccessToken(env, issuedAt)

  assert.equal(isDanieliAccessTokenValid(token, env, issuedAt), true)
  assert.equal(isDanieliAccessTokenValid(token, env, issuedAt + DANIELI_COOKIE_MAX_AGE - 1), true)
  assert.equal(isDanieliAccessTokenValid(token, env, issuedAt + DANIELI_COOKIE_MAX_AGE + 1), false)
  assert.equal(isDanieliAccessTokenValid(`${token}tampered`, env, issuedAt), false)
  assert.equal(isDanieliAccessTokenValid(token, { ...env, DANIELI_SHARE_COOKIE_SECRET: 'different-secret' }, issuedAt), false)
})

test('rejects malformed and future-dated access tokens', () => {
  const issuedAt = 1_800_000_000
  const token = createDanieliAccessToken(env, issuedAt + 120)

  assert.equal(isDanieliAccessTokenValid('', env, issuedAt), false)
  assert.equal(isDanieliAccessTokenValid('not.a.real.token', env, issuedAt), false)
  assert.equal(isDanieliAccessTokenValid(token, env, issuedAt), false)
})

test('allows only safe redirects inside the Danieli share area', () => {
  assert.equal(safeDanieliRedirect('/danieli/ontology-and-kcards/'), '/danieli/ontology-and-kcards/')
  assert.equal(safeDanieliRedirect('/danieli/ontology-and-kcards/?tab=cards'), '/danieli/ontology-and-kcards/?tab=cards')
  assert.equal(safeDanieliRedirect('https://md1.app/danieli/ontology-and-kcards/'), '/danieli/ontology-and-kcards/')
  assert.equal(safeDanieliRedirect('/danieli'), '/danieli/')
  assert.equal(safeDanieliRedirect('/platform/'), '/danieli/')
  assert.equal(safeDanieliRedirect('https://evil.example/danieli/'), '/danieli/')
  assert.equal(safeDanieliRedirect('/danieli/session'), '/danieli/')
  assert.equal(safeDanieliRedirect('/danieli/logout'), '/danieli/')
  assert.equal(safeDanieliRedirect(''), '/danieli/')
})

test('returns hardened cookie options scoped to the Danieli path', () => {
  assert.equal(DANIELI_COOKIE_NAME, 'md1_danieli_share')
  assert.equal(DANIELI_COOKIE_PATH, '/danieli')
  assert.deepEqual(getDanieliCookieOptions(new URL('https://md1.app/danieli/')), {
    httpOnly: true,
    maxAge: DANIELI_COOKIE_MAX_AGE,
    path: DANIELI_COOKIE_PATH,
    sameSite: 'lax',
    secure: true,
  })
  assert.deepEqual(getDanieliCookieOptions(new URL('http://localhost:4321/danieli/')), {
    httpOnly: true,
    maxAge: DANIELI_COOKIE_MAX_AGE,
    path: DANIELI_COOKIE_PATH,
    sameSite: 'lax',
    secure: false,
  })
})
```

- [ ] **Step 2: Run the helper tests and verify they fail**

Run from the repository root:

```bash
npm --workspace @md1/marketing run test:danieli-share
```

Expected: FAIL because `apps/marketing/src/lib/danieliShare.js` does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/marketing/src/lib/danieliShare.js`:

```js
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
```

- [ ] **Step 4: Run the helper tests and verify they pass**

Run:

```bash
npm --workspace @md1/marketing run test:danieli-share
```

Expected: PASS with Node test runner output showing all helper tests pass.

- [ ] **Step 5: Commit the helper**

Run:

```bash
git add apps/marketing/package.json apps/marketing/src/lib/danieliShare.js apps/marketing/src/lib/danieliShare.test.mjs
git commit -m "feat: add danieli share access helper"
```

---

### Task 2: Vercel Adapter And Protected HTML Source

**Files:**
- Modify: `apps/marketing/package.json`
- Modify: `package-lock.json`
- Modify: `apps/marketing/astro.config.mjs`
- Create: `apps/marketing/src/danieli-html/danieli-md1-ontology-and-kcards_6_25-v0.html`
- Create: `apps/marketing/scripts/check-danieli-adapter.mjs`

- [ ] **Step 1: Add the failing adapter/source check**

Add this script to `apps/marketing/package.json`:

```json
"test:danieli-adapter": "node ./scripts/check-danieli-adapter.mjs"
```

The scripts block should include:

```json
"scripts": {
  "dev": "ASTRO_TELEMETRY_DISABLED=1 astro dev",
  "test:danieli-adapter": "node ./scripts/check-danieli-adapter.mjs",
  "test:danieli-share": "node --test src/lib/danieliShare.test.mjs",
  "test:tooltips": "node ./scripts/check-tooltips.mjs",
  "test:ux": "node ./scripts/check-ux-regressions.mjs",
  "build": "ASTRO_TELEMETRY_DISABLED=1 astro check && ASTRO_TELEMETRY_DISABLED=1 astro build",
  "preview": "ASTRO_TELEMETRY_DISABLED=1 astro dev"
}
```

Create `apps/marketing/scripts/check-danieli-adapter.mjs`:

```js
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const marketingRoot = resolve(scriptDir, '..')
const repoRoot = resolve(marketingRoot, '../..')

const packageJson = JSON.parse(readFileSync(resolve(marketingRoot, 'package.json'), 'utf8'))
const astroConfig = readFileSync(resolve(marketingRoot, 'astro.config.mjs'), 'utf8')
const protectedHtmlPath = resolve(
  marketingRoot,
  'src/danieli-html/danieli-md1-ontology-and-kcards_6_25-v0.html'
)
const oldAccessHtmlPath = resolve(marketingRoot, 'src/danieli-html/danieli-access-6_25-v0.html')
const sourceHtmlPath = resolve(repoRoot, 'docs/html/danieli-md1-ontology-and-kcards_6_25-v0.html')

assert.equal(packageJson.dependencies['@astrojs/vercel'], '^9.0.0')
assert.match(astroConfig, /import vercel from '@astrojs\/vercel'/)
assert.match(astroConfig, /adapter:\s*vercel\(\)/)
assert.equal(existsSync(sourceHtmlPath), true, 'source Danieli HTML should exist under docs/html')
assert.equal(existsSync(protectedHtmlPath), true, 'protected HTML should be copied under src/danieli-html')
assert.equal(existsSync(oldAccessHtmlPath), false, 'client-side access page must not be copied as protected content')

console.log('Danieli adapter/source check passed.')
```

- [ ] **Step 2: Run the adapter/source check and verify it fails**

Run:

```bash
npm --workspace @md1/marketing run test:danieli-adapter
```

Expected: FAIL because `@astrojs/vercel`, the adapter config, and copied protected HTML are not present yet.

- [ ] **Step 3: Install the Astro Vercel adapter**

Run from the repository root:

```bash
npm install --workspace @md1/marketing @astrojs/vercel@^9.0.0
```

Expected:

- `apps/marketing/package.json` includes `"@astrojs/vercel": "^9.0.0"`.
- `package-lock.json` is updated.

- [ ] **Step 4: Configure the Astro adapter**

Replace `apps/marketing/astro.config.mjs` with:

```js
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import vercel from '@astrojs/vercel'

export default defineConfig({
  site: 'https://md1.app',
  adapter: vercel(),
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
})
```

- [ ] **Step 5: Copy only the protected document HTML**

Run:

```bash
mkdir -p apps/marketing/src/danieli-html
cp docs/html/danieli-md1-ontology-and-kcards_6_25-v0.html apps/marketing/src/danieli-html/danieli-md1-ontology-and-kcards_6_25-v0.html
```

Do not copy `docs/html/danieli-access-6_25-v0.html`.

- [ ] **Step 6: Run the adapter/source check and verify it passes**

Run:

```bash
npm --workspace @md1/marketing run test:danieli-adapter
```

Expected: PASS with:

```text
Danieli adapter/source check passed.
```

- [ ] **Step 7: Run existing marketing checks**

Run:

```bash
npm --workspace @md1/marketing run test:tooltips
npm --workspace @md1/marketing run test:ux
```

Expected:

```text
Marketing tooltip regression check passed.
Marketing UX regression check passed.
```

- [ ] **Step 8: Commit adapter and source setup**

Run:

```bash
git add apps/marketing/package.json package-lock.json apps/marketing/astro.config.mjs apps/marketing/scripts/check-danieli-adapter.mjs apps/marketing/src/danieli-html/danieli-md1-ontology-and-kcards_6_25-v0.html
git commit -m "feat: configure danieli share server runtime"
```

---

### Task 3: Password Gate, Session, And Logout Routes

**Files:**
- Create: `apps/marketing/src/pages/danieli/index.astro`
- Create: `apps/marketing/src/pages/danieli/session.js`
- Create: `apps/marketing/src/pages/danieli/logout.js`
- Create: `apps/marketing/scripts/check-danieli-auth-routes.mjs`
- Modify: `apps/marketing/package.json`

- [ ] **Step 1: Add the failing auth route check**

Add this script to `apps/marketing/package.json`:

```json
"test:danieli-auth-routes": "node ./scripts/check-danieli-auth-routes.mjs"
```

The scripts block should include:

```json
"scripts": {
  "dev": "ASTRO_TELEMETRY_DISABLED=1 astro dev",
  "test:danieli-adapter": "node ./scripts/check-danieli-adapter.mjs",
  "test:danieli-auth-routes": "node ./scripts/check-danieli-auth-routes.mjs",
  "test:danieli-share": "node --test src/lib/danieliShare.test.mjs",
  "test:tooltips": "node ./scripts/check-tooltips.mjs",
  "test:ux": "node ./scripts/check-ux-regressions.mjs",
  "build": "ASTRO_TELEMETRY_DISABLED=1 astro check && ASTRO_TELEMETRY_DISABLED=1 astro build",
  "preview": "ASTRO_TELEMETRY_DISABLED=1 astro dev"
}
```

Create `apps/marketing/scripts/check-danieli-auth-routes.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const marketingRoot = resolve(scriptDir, '..')

const read = (path) => readFileSync(resolve(marketingRoot, path), 'utf8')

const index = read('src/pages/danieli/index.astro')
const session = read('src/pages/danieli/session.js')
const logout = read('src/pages/danieli/logout.js')

assert.match(index, /export const prerender = false/)
assert.match(index, /method="post"/)
assert.match(index, /action="\/danieli\/session"/)
assert.match(index, /name="password"/)
assert.match(index, /name="next"/)
assert.match(index, /Incorrect code/)
assert.match(index, /WTP Ontology & K-Cards/)

assert.match(session, /export const prerender = false/)
assert.match(session, /export async function POST/)
assert.match(session, /requireDanieliShareConfig/)
assert.match(session, /isDanieliPasswordValid/)
assert.match(session, /createDanieliAccessToken/)
assert.match(session, /getDanieliCookieOptions/)
assert.match(session, /cookies\.set/)
assert.match(session, /Response\.redirect/)

assert.match(logout, /export const prerender = false/)
assert.match(logout, /cookies\.delete/)
assert.match(logout, /DANIELI_COOKIE_PATH/)
assert.match(logout, /Response\.redirect/)

console.log('Danieli auth route check passed.')
```

- [ ] **Step 2: Run the auth route check and verify it fails**

Run:

```bash
npm --workspace @md1/marketing run test:danieli-auth-routes
```

Expected: FAIL because the Danieli auth routes do not exist.

- [ ] **Step 3: Add the Danieli index route**

Create `apps/marketing/src/pages/danieli/index.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro'
import {
  DANIELI_COOKIE_NAME,
  DANIELI_DOCUMENTS,
  isDanieliAccessTokenValid,
  safeDanieliRedirect,
} from '../../lib/danieliShare.js'

export const prerender = false

const cookie = Astro.cookies.get(DANIELI_COOKIE_NAME)?.value
const isAuthorized = isDanieliAccessTokenValid(cookie)
const hasError = Astro.url.searchParams.get('error') === '1'
const nextPath = safeDanieliRedirect(
  Astro.url.searchParams.get('next'),
  DANIELI_DOCUMENTS[0]?.path || '/danieli/'
)
---

<BaseLayout
  current="danieli"
  showCta={false}
  title="Danieli | MD1 Client Share"
  description="Temporary MD1 client review materials for Danieli."
>
  <section class="min-h-[calc(100vh-156px)] border-b border-[var(--md1-border)] px-6 py-20 md:px-10">
    <div class="mx-auto max-w-3xl">
      <div class="mono mb-6 text-xs font-medium uppercase tracking-[0.14em] text-[rgba(18,35,58,0.58)]">
        Danieli Client Share
      </div>
      <h1 class="max-w-2xl text-4xl font-normal leading-tight md:text-5xl">
        MD1 review materials
      </h1>

      {isAuthorized ? (
        <div class="mt-10 border-y border-[var(--md1-border)]">
          {DANIELI_DOCUMENTS.map((document) => (
            <a
              href={document.path}
              class="group grid gap-3 border-b border-[var(--md1-border)] py-6 last:border-b-0 md:grid-cols-[1fr_auto]"
            >
              <div>
                <h2 class="text-2xl font-medium">{document.title}</h2>
                <p class="mt-2 max-w-xl leading-relaxed text-[rgba(18,35,58,0.62)]">
                  Protected client-facing HTML review page.
                </p>
              </div>
              <span class="self-center text-sm font-medium text-[rgba(18,35,58,0.58)] transition-colors group-hover:text-[var(--md1-ink)]">
                Open
              </span>
            </a>
          ))}
        </div>
        <a href="/danieli/logout" class="mt-8 inline-flex text-sm font-medium text-[rgba(18,35,58,0.62)] hover:text-[var(--md1-ink)]">
          Log out
        </a>
      ) : (
        <form method="post" action="/danieli/session" class="mt-10 max-w-md">
          <input type="hidden" name="next" value={nextPath} />
          <label for="danieli-password" class="block text-sm font-medium text-[var(--md1-ink)]">
            Access code
          </label>
          <div class="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="danieli-password"
              name="password"
              type="password"
              autocomplete="off"
              required
              autofocus
              class="min-h-12 flex-1 border border-[var(--md1-border)] bg-white px-4 text-base text-[var(--md1-ink)] outline-none focus:border-[var(--md1-ink)]"
            />
            <button
              type="submit"
              class="min-h-12 bg-[var(--md1-ink)] px-6 text-sm font-medium text-[var(--md1-off-white)] transition-opacity hover:opacity-85"
            >
              Enter
            </button>
          </div>
          {hasError && (
            <p class="mt-3 text-sm font-medium text-[#b23b30]">
              Incorrect code
            </p>
          )}
        </form>
      )}
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 4: Add the session route**

Create `apps/marketing/src/pages/danieli/session.js`:

```js
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
```

- [ ] **Step 5: Add the logout route**

Create `apps/marketing/src/pages/danieli/logout.js`:

```js
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
```

- [ ] **Step 6: Run the auth route check and verify it passes**

Run:

```bash
npm --workspace @md1/marketing run test:danieli-auth-routes
```

Expected:

```text
Danieli auth route check passed.
```

- [ ] **Step 7: Run the helper tests**

Run:

```bash
npm --workspace @md1/marketing run test:danieli-share
```

Expected: PASS.

- [ ] **Step 8: Commit the auth routes**

Run:

```bash
git add apps/marketing/package.json apps/marketing/scripts/check-danieli-auth-routes.mjs apps/marketing/src/pages/danieli/index.astro apps/marketing/src/pages/danieli/session.js apps/marketing/src/pages/danieli/logout.js
git commit -m "feat: add danieli password gate routes"
```

---

### Task 4: Protected Document Endpoint

**Files:**
- Create: `apps/marketing/src/pages/danieli/[slug].js`
- Create: `apps/marketing/scripts/check-danieli-protected-document.mjs`
- Modify: `apps/marketing/package.json`

- [ ] **Step 1: Add the failing protected document check**

Add this script to `apps/marketing/package.json`:

```json
"test:danieli-protected-document": "node ./scripts/check-danieli-protected-document.mjs"
```

The scripts block should include:

```json
"scripts": {
  "dev": "ASTRO_TELEMETRY_DISABLED=1 astro dev",
  "test:danieli-adapter": "node ./scripts/check-danieli-adapter.mjs",
  "test:danieli-auth-routes": "node ./scripts/check-danieli-auth-routes.mjs",
  "test:danieli-protected-document": "node ./scripts/check-danieli-protected-document.mjs",
  "test:danieli-share": "node --test src/lib/danieliShare.test.mjs",
  "test:tooltips": "node ./scripts/check-tooltips.mjs",
  "test:ux": "node ./scripts/check-ux-regressions.mjs",
  "build": "ASTRO_TELEMETRY_DISABLED=1 astro check && ASTRO_TELEMETRY_DISABLED=1 astro build",
  "preview": "ASTRO_TELEMETRY_DISABLED=1 astro dev"
}
```

Create `apps/marketing/scripts/check-danieli-protected-document.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const marketingRoot = resolve(scriptDir, '..')

const route = readFileSync(resolve(marketingRoot, 'src/pages/danieli/[slug].js'), 'utf8')

assert.match(route, /export const prerender = false/)
assert.match(route, /danieli-md1-ontology-and-kcards_6_25-v0\.html\?raw/)
assert.match(route, /getDanieliDocument/)
assert.match(route, /isDanieliAccessTokenValid/)
assert.match(route, /DANIELI_COOKIE_NAME/)
assert.match(route, /Response\.redirect/)
assert.match(route, /cache-control/)
assert.match(route, /no-store/)
assert.match(route, /x-robots-tag/)
assert.match(route, /noindex, nofollow/)
assert.doesNotMatch(route, /danieli-access-6_25-v0\.html/)

console.log('Danieli protected document route check passed.')
```

- [ ] **Step 2: Run the protected document check and verify it fails**

Run:

```bash
npm --workspace @md1/marketing run test:danieli-protected-document
```

Expected: FAIL because `apps/marketing/src/pages/danieli/[slug].js` does not exist.

- [ ] **Step 3: Add the protected document endpoint**

Create `apps/marketing/src/pages/danieli/[slug].js`:

```js
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
  return Response.redirect(new URL(path, baseUrl), 303)
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

  return new Response(DOCUMENT_HTML[document.slug], {
    headers: {
      'cache-control': 'no-store, private',
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
```

- [ ] **Step 4: Run the protected document check and verify it passes**

Run:

```bash
npm --workspace @md1/marketing run test:danieli-protected-document
```

Expected:

```text
Danieli protected document route check passed.
```

- [ ] **Step 5: Run all focused Danieli checks**

Run:

```bash
npm --workspace @md1/marketing run test:danieli-share
npm --workspace @md1/marketing run test:danieli-adapter
npm --workspace @md1/marketing run test:danieli-auth-routes
npm --workspace @md1/marketing run test:danieli-protected-document
```

Expected: all PASS.

- [ ] **Step 6: Commit the protected document endpoint**

Run:

```bash
git add apps/marketing/package.json apps/marketing/scripts/check-danieli-protected-document.mjs apps/marketing/src/pages/danieli/[slug].js
git commit -m "feat: serve protected danieli documents"
```

---

### Task 5: Deployment Documentation

**Files:**
- Modify: `docs/technical/vercel-deployments.md`

- [ ] **Step 1: Verify the documentation does not already include the Danieli env vars**

Run:

```bash
rg -n "DANIELI_SHARE_PASSWORD|DANIELI_SHARE_COOKIE_SECRET|Danieli Client Share" docs/technical/vercel-deployments.md
```

Expected: no matches.

- [ ] **Step 2: Add the Danieli share deployment section**

Append this section to `docs/technical/vercel-deployments.md`:

````markdown
## Temporary Danieli Client Share

The marketing project may host temporary client review material under:

```text
https://md1.app/danieli/
```

This route is protected by an application-level shared password gate, not by Vercel Advanced Deployment Protection. Keep the protected HTML files out of `public`; they should be served only through the Danieli server routes.

Marketing project environment variables:

```text
DANIELI_SHARE_PASSWORD
DANIELI_SHARE_COOKIE_SECRET
```

`DANIELI_SHARE_PASSWORD` is the shared client-facing access code.

`DANIELI_SHARE_COOKIE_SECRET` signs the HTTP-only access cookie and must not be shared. Generate it with:

```bash
openssl rand -base64 32
```

Configure both variables for preview and production before sharing the Danieli URL. If either variable is missing, the share must fail closed and must not serve protected documents.
````

- [ ] **Step 3: Verify the documentation contains the env vars and command**

Run:

```bash
rg -n "DANIELI_SHARE_PASSWORD|DANIELI_SHARE_COOKIE_SECRET|openssl rand -base64 32|Temporary Danieli Client Share" docs/technical/vercel-deployments.md
```

Expected: matches for all four strings.

- [ ] **Step 4: Commit the docs**

Run:

```bash
git add docs/technical/vercel-deployments.md
git commit -m "docs: document danieli share deployment"
```

---

### Task 6: Local Build And Runtime Verification

**Files:**
- No source files unless verification reveals a defect.

- [ ] **Step 1: Run all marketing checks**

Run:

```bash
npm --workspace @md1/marketing run test:danieli-share
npm --workspace @md1/marketing run test:danieli-adapter
npm --workspace @md1/marketing run test:danieli-auth-routes
npm --workspace @md1/marketing run test:danieli-protected-document
npm --workspace @md1/marketing run test:tooltips
npm --workspace @md1/marketing run test:ux
```

Expected: all checks pass.

- [ ] **Step 2: Build the marketing app with local Danieli env vars**

Run:

```bash
DANIELI_SHARE_PASSWORD=local-danieli-code DANIELI_SHARE_COOKIE_SECRET=local-cookie-secret-with-enough-entropy npm --workspace @md1/marketing run build
```

Expected: build passes.

- [ ] **Step 3: Confirm secret values are not in public/client output**

Run:

```bash
for dir in apps/marketing/dist apps/marketing/.vercel/output/static; do
  if [ -d "$dir" ]; then
    rg -n "local-danieli-code|local-cookie-secret-with-enough-entropy" "$dir" -g '*.html' -g '*.css' -g '*.js'
  fi
done
```

Expected: no matches.

- [ ] **Step 4: Start local Danieli dev server**

Run:

```bash
DANIELI_SHARE_PASSWORD=local-danieli-code DANIELI_SHARE_COOKIE_SECRET=local-cookie-secret-with-enough-entropy npm --workspace @md1/marketing run dev -- --host 127.0.0.1 --port 4321
```

Expected: dev server starts on `http://127.0.0.1:4321/`.

- [ ] **Step 5: Verify unauthenticated protected access redirects to the gate**

In a second terminal, run:

```bash
curl -i http://127.0.0.1:4321/danieli/ontology-and-kcards/
```

Expected:

- Status is `303` or another redirect status.
- `location` points to `/danieli/?next=%2Fdanieli%2Fontology-and-kcards%2F`.
- Response does not contain the protected HTML title.

- [ ] **Step 6: Verify the gate page renders**

Run:

```bash
curl -s http://127.0.0.1:4321/danieli/ | rg "Danieli Client Share|Access code"
```

Expected: both strings appear.

- [ ] **Step 7: Verify wrong password does not set access**

Run:

```bash
curl -i -X POST http://127.0.0.1:4321/danieli/session \
  -d "password=wrong-code" \
  -d "next=/danieli/ontology-and-kcards/"
```

Expected:

- Redirects to `/danieli/?error=1`.
- Does not return a `set-cookie` header for `md1_danieli_share`.

- [ ] **Step 8: Verify correct password sets cookie and document renders**

Run:

```bash
curl -i -c /tmp/md1-danieli-cookies.txt -X POST http://127.0.0.1:4321/danieli/session \
  -d "password=local-danieli-code" \
  -d "next=/danieli/ontology-and-kcards/"
curl -s -b /tmp/md1-danieli-cookies.txt http://127.0.0.1:4321/danieli/ontology-and-kcards/ | rg "WTP Ontology|K-Cards|Exhaustive ontology"
```

Expected:

- Login response sets `md1_danieli_share`.
- Protected document response contains the Danieli ontology/K-cards page text.

- [ ] **Step 9: Verify logout clears access**

Run:

```bash
curl -i -b /tmp/md1-danieli-cookies.txt -c /tmp/md1-danieli-cookies.txt http://127.0.0.1:4321/danieli/logout
curl -i -b /tmp/md1-danieli-cookies.txt http://127.0.0.1:4321/danieli/ontology-and-kcards/
```

Expected:

- Logout redirects to `/danieli/`.
- The next protected document request redirects to the gate again.

- [ ] **Step 10: Stop the dev server**

Stop the server started in Step 4 with `Ctrl-C`.

- [ ] **Step 11: Commit verification fixes if needed**

If verification required code fixes, commit only those files:

```bash
git add apps/marketing docs/technical/vercel-deployments.md package-lock.json
git commit -m "fix: verify danieli protected share"
```

If no fixes were needed, do not create an empty commit.

---

### Task 7: Vercel Preview Verification

**Files:**
- No source files unless preview verification reveals a defect.

- [ ] **Step 1: Generate the cookie secret**

Run:

```bash
openssl rand -base64 32
```

Expected: one random base64 string. Store this as `DANIELI_SHARE_COOKIE_SECRET` in Vercel. Do not share it with Danieli.

- [ ] **Step 2: Configure Vercel preview and production env vars**

In the Vercel project for `apps/marketing`, set:

```text
DANIELI_SHARE_PASSWORD
DANIELI_SHARE_COOKIE_SECRET
```

Set both for Preview and Production environments.

- [ ] **Step 3: Deploy a preview**

Use the existing Git/Vercel workflow for the marketing project. If using Vercel CLI from the repo root, run:

```bash
vercel --cwd apps/marketing
```

Expected: Vercel creates a preview URL for the marketing app.

- [ ] **Step 4: Run browser checks against the preview URL**

Use the Vercel preview URL and verify:

```text
/danieli/
/danieli/ontology-and-kcards/
/danieli/logout
```

Expected:

- `/danieli/` shows the password form.
- `/danieli/ontology-and-kcards/` redirects to the gate before login.
- Wrong password shows "Incorrect code".
- Correct password opens the ontology/K-cards page.
- Tabs/scripts inside the ontology/K-cards page work.
- Logout removes access.

- [ ] **Step 5: Check response headers on the preview**

Run:

```bash
printf "Preview origin: "
read PREVIEW_ORIGIN
curl -I "$PREVIEW_ORIGIN/danieli/ontology-and-kcards/"
```

When prompted, paste the exact preview origin printed by Vercel in Step 3, including `https://` and no trailing slash.

Expected before login:

- Redirect status.
- No protected document HTML.

After logging in in a browser, use browser devtools Network tab to confirm the protected document response includes:

```text
cache-control: no-store, private
x-robots-tag: noindex, nofollow
```

- [ ] **Step 6: Share only after preview passes**

Share this URL with Danieli after preview verification and production deployment:

```text
https://md1.app/danieli/
```

Share only `DANIELI_SHARE_PASSWORD` with Danieli. Never share `DANIELI_SHARE_COOKIE_SECRET`.

---

## Plan Self-Review Notes

- Spec coverage: The plan covers marketing-app placement, server-side password validation, signed HTTP-only cookie, non-public raw HTML, protected routes, env vars, local testing, Vercel preview testing, and removal-friendly structure.
- Scope check: This is one bounded subsystem inside `apps/marketing`; it does not require product app, Supabase, or named-user auth work.
- Type consistency: Helper exports used by route code match the helper implementation in Task 1.
- Secret handling: The plan avoids `PUBLIC_` env vars and checks that secret values do not appear in public/client output.
