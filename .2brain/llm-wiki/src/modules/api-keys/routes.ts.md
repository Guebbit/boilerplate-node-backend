---
source: src/modules/api-keys/routes.ts
sha256: 138dd1f4028a330fe45e0bb0bf7388981b5d64c5bcb1e29c81174eb3b6e31c34
generated_at: 2026-11-08T05:03:48.710665+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/routes.ts

## Purpose

Defines the Express router for the `/api-keys` admin surface. It wires four CRUD-style endpoints (list, read, create, delete) to their controller handlers and enforces session-based authentication plus per-route permission checks. The module exists so that API-key management is a dedicated, permission-gated route group separate from the routes that *consume* the keys it mints.

## Key elements

- **`router`** (exported) — The `express.Router` instance that is mounted (by `module.ts`) at the `/api-keys` path.
- **`getAuth`, `isAuth`** (from `@kernel/middlewares/authorizations`) — Applied via `router.use` before any route handler. `isAuth` enforces a human session only; the file explicitly does **not** use `isAuthOrCredential`, by design.
- **`requirePermission(resource, action)`** (from the same middleware file) — Applied per-route to gate on `read|create|delete` + `ApiKey`.
- **`listApiKeys`** — `GET /` handler (imported from `controllers/get-api-keys`).
- **`getApiKey`** — `GET /:id` handler (imported from `controllers/get-api-key`).
- **`mintApiKey`** — `POST /` handler (imported from `controllers/post-api-key`).
- **`revokeApiKey`** — `DELETE /:id` handler (imported from `controllers/delete-api-key`).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Provides the three middleware functions (`getAuth`, `isAuth`, `requirePermission`) that gate every route in this file.
- **`src/modules/api-keys/controllers/get-api-keys.ts`**, **`get-api-key.ts`**, **`post-api-key.ts`**, **`delete-api-key.ts`** — Supply the four handler functions that this router attaches to its endpoints. This file is the sole caller of those handlers.
- **`src/modules/api-keys/module.ts`** — Imports `router` from this file and mounts it into the application's route tree.

## Notes

- **`isAuth` is a deliberate choice, not a default.** The inline comment explains that a credential which can mint credentials would never need rotation, so API-key management is restricted to human sessions. Do not "upgrade" this to `isAuthOrCredential` without re-evaluating that security trade-off.
- **Keys here are admin-facing only.** The module doc states that the credentials minted by this module are presented to *other* routes in the system, never back to this router.
- **List and single-read endpoints never return secrets.** The route comments call this out explicitly; the actual redaction logic lives in the controllers, but the contract is enforced at this layer's documentation.
