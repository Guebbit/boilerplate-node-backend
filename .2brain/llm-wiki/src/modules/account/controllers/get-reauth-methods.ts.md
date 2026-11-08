---
source: src/modules/account/controllers/get-reauth-methods.ts
sha256: 3f9afb1a6cf7f8e679ce38c734e7b608dfdb5b94995016c7beb422cab3a76e7b
generated_at: 2026-11-08T04:02:18.884425+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-reauth-methods.ts

## Purpose

Thin HTTP adapter for `GET /account/reauth`. It exposes which re-authentication methods (e.g. passkey, OTP) are available to answer a `401 REAUTH_REQUIRED` challenge. It exists to keep Express plumbing separate from the `accountService.reauthMethods` business logic.

## Key elements

- **`getReauthMethods`** (exported) — Express handler that reads `request.authContext!.id`, calls `accountService.reauthMethods(id)`, then either short-circuits via `refused` or sends `successResponse<ReauthMethods>`. All errors are funneled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `refused` (early-return guard for denied/empty results) and `catchAs` (uniform error-to-HTTP mapping) used in the handler's `.then`/`.catch` chain.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, which serialises the payload and sets status headers.
- **`src/modules/account/services/index.ts`** — source of `accountService`; the `reauthMethods` method holds the actual logic.
- **`src/types/index.ts`** — exports the `ReauthMethods` shape used as the generic on `successResponse`.
- **`src/modules/account/routes.ts`** — registers `getReauthMethods` as the handler for the `/account/reauth` route (with `isAuth` middleware).

## Notes

- Auth requirement is deliberately plain `isAuth`, **not** a fresh session. The JSDoc explains: a stale token must still be able to discover its own re-auth options, otherwise it could never recover.
- `request.authContext!` uses a non-null assertion — safe only because the route is guaranteed to sit behind auth middleware; there is no runtime guard in this file.
- The `refused` check runs before `successResponse`; if the service returns a refusal (e.g. no methods configured), the handler returns early without a 200 body.
