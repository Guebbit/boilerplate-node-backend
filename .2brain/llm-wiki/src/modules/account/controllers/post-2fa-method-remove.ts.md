---
source: src/modules/account/controllers/post-2fa-method-remove.ts
sha256: bcfbc26b449f1f6483b5a9a25ccf7f466c2c5c5b2d28ecf9de4872586824fc6c
generated_at: 2026-11-08T04:03:42.651323+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-method-remove.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/remove`. Accepts a valid one-time code, delegates to `twoFactorService.removeTwoFactorMethod` to drop a single 2FA factor (leaving the rest armed), then re-mints the caller's session because the removal revokes all active sessions.

## Key elements

- **`post2faMethodRemove`** (exported) — Express controller. Validates path params (`method`) and body (`code`) via Zod schemas, calls the service, handles success/refusal, re-issues session tokens, and emits metrics.
- **`sessionSnapshotOf` → `remintSession`** — Snapshot is captured *before* the service call (the call destroys the current session); after a successful removal, `remintSession` recreates the session with `withProofs(amr, AMR.otp)` so the caller stays logged in.
- **`authTwoFactorDisableTotal`** — Prometheus counter incremented with `{ method, status: 'success' | 'failure' }` on every outcome.

## Relationships

- **`src/modules/account/services/index.ts`** — imports `twoFactorService`; the sole business-logic call is `twoFactorService.removeTwoFactorMethod(id, method, code, context)`.
- **`src/modules/account/session/session.ts`** — imports `remintSession` and `sessionSnapshotOf`; the snapshot is taken pre-deletion, the remint happens post-deletion.
- **`src/modules/account/domain/session-proof.ts`** — imports `AMR.otp` and `withProofs` to attach the OTP attestation to the re-issued session.
- **`src/modules/account/metrics.ts`** — imports `authTwoFactorDisableTotal` counter.
- **`src/infrastructure/http/controller.ts`** — imports `parseBody`, `refused`, `catchAs` for request validation and error handling.
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to pass client context into the service.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` for the 200 JSON reply.
- **`src/types/index.ts`** — imports `AuthTokens` and `TwoFactorCodeRequest` type aliases.
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/2fa/methods/:method/remove` route.

## Notes

- The session snapshot must be taken **before** the service call, because `removeTwoFactorMethod` revokes every session including the one the request is authenticated with. If the snapshot were taken after, there would be nothing to re-mint.
- `request.authContext!` uses a non-null assertion; the route is expected to be behind an auth middleware that populates it.
- The refusal path (`refused(response, result)`) short-circuits *before* the remint step and records a failure metric.
- The design rationale (stated in the file comment) mirrors the full-disable endpoint: requiring a fresh critical auth + valid code prevents a stolen-but-still-valid session from peeling factors off incrementally.
