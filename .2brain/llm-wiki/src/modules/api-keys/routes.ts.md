---
source: src/modules/api-keys/routes.ts
sha256: 2e4a32b5ea032a33faff540588ed7427d26b6965e9c7dbc165b99cd9e9a92364
generated_at: 2026-10-29T03:14:15.838950+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/routes.ts

## Purpose

Express router that mounts the four `/api-keys` admin endpoints (list, read, mint, revoke). It exists as the single wiring point between the shared authorization middlewares and the four domain controllers, enforcing a session-only authentication policy for the credential-management surface.

## Key elements

- **`router`** (exported) — the Express `Router` instance that `module.ts` registers on the app.
- **`router.use(getAuth, isAuth)`** — applies global auth to every route in this router. Deliberately `isAuth` (session), **not** `isAuthOrCredential`: API keys minted by this module cannot be used to manage other API keys.
- **Route definitions** — each pairs a `requirePermission(scope, 'ApiKey')` guard with a controller handler:
  - `GET /` → `listApiKeys`
  - `GET /:id` → `getApiKey`
  - `POST /` → `mintApiKey`
  - `DELETE /:id` → `revokeApiKey`

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, and `requirePermission`, the three middleware functions applied to every route here.
- **`src/modules/api-keys/controllers/list-api-keys.ts`**, **`get-api-key.ts`**, **`mint-api-key.ts`**, **`revoke-api-key.ts`** — imported as the handler for the corresponding route; this file performs no business logic itself.
- **`src/modules/api-keys/module.ts`** — consumes the exported `router` to mount these routes on the Express app (and likely registers the `ApiKey` resource with the permission system).

## Notes

- The `isAuth` vs. `isAuthOrCredential` choice is an **intentional security boundary**, not an oversight. The code comment explicitly calls it out: a credential that can mint credentials would never need rotation. If you add a new route here, it must remain session-gated.
- None of the routes read `authContext` beyond what `isAuth` enforces; the controllers are expected to extract the principal from the session set by `getAuth`.
- Secrets are never returned by the list or read routes (noted in the route comments); the mint route is the only one that ever exposes a secret, and presumably only once.
