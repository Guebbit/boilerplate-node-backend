---
source: src/modules/account/controllers/get-2fa.ts
sha256: 0264b93ee95a09a1870f266c21f5514690c2413737cf37475cbb2a5b6e59ffc8
generated_at: 2026-09-23T17:59:40.689262+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-2fa.ts

## Purpose

Thin HTTP adapter that exposes a `GET /account/2fa` endpoint, returning the caller's own second-factor authentication status and any additional methods they could enable. Delegates all business logic to `twoFactorService.twoFactorStatus` and maps the result onto an Express response.

## Key elements

- **`get2fa`** (exported) — Express handler for `GET /account/2fa`. Extracts `id` from `request.authContext`, calls `twoFactorService.twoFactorStatus(id)`, and responds with either the `TwoFactorStatus` payload (success) or a structured error (failure / unexpected exception).

## Relationships

- **`src/modules/account/services/index.ts`** — Imports `twoFactorService`; the controller's sole domain dependency. All status logic lives in that service.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` for serializing the result or the service-level error.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError`, used as the `.catch` fallback for unexpected (e.g., database) exceptions.
- **`src/types/index.ts`** — Supplies the `TwoFactorStatus` type used to type the success payload.
- **`src/modules/account/routes.ts`** — The route table that registers `get2fa` against the `/account/2fa` path (and likely applies the `isAuth` middleware guard).

## Notes

- Auth level is intentionally `isAuth` only (basic session), *not* step-up: reading your own 2FA status is considered non-sensitive, so no MFA challenge is required.
- The `request.authContext!` non-null assertion means the route **must** be behind the auth middleware; calling it without auth will throw at runtime rather than returning a clean 401.
- The `.then` / `.catch` chain (not `async/await`) is the established pattern in this controller layer; the `.catch` handler swallows all non-service errors into a uniform database-error shape, so callers never see a raw stack.
