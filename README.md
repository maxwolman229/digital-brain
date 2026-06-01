# MD1

This repository contains the MD1 product app, public marketing site, Supabase backend code, product documentation, and evaluation harnesses.

## Apps

- `apps/app` - MD1 Knowledge Bank product app. React, Vite, Tailwind CSS, Supabase.
- `apps/marketing` - Public MD1 marketing site. Astro, Tailwind CSS, static Vercel deployment.

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

The root `vercel.json` keeps the old single-root Vercel preview integration building the product app during the transition. The dedicated Vercel projects should use the app-specific root directories above.

The product app uses Supabase for auth, data, and Edge Functions. The marketing site is static and should not receive Supabase or AI provider secrets.
