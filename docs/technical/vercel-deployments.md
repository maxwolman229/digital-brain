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

The marketing app uses the Astro Vercel adapter, so Vercel should deploy the `dist` build output with adapter-generated on-demand routes for temporary server-rendered shares such as Danieli.

The Astro Vercel adapter does not provide a local `astro preview` entrypoint. Use `npm run dev:marketing` or `npm run preview:marketing` for local route smoke tests, and use `npm run build:marketing` plus a Vercel preview deployment to verify the production build.

Environment variables:

```text
PUBLIC_CONTACT_FORM_ENDPOINT
```

`PUBLIC_CONTACT_FORM_ENDPOINT` is optional. If it is unset, the contact page falls back to `mailto:info@md1.app`.

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

Do not commit these values, and do not expose them with public environment variable prefixes such as `PUBLIC_` or `VITE_`.

Configure both variables for preview and production before sharing the Danieli URL. If either variable is missing, the share must fail closed and must not serve protected documents.

After adding or changing either variable in Vercel for Preview or Production, redeploy the affected deployment before sharing. Existing deployments will not pick up changed environment variables.
