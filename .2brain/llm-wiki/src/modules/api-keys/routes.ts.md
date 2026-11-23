---
source: src/modules/api-keys/routes.ts
source_sha256: 67a597660cc7ddb2b44da4b0da917170b334afab7f7388c3c4c05d445fedb82f
context_sha256: 94ed39082221143fb185447aa7d7abda5b3783e2ef0991f11096e907b65892cb
generated_at: 2026-11-22T04:22:55.198800+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/routes.ts

## Purpose
Defines the Express router for the `/api-keys` admin surface: listing, reading, minting, and revoking API keys. Every route requires a human session and an `apikeys.*` permission. The credentials this module mints are meant for other routes, never for these.

## Key elements
- `router`: the exported Express `Router`, with these routes:
  - `GET /` → `requirePermission('read', 'ApiKey')` → `listApiKeys` (lists keys, never their secrets)
  - `GET /:id` → `requirePermission('read', 'ApiKey')` → `getApiKey` (one key, never its secret)
  - `POST /` → `requirePermission('create', 'ApiKey')` → `mintApiKey`
  - `DELETE /:id` → `requirePermission('delete', 'ApiKey')` → `revokeApiKey`
- `router.use(getAuth, isAuth)`: router-wide authentication, applied before any route.

## Relationships
- `src/kernel/middlewares/authorizations.ts`: provides `getAuth`, `isAuth` and `requirePermission`, used for authentication and per-route permission checks.
- `src/modules/api-keys/controllers/get-api-keys.ts`: supplies `listApiKeys`.
- `src/modules/api-keys/controllers/get-api-key.ts`: supplies `getApiKey`.
- `src/modules/api-keys/controllers/post-api-key.ts`: supplies `mintApiKey`.
- `src/modules/api-keys/controllers/delete-api-key.ts`: supplies `revokeApiKey`.
- `src/modules/api-keys/module.ts`: a neighbor in the graph. This file only exports `router`, and the mounting is not visible here.

## Notes
- The router uses `isAuth`, not `isAuthOrCredential`, on purpose. Nothing here reads `authContext`, so it would pass the mechanical test for `isAuthOrCredential`. It is excluded because a credential able to mint credentials would never need rotating. Issuing and revoking keys therefore stays a human, session-authenticated act.
- Permissions are checked per route using the `ApiKey` subject with `read`, `create` and `delete` actions.
