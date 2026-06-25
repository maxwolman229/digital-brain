# Danieli Password-Protected Share Design

## Goal

Publish the Claude-generated Danieli HTML review material from `docs/html/` on an MD1 Vercel-hosted app with a shared password, so Danieli clients can access it easily while the underlying HTML is not publicly served.

This is intentionally throwaway client-share work. The implementation should be small, path-scoped, easy to remove later, and should not involve product app auth, Supabase, or Vercel's paid Advanced Deployment Protection add-on.

## Recommended Approach

Use the marketing app at `apps/marketing` and expose a protected client-share area at:

```text
https://md1.app/danieli/
```

The marketing app is the right home because these pages are client-facing collateral, not product functionality. Keeping the share under `md1.app/danieli/` avoids touching `apps/app`, Supabase auth, app routes, or plant/org data boundaries.

## Alternatives Considered

1. Vercel native Password Protection
   - Pros: no custom code, enforced by Vercel before serving.
   - Cons: requires Enterprise or the Pro Advanced Deployment Protection add-on, currently priced at about `$150/month`; too much for two temporary pages.

2. Vercel Authentication
   - Pros: available on all plans and enforced by Vercel.
   - Cons: creates client friction because Danieli users need Vercel accounts, access approval, or share links.

3. Product app route under `app.md1.app`
   - Pros: product app already has authentication machinery.
   - Cons: mixes client collateral with product behavior, risks confusing auth flows, and brings Supabase into a share that only needs a shared password.

## Architecture

Add a small server-side password gate to the Astro marketing app.

The current marketing app is static by default. To support server-side cookie checks only for Danieli routes, add Astro's official Vercel adapter and opt the Danieli pages/endpoints into on-demand rendering with `export const prerender = false`. The rest of the marketing site remains static.

The raw Claude HTML files should not live in `public`. Store protected HTML under a source-controlled non-public path such as:

```text
apps/marketing/src/danieli-html/
```

Only server endpoints read from that directory and return an allowlisted page after a valid cookie check.

## Route Design

```text
/danieli/
```

Shows the password form to unauthenticated visitors. After login, shows a small document index with links to the protected Danieli pages.

```text
/danieli/session
```

`POST` endpoint. Validates the submitted shared password against `DANIELI_SHARE_PASSWORD`, sets a signed HTTP-only cookie when valid, and redirects to the safe `next` URL or back to `/danieli/`.

```text
/danieli/logout
```

Clears the Danieli cookie and redirects to `/danieli/`. This is useful for internal testing and for revoking access in a browser.

```text
/danieli/[slug]/
```

Protected endpoint. Checks the signed cookie, then returns the allowlisted raw HTML document for `slug`. If the cookie is missing or invalid, redirects to `/danieli/?next=/danieli/[slug]/`.

## Initial Documents

Expose the main ontology/K-cards page as the initial protected document:

```text
docs/html/danieli-md1-ontology-and-kcards_6_25-v0.html
```

The existing `docs/html/danieli-access-6_25-v0.html` should be treated as visual reference only. It contains a client-side password in source code and should not be shipped as access control.

Suggested public slug:

```text
/danieli/ontology-and-kcards/
```

## Shared Helper

Create a small helper module such as:

```text
apps/marketing/src/lib/danieliShare.js
```

Responsibilities:

- Define the allowlisted documents and their source HTML filenames.
- Validate the shared password.
- Sign and verify the cookie token with `DANIELI_SHARE_COOKIE_SECRET`.
- Produce safe redirect URLs only within `/danieli`.
- Provide cookie name, path, and max-age constants.

This keeps route files small and makes the access behavior easy to test.

## Environment Variables

Add these server-only environment variables to the Vercel marketing project:

```text
DANIELI_SHARE_PASSWORD
DANIELI_SHARE_COOKIE_SECRET
```

`DANIELI_SHARE_PASSWORD` is the shared password Danieli receives.

`DANIELI_SHARE_COOKIE_SECRET` is not shared. Generate it with:

```bash
openssl rand -base64 32
```

Local development can use a `.env` file under `apps/marketing` or shell-provided env vars. These values must never be exposed through `PUBLIC_` variables.

## Cookie Behavior

After successful login, set an HTTP-only cookie scoped to `/danieli`.

Recommended attributes:

- `HttpOnly`
- `Secure` in production
- `SameSite=Lax`
- `Path=/danieli`
- Max age around 7 days

The cookie should contain a signed token, not the shared password. If the shared password or cookie secret changes, existing sessions should stop working.

## Error Handling

If the password is missing or incorrect, redirect back to `/danieli/?error=1` and show a concise "Incorrect code" message.

If a protected slug is unknown, return `404`.

If required env vars are missing:

- In local development, show a clear server error so setup issues are obvious.
- In production, fail closed: do not serve protected documents.

If a `next` value is unsafe or outside `/danieli`, ignore it and redirect to `/danieli/`.

## Security Boundaries

This is shared-password protection for temporary client review, not named-user authentication.

The design must still enforce these boundaries:

- No password in client-side HTML or JavaScript.
- No raw protected HTML files in `public`.
- No direct static URL that bypasses the gate.
- No reliance on obscurity alone.
- No product app auth or Supabase dependency.
- No AI provider keys or sensitive product secrets added to Vercel.

Rate limiting is intentionally out of scope for the first pass because the share is narrow and temporary. If the link is expected to be forwarded widely, add lightweight rate limiting or move to Vercel-native protection later.

## Testing Plan

Run local and preview-deployment checks before sharing with Danieli:

1. Build the marketing app successfully.
2. Start the marketing preview server with Danieli env vars set.
3. Visit `/danieli/` and confirm the password form renders.
4. Visit `/danieli/ontology-and-kcards/` without a cookie and confirm it redirects to the gate with a safe `next` value.
5. Submit an incorrect password and confirm no access cookie is set.
6. Submit the correct password and confirm redirect to the requested document.
7. Confirm the ontology/K-cards page renders and its tabs/scripts work.
8. Visit `/danieli/logout` and confirm the protected document is no longer accessible.
9. Search the public/client build output for the actual password value and cookie secret value; neither should appear. Server bundles may reference environment variable names, but must not contain secret values.
10. Confirm the raw protected HTML is not reachable from an unprotected public path.
11. Repeat the critical gate, login, document, and logout checks on a Vercel preview deployment.

## Rollout

1. Implement on a branch and verify locally.
2. Configure `DANIELI_SHARE_PASSWORD` and `DANIELI_SHARE_COOKIE_SECRET` in the Vercel marketing project for preview and production.
3. Deploy a Vercel preview and run the testing plan.
4. Promote or merge to production only after preview verification.
5. Share `https://md1.app/danieli/` and the shared password with Danieli.

## Removal Plan

When the client-share work is no longer needed, remove:

- Danieli routes under `apps/marketing/src/pages/danieli/`.
- The Danieli helper module.
- The raw copied HTML under `apps/marketing/src/danieli-html/`.
- Danieli env vars from Vercel.

If the Vercel adapter was only needed for this share, evaluate whether to remove it and return the marketing app to fully static output.
