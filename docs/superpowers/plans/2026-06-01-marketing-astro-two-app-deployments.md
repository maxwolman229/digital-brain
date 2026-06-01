# Marketing Astro Two-App Deployments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert this repo into a small two-app workspace with the existing MD1 product app and a new Astro marketing site, then deploy the marketing site to `md1.app` and the product app to a separate deployment target.

**Architecture:** Keep the existing Vite/React/Supabase product app intact under `apps/app`. Build the public marketing site as a static Astro app under `apps/marketing`, using real routes, Astro pages/components, Tailwind CSS, MD1 design tokens, production metadata, and a real contact path. Use two Vercel projects connected to the same Git repo, each with its own Root Directory.

**Tech Stack:** npm workspaces, Astro, Tailwind CSS with the `@tailwindcss/vite` plugin, Vite + React for the existing app, Supabase at repo root, Vercel project root directories.

---

## Deployment Domain Decision

Recommended production shape:

```text
md1.app             -> Astro marketing site
www.md1.app         -> Redirect or alias to md1.app
app.md1.app         -> Existing MD1 product app
core.md1.app        -> Optional future alias or internal environment
```

### Option A: Product app at `core.md1.app`

Pros:
- Clean separation between public marketing and authenticated product.
- Existing React routes can remain `/app`, `/auth`, `/plants`, `/admin`, `/bevcan`, and `/accept-invite`.
- Avoids hosting the SPA below a path prefix, which reduces React Router and Vite `base` risk.
- Cleaner security and ops story: marketing has no Supabase env vars; product app has app-only env vars.
- Easy to add `app.md1.app` later as a redirect or alias if buyers expect that wording.

Cons:
- Users must move from `md1.app` to a subdomain when entering the product.
- `core` is less conventional than `app` for SaaS login URLs.

### Option B: Product app at `app.md1.app` (selected)

Pros:
- Very common SaaS convention.
- Easy for users to remember.
- Same technical benefits as `core.md1.app`.
- Cleanly communicates that this subdomain is the actual product surface.

Cons:
- `app.md1.app/app` becomes an awkward route if the existing product continues using `/app`.
- If we keep the current route names, the authenticated product URL becomes `app.md1.app/app`.
- Could be cleaner after a future product route rename from `/app` to `/`.
- Requires deciding what the product app should do at `https://app.md1.app/`, because the current product app route `/` renders its own public landing page.

### Option C: Product app at `md1.app/app`

Pros:
- Single primary domain.
- Marketing and product feel like one property to users.

Cons:
- Harder with two independent Vercel projects. It usually requires proxy rewrites from the marketing project to the product project.
- The current product app already uses `/app` as an internal route, so path-prefix hosting creates routing ambiguity.
- More risk around assets, Vite `base`, React Router basename, redirects, auth callbacks, and invite/recovery links.
- Marketing and product deployments become coupled at the domain layer.

Decision for this plan: use **Option B** for the first production split: `md1.app` for marketing and `app.md1.app` for the product app.

Product-app root decision:

```text
https://app.md1.app/      -> product entry route, not a duplicate marketing page
https://app.md1.app/app   -> existing authenticated app route for this migration
https://app.md1.app/auth  -> existing sign-in route
```

For this migration, keep the existing `/app` route to avoid unnecessary React Router churn. Update the product app's root route after the split so `app.md1.app/` acts as a product entry point: redirect logged-in users to `/app`, redirect unauthenticated users to `/auth`, and keep the public marketing site only on `md1.app`.

## File Structure Target

```text
md1/
  apps/
    app/
      src/
      public/
      index.html
      package.json
      postcss.config.js
      tailwind.config.js
      vercel.json
      vite.config.js
    marketing/
      public/
      src/
        components/
          ContactForm.astro
          Footer.astro
          KnowledgeCardPreview.astro
          Logo.astro
          SiteNav.astro
        layouts/
          BaseLayout.astro
        pages/
          contact.astro
          index.astro
          platform.astro
        styles/
          global.css
      astro.config.mjs
      package.json
      tailwind.config.js
  archive/
    landingpage-original.html
    prototype.html
  docs/
    product/
    strategy/
    technical/
    superpowers/
      plans/
  eval/
  supabase/
  AGENTS.md
  README.md
  package.json
  package-lock.json
```

Keep out of scope for this iteration:

```text
packages/sdk/
packages/ui/
packages/shared/
```

Those packages can come later when shared code pressure is real. For this launch, adding shared packages would create abstraction work before we know the duplication is worth it.

## Task 1: Confirm Branch, Baseline, And Constraints

**Files:**
- Read: `package.json`
- Read: `vite.config.js`
- Read: `vercel.json`
- Read: `landingpage.html`
- Read: `TODO.md`
- Read: `first_round_tech_audit.md`

- [ ] **Step 1: Confirm branch**

Run:

```bash
git branch --show-current
git status --short
```

Expected:

```text
codex-marketing-astro-workspace-plan
```

`git status --short` should either be clean or show only intentional planning files.

- [ ] **Step 2: Run the current product app build before moving files**

Run:

```bash
npm run build
```

Expected:

```text
vite v...
✓ built in ...
```

If this fails before any migration work, record the error in the implementation notes and decide whether to fix it before the workspace move. The migration should not hide pre-existing build failures.

- [ ] **Step 3: Record the no-go boundaries**

Do not change application behavior in this migration except where required by paths, scripts, deployment configuration, and the product app's root route after the marketing site moves to `md1.app`.

Preserve these product app routes:

```text
/
/auth
/onboarding
/plants
/app
/bevcan
/bevcan/pending
/accept-invite
/admin
```

Preserve this app backend placement:

```text
supabase/functions/
supabase/migrations/
supabase/seed.sql
```

- [ ] **Step 4: Commit baseline note if build is failing**

If Step 2 fails, create a short note before continuing:

```bash
mkdir -p docs/technical
printf '%s\n' '# Pre-Migration Build Baseline' '' 'The product app build failed before the workspace migration. See the migration PR notes for the exact command output.' > docs/technical/pre-migration-build-baseline.md
git add docs/technical/pre-migration-build-baseline.md
git commit -m "docs: record pre-migration build baseline"
```

If Step 2 passes, skip this commit.

## Task 2: Move The Existing Product App Under `apps/app`

**Files:**
- Move: `src/` -> `apps/app/src/`
- Move: `public/` -> `apps/app/public/`
- Move: `index.html` -> `apps/app/index.html`
- Move: `vite.config.js` -> `apps/app/vite.config.js`
- Move: `tailwind.config.js` -> `apps/app/tailwind.config.js`
- Move: `postcss.config.js` -> `apps/app/postcss.config.js`
- Move: `vercel.json` -> `apps/app/vercel.json`
- Move: `package.json` -> `apps/app/package.json`
- Modify: `apps/app/src/App.jsx`
- Remove and regenerate: `package-lock.json`
- Create: root `package.json`

- [ ] **Step 1: Create app directory**

Run:

```bash
mkdir -p apps/app
```

- [ ] **Step 2: Move existing app files**

Run:

```bash
git mv src apps/app/src
git mv public apps/app/public
git mv index.html apps/app/index.html
git mv vite.config.js apps/app/vite.config.js
git mv tailwind.config.js apps/app/tailwind.config.js
git mv postcss.config.js apps/app/postcss.config.js
git mv vercel.json apps/app/vercel.json
git mv package.json apps/app/package.json
```

- [ ] **Step 3: Update `apps/app/package.json` name and scripts**

Edit `apps/app/package.json` so it starts with:

```json
{
  "name": "@md1/app",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

Preserve the existing `dependencies` and `devDependencies` from the original product app package.

- [ ] **Step 4: Create root workspace `package.json`**

Create `package.json` at the repo root:

```json
{
  "name": "md1",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "workspaces": [
    "apps/*"
  ],
  "scripts": {
    "dev:app": "npm --workspace @md1/app run dev",
    "build:app": "npm --workspace @md1/app run build",
    "preview:app": "npm --workspace @md1/app run preview",
    "dev:marketing": "npm --workspace @md1/marketing run dev",
    "build:marketing": "npm --workspace @md1/marketing run build",
    "preview:marketing": "npm --workspace @md1/marketing run preview",
    "build": "npm run build:app && npm run build:marketing"
  }
}
```

- [ ] **Step 5: Regenerate root lockfile**

Run:

```bash
rm package-lock.json
npm install
```

Expected:

```text
added ...
audited ...
```

There should be one root `package-lock.json`, not nested lockfiles in each app.

- [ ] **Step 6: Update the product app root route for `app.md1.app`**

Edit `apps/app/src/App.jsx`.

Remove this import:

```js
import LandingPage from './components/LandingPage.jsx'
```

Replace the current public root route:

```jsx
<Route path="/" element={<LandingPage loggedInAs={profile?.displayName ?? null} onLogout={handleLogout} />} />
```

with:

```jsx
<Route
  path="/"
  element={
    !session ? (
      <Navigate to="/auth" replace />
    ) : profile && activePlantId ? (
      <Navigate to="/app" replace />
    ) : profile ? (
      <Navigate to="/plants" replace />
    ) : (
      <Navigate to="/onboarding" replace />
    )
  }
/>
```

This makes `https://app.md1.app/` a product entry route instead of a duplicate marketing page.

- [ ] **Step 7: Verify product app still builds from workspace**

Run:

```bash
npm run build:app
```

Expected:

```text
> @md1/app@0.0.1 build
> vite build
✓ built in ...
```

- [ ] **Step 8: Commit product app move**

Run:

```bash
git add apps/app package.json package-lock.json
git add -u
git commit -m "chore: move product app into workspace"
```

## Task 3: Scaffold The Astro Marketing App

**Files:**
- Create: `apps/marketing/package.json`
- Create: `apps/marketing/astro.config.mjs`
- Create: `apps/marketing/tailwind.config.js`
- Create: `apps/marketing/public/favicon.svg`
- Create: `apps/marketing/src/styles/global.css`
- Create: `apps/marketing/src/layouts/BaseLayout.astro`
- Create: `apps/marketing/src/pages/index.astro`
- Create: `apps/marketing/src/pages/platform.astro`
- Create: `apps/marketing/src/pages/contact.astro`

- [ ] **Step 1: Create marketing directories**

Run:

```bash
mkdir -p apps/marketing/public apps/marketing/src/components apps/marketing/src/layouts apps/marketing/src/pages apps/marketing/src/styles
```

- [ ] **Step 2: Create `apps/marketing/package.json`**

Create:

```json
{
  "name": "@md1/marketing",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "@astrojs/check": "^0.9.4",
    "@astrojs/sitemap": "^3.3.1",
    "@fontsource/ibm-plex-mono": "^5.2.7",
    "@fontsource/ibm-plex-sans": "^5.2.8",
    "@tailwindcss/vite": "^4.1.0",
    "astro": "^5.0.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 3: Create `apps/marketing/astro.config.mjs`**

Create:

```js
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://md1.app',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
})
```

- [ ] **Step 4: Create `apps/marketing/src/styles/global.css`**

Create:

```css
@import '@fontsource/ibm-plex-sans/300.css';
@import '@fontsource/ibm-plex-sans/400.css';
@import '@fontsource/ibm-plex-sans/500.css';
@import '@fontsource/ibm-plex-sans/600.css';
@import '@fontsource/ibm-plex-sans/700.css';
@import '@fontsource/ibm-plex-sans/800.css';
@import '@fontsource/ibm-plex-mono/400.css';
@import '@fontsource/ibm-plex-mono/500.css';
@import 'tailwindcss';

:root {
  --md1-navy: #12233a;
  --md1-navy-deep: #0d1a2c;
  --md1-off-white: #f4f1ec;
  --md1-off-white-2: #ece7de;
  --md1-ink: #12233a;
  --md1-ink-muted: rgba(18, 35, 58, 0.62);
  --md1-border: #d4cdc0;
  --md1-border-dark: #1f3454;
  --md1-accent: #e8b547;
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  color: var(--md1-ink);
  background: var(--md1-off-white);
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--md1-off-white);
  color: var(--md1-ink);
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

a {
  color: inherit;
}

.mono {
  font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

- [ ] **Step 5: Create `apps/marketing/tailwind.config.js`**

Create:

```js
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        md1: {
          navy: '#12233A',
          deep: '#0d1a2c',
          paper: '#F4F1EC',
          paper2: '#ECE7DE',
          ink: '#12233A',
          muted: 'rgba(18,35,58,0.62)',
          border: '#D4CDC0',
          accent: '#E8B547',
        },
      },
    },
  },
}
```

- [ ] **Step 6: Install workspace dependencies**

Run:

```bash
npm install
```

Expected:

```text
added ...
audited ...
```

- [ ] **Step 7: Verify empty Astro build works**

Create temporary minimal pages:

```astro
--- 
---
<html lang="en">
  <body>MD1</body>
</html>
```

Use that content for each of:

```text
apps/marketing/src/pages/index.astro
apps/marketing/src/pages/platform.astro
apps/marketing/src/pages/contact.astro
```

Run:

```bash
npm run build:marketing
```

Expected:

```text
Result (3 files)
✓ Complete
```

- [ ] **Step 8: Commit Astro scaffold**

Run:

```bash
git add apps/marketing package-lock.json
git commit -m "feat: scaffold astro marketing app"
```

## Task 4: Port The Marketing Page Into Astro Components

**Files:**
- Create: `apps/marketing/src/components/Logo.astro`
- Create: `apps/marketing/src/components/SiteNav.astro`
- Create: `apps/marketing/src/components/Footer.astro`
- Create: `apps/marketing/src/components/KnowledgeCardPreview.astro`
- Create: `apps/marketing/src/components/ContactForm.astro`
- Modify: `apps/marketing/src/layouts/BaseLayout.astro`
- Modify: `apps/marketing/src/pages/index.astro`
- Modify: `apps/marketing/src/pages/platform.astro`
- Modify: `apps/marketing/src/pages/contact.astro`

- [ ] **Step 1: Create `Logo.astro`**

Create:

```astro
---
const { dark = false } = Astro.props
---

<a
  href="/"
  class:list={[
    'inline-flex border-[3px] px-2 pb-1 pt-0.5 text-[1.45rem] font-extrabold leading-none tracking-[0.01em]',
    dark ? 'border-md1-paper text-md1-paper' : 'border-md1-ink text-md1-ink',
  ]}
  aria-label="MD1 home"
>
  M/D/1
</a>
```

- [ ] **Step 2: Create `SiteNav.astro`**

Create:

```astro
---
import Logo from './Logo.astro'

const { current = 'home', dark = false, showCta = false } = Astro.props

const linkClass = (name) => [
  'text-sm transition-colors',
  current === name ? (dark ? 'text-md1-paper' : 'text-md1-ink') : (dark ? 'text-md1-paper/60 hover:text-md1-paper' : 'text-md1-ink/60 hover:text-md1-ink'),
]
---

<nav class:list={[
  'sticky top-0 z-50 grid grid-cols-[1fr_auto_1fr] items-center border-b px-6 py-4 md:px-10',
  dark ? 'border-transparent bg-md1-navy text-md1-paper' : 'border-md1-border bg-md1-paper text-md1-ink',
]}>
  <div class="justify-self-start">
    <Logo dark={dark} />
  </div>
  <div class="flex items-center gap-5 md:gap-8">
    <a href="/" class:list={linkClass('home')}>Home</a>
    <a href="/platform/" class:list={linkClass('platform')}>Platform</a>
    <a href="/contact/" class:list={linkClass('contact')}>Contact</a>
  </div>
  <div class="justify-self-end">
    {showCta && (
      <a
        href="/contact/"
        class:list={[
          'inline-flex border px-4 py-2 text-sm font-medium transition-colors',
          dark ? 'border-md1-paper text-md1-paper hover:bg-md1-paper hover:text-md1-navy' : 'border-md1-ink text-md1-ink hover:bg-md1-ink hover:text-md1-paper',
        ]}
      >
        Request a demo
      </a>
    )}
  </div>
</nav>
```

- [ ] **Step 3: Create `BaseLayout.astro`**

Create:

```astro
---
import '../styles/global.css'

const {
  title = 'MD1 | The Knowledge Company for Heavy Industry',
  description = 'MD1 captures manufacturing operating context and turns it into trusted, durable knowledge.',
  current = 'home',
  darkNav = false,
  showCta = true,
} = Astro.props

import SiteNav from '../components/SiteNav.astro'
import Footer from '../components/Footer.astro'
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={Astro.url.href} />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="canonical" href={Astro.url.href} />
  </head>
  <body>
    <SiteNav current={current} dark={darkNav} showCta={showCta} />
    <main>
      <slot />
    </main>
    <Footer />
  </body>
</html>
```

- [ ] **Step 4: Create `Footer.astro`**

Create:

```astro
<footer class="border-t border-md1-border px-6 py-10 text-center text-sm text-md1-ink/60 md:flex md:items-center md:justify-between md:px-10 md:text-left">
  <div>MD1 · The Knowledge Company for Heavy Industry</div>
  <div class="mt-5 flex justify-center gap-8 md:mt-0">
    <a href="/platform/" class="hover:text-md1-ink">Platform</a>
    <a href="/contact/" class="hover:text-md1-ink">Contact</a>
    <span>© 2026</span>
  </div>
</footer>
```

- [ ] **Step 5: Port visible content from `landingpage.html`**

Port the existing sections into Astro pages with these route boundaries:

```text
apps/marketing/src/pages/index.astro
  Hero: "In manufacturing, data is visible. Context is not."
  Rebuilding the Knowledge Commons
  The Problem

apps/marketing/src/pages/platform.astro
  How MD1 Works
  The Knowledge Bank
  MD1 ChatBotSDK

apps/marketing/src/pages/contact.astro
  Contact
  Email
  Location
  Working with us
  Contact form or contact CTA
```

Convert inline `onclick` navigation to real links:

```text
onclick="go('landing')"  -> href="/"
onclick="go('platform')" -> href="/platform/"
onclick="go('contact')"  -> href="/contact/"
```

Use **MD1 ChatBotSDK** consistently instead of mixing `MD1 ChatSDK`, `MD1 Context SDK`, and other variants.

- [ ] **Step 6: Remove fake controls that imply live product behavior**

In the marketing preview components:

```text
Remove or visually neutralize "Add +" buttons.
Keep evidence/version/confidence rows as non-clickable preview UI.
Use cursor-default for preview-only UI.
Keep explanatory tooltips only if they work on mobile and keyboard focus.
```

This keeps the site professional and avoids a public page filled with controls that do nothing.

- [ ] **Step 7: Verify page routes**

Run:

```bash
npm run dev:marketing -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:4321/
http://127.0.0.1:4321/platform/
http://127.0.0.1:4321/contact/
```

Expected:

```text
Each URL loads directly.
Browser back and forward work.
No page depends on inline page-switching JavaScript.
```

- [ ] **Step 8: Commit Astro port**

Run:

```bash
git add apps/marketing
git commit -m "feat: port marketing site to astro"
```

## Task 5: Make Contact Production-Ready

**Files:**
- Modify: `apps/marketing/src/components/ContactForm.astro`
- Modify: `apps/marketing/src/pages/contact.astro`
- Modify: `apps/marketing/src/layouts/BaseLayout.astro`

- [ ] **Step 1: Choose the launch contact mechanism**

Use this default for the first launch:

```text
Primary CTA: mailto:info@md1.app
Secondary form: static HTML form posting to a form provider endpoint configured in Vercel as PUBLIC_CONTACT_FORM_ENDPOINT
```

Rationale:

```text
The marketing site remains static.
No server function or secret is required in the marketing deployment.
The visible email always works even if the form endpoint is not configured.
```

- [ ] **Step 2: Create `ContactForm.astro` with graceful fallback**

Create:

```astro
---
const endpoint = import.meta.env.PUBLIC_CONTACT_FORM_ENDPOINT
---

{endpoint ? (
  <form action={endpoint} method="POST" class="border border-md1-border p-8">
    <label class="mb-2 block text-sm font-medium text-md1-ink/70" for="name">Name</label>
    <input class="mb-6 w-full border-0 border-b border-md1-border bg-transparent px-0 py-3 text-md1-ink outline-none focus:border-md1-ink" id="name" name="name" autocomplete="name" required />

    <label class="mb-2 block text-sm font-medium text-md1-ink/70" for="email">Email</label>
    <input class="mb-6 w-full border-0 border-b border-md1-border bg-transparent px-0 py-3 text-md1-ink outline-none focus:border-md1-ink" id="email" name="email" type="email" autocomplete="email" required />

    <label class="mb-2 block text-sm font-medium text-md1-ink/70" for="company">Company</label>
    <input class="mb-6 w-full border-0 border-b border-md1-border bg-transparent px-0 py-3 text-md1-ink outline-none focus:border-md1-ink" id="company" name="company" autocomplete="organization" />

    <label class="mb-2 block text-sm font-medium text-md1-ink/70" for="message">Message</label>
    <textarea class="mb-6 min-h-32 w-full resize-y border-0 border-b border-md1-border bg-transparent px-0 py-3 text-md1-ink outline-none focus:border-md1-ink" id="message" name="message" required></textarea>

    <button class="inline-flex bg-md1-ink px-6 py-3 text-sm font-medium text-md1-paper transition-opacity hover:opacity-85" type="submit">
      Send message
    </button>
  </form>
) : (
  <div class="border border-md1-border p-8">
    <p class="text-md1-ink/70">Email us directly to start a conversation.</p>
    <a class="mt-6 inline-flex bg-md1-ink px-6 py-3 text-sm font-medium text-md1-paper transition-opacity hover:opacity-85" href="mailto:info@md1.app">
      info@md1.app
    </a>
  </div>
)}
```

- [ ] **Step 3: Add Vercel environment variable for marketing**

In the Vercel project for `apps/marketing`, add:

```text
PUBLIC_CONTACT_FORM_ENDPOINT=<the HTTPS endpoint from the selected form provider>
```

If no provider is selected by launch day, leave this unset. The email fallback still renders.

- [ ] **Step 4: Verify no fake alert remains**

Run:

```bash
rg "Demo form|alert\\(|onclick=\"go|javascript:" apps/marketing
```

Expected:

```text
No matches.
```

- [ ] **Step 5: Commit contact readiness**

Run:

```bash
git add apps/marketing
git commit -m "feat: add production-ready marketing contact path"
```

## Task 6: Archive Prototype Artifacts And Clean Repo Noise

**Files:**
- Move: `landingpage.html` -> `archive/landingpage-original.html`
- Move: `prototype.html` -> `archive/prototype.html`
- Modify: `.gitignore`
- Optional remove from Git: `.superpowers/`
- Optional remove from Git: `supabase/.temp/`

- [ ] **Step 1: Archive standalone HTML files**

Run:

```bash
mkdir -p archive
git mv landingpage.html archive/landingpage-original.html
git mv prototype.html archive/prototype.html
```

- [ ] **Step 2: Update `.gitignore`**

Edit `.gitignore` to:

```gitignore
node_modules
dist
.env.local
.env*.local
.astro
.vercel
apps/*/dist
apps/*/.astro
supabase/.temp
.superpowers
```

- [ ] **Step 3: Remove generated local state from version control**

Run:

```bash
git rm -r --cached .superpowers supabase/.temp
```

Expected:

```text
rm '.superpowers/...'
rm 'supabase/.temp/...'
```

These files are local tool state and Supabase CLI cache files. They should not be source artifacts.

- [ ] **Step 4: Commit cleanup**

Run:

```bash
git add archive .gitignore
git add -u
git commit -m "chore: archive prototypes and ignore local state"
```

## Task 7: Configure Two Vercel Projects

**Files:**
- Keep: `apps/app/vercel.json`
- Optional create: `apps/marketing/vercel.json`
- Vercel dashboard settings

- [ ] **Step 1: Product app Vercel project settings**

Create or update the product app Vercel project:

```text
Project name: md1-app
Root Directory: apps/app
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
Production Domain: app.md1.app
```

Environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Do not add AI provider keys to this Vercel project unless product code actually uses Vercel server functions. Existing AI provider secrets should remain in Supabase Edge Function secrets.

- [ ] **Step 2: Update Supabase Auth URL configuration**

In Supabase Auth settings, add the new product app URLs before switching production traffic:

```text
Site URL: https://app.md1.app
Additional Redirect URLs:
  https://app.md1.app/*
  https://app.md1.app/auth
  https://app.md1.app/accept-invite
```

Keep the current preview and localhost URLs until the new deployment has been verified:

```text
http://localhost:5173/*
http://127.0.0.1:5173/*
https://*.vercel.app/*
```

This protects password recovery, invite links, and any Supabase auth redirect flow while the domain split is in progress.

- [ ] **Step 3: Preserve product SPA rewrite**

Keep `apps/app/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 4: Marketing Vercel project settings**

Create the marketing Vercel project:

```text
Project name: md1-marketing
Root Directory: apps/marketing
Framework Preset: Astro
Build Command: npm run build
Output Directory: dist
Install Command: npm install
Production Domain: md1.app
Additional Domain: www.md1.app
```

Environment variables:

```text
PUBLIC_CONTACT_FORM_ENDPOINT
```

Leave `PUBLIC_CONTACT_FORM_ENDPOINT` unset if the launch uses only the direct email CTA.

- [ ] **Step 5: Add `www` redirect if needed**

If Vercel does not automatically canonicalize `www.md1.app`, create `apps/marketing/vercel.json`:

```json
{
  "redirects": [
    {
      "source": "/:path*",
      "has": [{ "type": "host", "value": "www.md1.app" }],
      "destination": "https://md1.app/:path*",
      "permanent": true
    }
  ]
}
```

Only add this after confirming Vercel accepts host-based redirect conditions for the project. If Vercel dashboard canonical domain settings handle it, no marketing `vercel.json` is needed.

- [ ] **Step 6: Commit Vercel config if added**

Run only if `apps/marketing/vercel.json` was created:

```bash
git add apps/marketing/vercel.json
git commit -m "chore: add marketing vercel redirects"
```

## Task 8: Verify Local Builds And Browser Behavior

**Files:**
- Read: `apps/app/dist/`
- Read: `apps/marketing/dist/`

- [ ] **Step 1: Build both apps from root**

Run:

```bash
npm run build
```

Expected:

```text
> build:app
✓ built in ...
> build:marketing
✓ Complete
```

- [ ] **Step 2: Preview marketing locally**

Run:

```bash
npm run preview:marketing -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:4321/
http://127.0.0.1:4321/platform/
http://127.0.0.1:4321/contact/
```

Expected:

```text
Each route loads directly.
No console errors.
Nav links use normal URLs.
Contact page has no fake alert.
Desktop layout is polished.
Mobile layout has no overlapping text or controls.
```

- [ ] **Step 3: Preview product app locally**

Run:

```bash
npm run preview:app -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/app
http://127.0.0.1:4173/auth
```

Expected:

```text
The product root route redirects unauthenticated users to /auth.
The protected app route still redirects unauthenticated users to /auth.
The build assets load with no 404s after moving under apps/app.
```

- [ ] **Step 4: Check metadata**

Run:

```bash
rg "<title>|description|og:title|canonical|twitter:card" apps/marketing/dist
```

Expected:

```text
Each marketing page has a title, description, canonical link, Open Graph title, and Twitter card metadata.
```

- [ ] **Step 5: Commit verification fixes**

If any route, build, or visual issue required code changes:

```bash
git add apps package-lock.json
git commit -m "fix: polish marketing workspace verification issues"
```

If no code changes were required, skip this commit.

## Task 9: Deploy And Validate Vercel Projects

**Files:**
- No source files unless deployment reveals a source issue.
- Vercel dashboard and DNS settings.

- [ ] **Step 1: Connect both Vercel projects to the same repository**

Configure:

```text
md1-marketing -> Root Directory apps/marketing
md1-app       -> Root Directory apps/app
```

Vercel supports multiple projects connected to one monorepo by setting each project's root directory.

- [ ] **Step 2: Deploy preview builds**

Deploy both projects from the branch:

```text
codex-marketing-astro-workspace-plan
```

Expected:

```text
Marketing preview succeeds.
Product app preview succeeds.
```

- [ ] **Step 3: Validate marketing preview**

Check:

```text
/ loads the hero.
/platform/ loads directly.
/contact/ loads directly.
Nav links work.
Contact email opens mail client.
Configured form endpoint accepts a test submission if PUBLIC_CONTACT_FORM_ENDPOINT is set.
No console errors.
No obvious mobile layout overlap at 390px wide.
```

- [ ] **Step 4: Validate product preview**

Check:

```text
/ redirects unauthenticated users to /auth and logged-in users to /app.
/auth loads.
/app redirects unauthenticated users as expected.
Supabase env vars are available only to the product app project.
No AI provider keys are configured in the marketing project.
```

- [ ] **Step 5: Point domains**

After previews are approved:

```text
md1.app      -> md1-marketing
www.md1.app  -> md1-marketing
app.md1.app  -> md1-app
```

Keep old deployment aliases alive until DNS propagation and auth callback checks are complete.

- [ ] **Step 6: Post-domain smoke test**

Open:

```text
https://md1.app/
https://md1.app/platform/
https://md1.app/contact/
https://app.md1.app/
https://app.md1.app/auth
https://app.md1.app/app
```

Expected:

```text
Marketing pages load over HTTPS.
Product app loads over HTTPS.
Product auth and invite/recovery routes continue to work with the new domain.
```

## Task 10: Update Docs For The New Repository Shape

**Files:**
- Create or modify: `README.md`
- Modify: `AGENTS.md`
- Optional modify: `WORKFLOWS.md`

- [ ] **Step 1: Create root `README.md`**

Create:

```markdown
# MD1

This repository contains the MD1 product app, marketing site, Supabase backend code, product documentation, and evaluation harnesses.

## Apps

- `apps/app` - MD1 Knowledge Bank product app. React, Vite, Tailwind, Supabase.
- `apps/marketing` - Public MD1 marketing site. Astro, Tailwind, static Vercel deployment.

## Backend

- `supabase/functions` - Supabase Edge Functions.
- `supabase/migrations` - Database migrations.
- `supabase/seed.sql` - Seed data.

## Common Commands

```bash
npm install
npm run dev:app
npm run dev:marketing
npm run build:app
npm run build:marketing
npm run build
```

## Deployment

- Marketing site: `md1.app`, Vercel Root Directory `apps/marketing`.
- Product app: `app.md1.app`, Vercel Root Directory `apps/app`.
```

- [ ] **Step 2: Update `AGENTS.md` paths**

Add a section near the top:

```markdown
## Repository layout

- `apps/app` contains the MD1 Knowledge Bank product app.
- `apps/marketing` contains the public Astro marketing site.
- `supabase` remains at the repository root for Edge Functions, migrations, and seed data.
- `archive` contains historical standalone prototypes that should be used as reference only.
```

Update any instruction that refers to root `src/`, `public/`, or `vite.config.js` so it points to `apps/app`.

- [ ] **Step 3: Commit documentation**

Run:

```bash
git add README.md AGENTS.md WORKFLOWS.md
git commit -m "docs: document two-app workspace"
```

## Task 11: Final Review Before Merge

**Files:**
- All changed files

- [ ] **Step 1: Show final status**

Run:

```bash
git status --short
git log --oneline --max-count=8
```

Expected:

```text
git status --short
```

is clean.

- [ ] **Step 2: Run final verification**

Run:

```bash
npm run build
```

Expected:

```text
Both app builds pass.
```

- [ ] **Step 3: Review changed files**

Run:

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Expected changed areas:

```text
apps/app
apps/marketing
archive
docs
package.json
package-lock.json
.gitignore
AGENTS.md
README.md
```

Unexpected changed areas should be inspected before merging.

- [ ] **Step 4: Prepare PR summary**

Use this PR summary:

```markdown
## Summary

- Moves the existing MD1 product app into `apps/app`.
- Adds a static Astro marketing site in `apps/marketing`.
- Sets up npm workspaces and root build scripts for both apps.
- Archives standalone HTML prototypes.
- Documents Vercel deployment split: `md1.app` for marketing, `app.md1.app` for product app.

## Verification

- `npm run build`
- Browser smoke test for marketing routes: `/`, `/platform/`, `/contact/`
- Browser smoke test for product routes: `/`, `/auth`, `/app`
```

## References

- Astro static Vercel deploy docs: https://docs.astro.build/en/guides/deploy/vercel/
- Astro Tailwind guidance: https://docs.astro.build/en/guides/integrations-guide/tailwind/
- Tailwind Astro guide: https://tailwindcss.com/docs/guides/astro
- Vercel monorepo docs: https://vercel.com/docs/monorepos/
- Vercel project settings docs: https://vercel.com/docs/project-configuration/project-settings

## Self-Review

- Spec coverage: The plan covers the repo split, Astro marketing app, separate Vercel deployments, `md1.app` marketing deployment, product app domain options, contact readiness, local verification, deployment verification, and docs updates.
- Placeholder scan: The only angle-bracket value is the intentionally user-provided form provider endpoint in Vercel settings. The plan includes a working no-endpoint fallback, so the launch path does not depend on an unresolved code placeholder.
- Type and naming consistency: The plan consistently uses `apps/app`, `apps/marketing`, `@md1/app`, `@md1/marketing`, `md1.app`, and `app.md1.app`.
