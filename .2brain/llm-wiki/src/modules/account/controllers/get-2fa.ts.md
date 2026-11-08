---
source: src/modules/account/controllers/get-2fa.ts
sha256: 76994639d8ec69cb5cbfc8eacab88281cad5c110ac93cc1cf401003182d7d741
generated_at: 2026-11-08T04:01:07.136256+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-2fa.ts

## Purpose

HTTP controller for `GET /account/2fa`. Returns the authenticated caller's current second-factor status (enrolled methods and still-available options). It is a thin adapter: all business logic lives in `twoFactorService.twoFactorStatus`; this file only translates the service result into an HTTP response.

## Key elements

- **`get2fa`** (exported) — Express handler. Reads `request.authContext.id`, calls `twoFactorService.twoFactorStatus(id)`, then sends `successResponse<TwoFactorStatus>` or `rejectResponse` based on the service result. Errors are delegated to `catchAs(response, 'get2fa')`.

## Relationships

- **`@infrastructure/http/response`** — supplies `successResponse` and `rejectResponse`, the two ways this controller writes to the Express `Response`.
- **`@infrastructure/http/controller`** — supplies `catchAs`, which wraps unhandled promise rejections into a structured error response tagged with the controller name.
- **`../services` (`src/modules/account/services/index.ts`)** — source of `twoFactorService.twoFactorStatus(id)`; the only business-logic call in this file.
- **`@types` (`src/types/index.ts`)** — provides the `TwoFactorStatus` interface used as the generic parameter on the success response.
- **`src/modules/account/routes.ts`** — registers `get2fa` on the `GET /account/2fa` route (and applies the `isAuth` guard).

## Notes

- Auth is `isAuth` only (no step-up). The file comment justifies this: reading your own 2FA status exposes nothing that a step-up challenge would protect.
- `request.authContext!` uses a non-null assertion — safe only because the route guard is guaranteed to populate it. If this handler were ever mounted without the guard, the `id` destructure would throw.
- Follows the project's promise-chain convention (`.then`/`.catch`) rather than `async`/`await`.
