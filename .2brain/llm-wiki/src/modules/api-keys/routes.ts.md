---
source: src/modules/api-keys/routes.ts
sha256: 0870999b839e588a7420ae259041fee285ff159eed5431429cc491575ccd1e9a
generated_at: 2026-10-14T15:00:24.185411+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/routes.ts

## Purpose

Defines the Express router for the `/api-keys` admin surface. It wires three routes—list, mint, and revoke—behind session-only authentication and granular permission checks, ensuring that the act of issuing or revoking API keys is always a human, session-authenticated operation.

## Key elements

- **`router`** (exported) — The Express `Router` instance for the `/api-keys` prefix. Registered into the app by `module.ts`.
- **Route-level middleware** — `getAuth` → `isAuth` is applied to the entire router via `router.use`, then each route additionally layers a `requirePermission('apikeys.any.*')` guard.
- **`GET /`** — Lists API keys (secrets are never returned). Permission: `apikeys.any.read`.
- **`POST /`** — Mints a new API key. Permission: `apikeys.any.create`.
- **`DELETE /:id`** — Revokes an existing key by ID. Permission: `apikeys.any.delete`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Provides `getAuth`, `isAuth`, and `requirePermission`, which form the auth/permission chain on every route.
- **`src/modules/api-keys/controllers/list-api-keys.ts`** — Handler for `GET /`.
- **`src/modules/api-keys/controllers/mint-api-key.ts`** — Handler for `POST /`.
- **`src/modules/api-keys/controllers/revoke-api-key.ts`** — Handler for `DELETE /:id`.
- **`src/modules/api-keys/module.ts`** — Registers this router into the application's route tree.

## Notes

- **`isAuth` is a deliberate choice, not a mechanical one.** The inline comment states that no handler here reads `authContext`, so `isAuthOrCredential` would pass a mechanical audit. It is rejected because allowing a credential to mint or revoke credentials means that credential never has to be rotated. Key management stays strictly human-session.
- The module-level docblock makes explicit that the credentials this module *mints* are presented to **other** routes in the system; they are never accepted on these routes themselves.
