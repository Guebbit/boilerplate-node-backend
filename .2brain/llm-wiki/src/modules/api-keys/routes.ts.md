---
source: src/modules/api-keys/routes.ts
sha256: 706fe7f3d7b7f863628b1bcf795dffcd54348e0a2d7baaebe0b5197d955ca9d4
generated_at: 2026-09-23T18:25:05.832990+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/routes.ts

## Purpose

Defines the Express router for the `/api-keys` admin surface. It wires three CRUD-adjacent routes (list, mint, revoke) to their respective controllers and enforces that every request is session-authenticated by a human with the appropriate `apikeys.any.*` permission.

## Key elements

- **`router`** (exported) — the Express `Router` instance that `module.ts` mounts. All three routes are attached here.
- **Route table**
    - `GET /` → `listApiKeys` (perm: `apikeys.any.read`)
    - `POST /` → `mintApiKey` (perm: `apikeys.any.create`)
    - `DELETE /:id` → `revokeApiKey` (perm: `apikeys.any.delete`)
- **Auth middleware chain** — `getAuth` + `isAuth` applied router-wide; `requirePermission` applied per-route.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, and `requirePermission`; the only auth primitives this file uses.
- **`src/modules/api-keys/controllers/list-api-keys.ts`** — handler for `GET /`.
- **`src/modules/api-keys/controllers/mint-api-key.ts`** — handler for `POST /`.
- **`src/modules/api-keys/controllers/revoke-api-key.ts`** — handler for `DELETE /:id`.
- **`src/modules/api-keys/module.ts`** — parent module that mounts this `router` onto the application.
- **`tests/support/routed-modules.ts`** — test harness that registers routed modules (including this one) for integration tests.

## Notes

- The router deliberately uses `isAuth` (session-only) **not** `isAuthOrCredential`. The inline comment makes explicit this is a security decision, not a mechanical side-effect: a credential that can mint or revoke credentials would eliminate the need to ever rotate it. Issuing and revoking API keys is restricted to human, session-authenticated actors.
- The API keys produced by `mintApiKey` are intended to be presented to _other_ routes in the system; they are never accepted as credentials on this router's own routes.
