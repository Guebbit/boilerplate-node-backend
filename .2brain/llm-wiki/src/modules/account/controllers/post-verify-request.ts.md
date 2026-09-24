---
source: src/modules/account/controllers/post-verify-request.ts
sha256: b3531520265bafd17842080b61796f7a4c1c5877a8d2227ab2eb3e79fcf6bc40
generated_at: 2026-09-23T18:04:24.335799+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-verify-request.ts

## Purpose

Thin HTTP adapter for `POST /account/verify-request`. It re-sends an email-verification link for an already-signed-up user (e.g. when the original mail never arrived). All domain logic lives in the service layer; this file only extracts auth context, delegates, and shapes the HTTP response.

## Key elements

- **`postVerifyRequest`** (exported function) — Express request handler. Reads `request.authContext!.id`, calls `accountService.requestEmailVerificationFor(id, callerContextOf(request))`, then maps the result to a `refused` or `successResponse` payload. Errors are funneled through `catchAs(response, 'postVerifyRequest')`.

## Relationships

- **`src/modules/account/services/index.ts`** — Provides `accountService`, whose `requestEmailVerificationFor` method contains all verification-state rules and the actual re-send logic.
- **`src/infrastructure/http/controller.ts`** — Supplies the `refused` helper (short-circuits when the service returns a non-ok result) and `catchAs` (standard error → HTTP mapping).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which extracts caller metadata (IP, user-agent, etc.) to pass alongside the user id.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard 200/201/202 JSON writer.
- **`src/modules/account/routes.ts`** — Registers this handler for the `/account/verify-request` path (protected by the `isAuth` middleware chain).

## Notes

- The non-null assertion `request.authContext!` is safe only because `isAuth` middleware runs first; this file has no fallback if that invariant is broken.
- Which account states are eligible for re-verification is **not** decided here — it's the service's responsibility. A second caller cannot bypass that check through this controller.
- The `refused` check is a *result* check (the service explicitly declined), not an exception path. Real errors go through `.catch(catchAs …)` instead.
