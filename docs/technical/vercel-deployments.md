# Vercel Deployment Split

MD1 uses two Vercel projects from the same repository.

The root `vercel.json` is a transition shim for the existing single-root
GitHub/Vercel integration. It builds the product app from the repository root
and publishes `apps/app/dist`, so current PR previews do not look for the old
`public` output directory. The long-term setup should still use the two project
root directories below.

## Marketing

```text
Project name: md1-marketing
Root Directory: apps/marketing
Framework Preset: Astro
Build Command: npm run build
Output Directory: dist
Production Domain: md1.app
Additional Domain: www.md1.app
```

Environment variables:

```text
PUBLIC_CONTACT_FORM_ENDPOINT
DANIELI_SHARE_PASSWORD
DANIELI_SHARE_COOKIE_SECRET
```

`PUBLIC_CONTACT_FORM_ENDPOINT` is optional. If it is unset, the contact page falls back to `mailto:info@md1.app`.

`DANIELI_SHARE_PASSWORD` is the shared client access code for the temporary Danieli review page at `/danieli/`.
`DANIELI_SHARE_COOKIE_SECRET` signs the HTTP-only access cookie and must not be shared with clients. Generate it with:

```bash
openssl rand -base64 32
```

The Danieli HTML is stored under `apps/marketing/src/danieli-html/` and is served only by the on-demand `/danieli/[slug]/` route after password validation. Do not move these HTML files into `public/`.

## Product App

```text
Project name: md1-app
Root Directory: apps/app
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Production Domain: app.md1.app
```

Environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Do not add AI provider keys to Vercel unless product code uses Vercel server functions. AI provider secrets belong in Supabase Edge Function secrets for the current architecture.

## Supabase Auth URLs

Before switching production traffic, configure Supabase Auth with:

```text
Site URL: https://app.md1.app
Additional Redirect URLs:
  https://app.md1.app/*
  https://app.md1.app/auth
  https://app.md1.app/accept-invite
```

Keep localhost and Vercel preview URLs during rollout:

```text
http://localhost:5173/*
http://127.0.0.1:5173/*
https://*.vercel.app/*
```

This protects password recovery, invite links, and auth redirects while the deployment split is in progress.
