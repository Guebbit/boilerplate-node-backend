---
source: src/modules/account/controllers/post-password-change.ts
sha256: f255149a0d90697f59da6e0983ed2d4ed04e7a89e9c2410018b06756957255c4
generated_at: 2026-11-08T04:06:34.029692+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-password-change.ts

## Purpose

HTTP handler for `POST /account/password`. Changes a user's password by verifying the current one inline (no email round-trip), then re-mints the caller's own session token so they stay signed in in the tab they are typing in.

## Key elements

- **`postPasswordChange(request, response)`** — exported Express handler. Parses the `ChangePasswordBody` schema, calls `accountService.passwordChangeWithCurrent`, then reissues the caller's session. Returns `200` with fresh `AuthTokens` on success.

## Relationships

- **`routes.ts`** — registers this handler on the `POST /account/password` route (upstream caller).
- **`services/index.ts`** — provides `accountService.passwordChangeWithCurrent`, the core business operation (verify current password, write new one, revoke other sessions).
- **`session/session.ts`** — `sessionSnapshotOf` captures the caller's session *before* the purge; `reissueSession` mints a fresh token afterward.
- **`session/strategy.ts`** — underlying token-minting strategy used by `reissueSession` (indirect).
- **`domain/session-proof.ts`** — supplies the `AMR.password` value stamped onto the new session proof.
- **`metrics.ts`** — `authPasswordChangeTotal` Prometheus counter incremented with `status: 'success' | 'failure'` on every code path.
- **`infrastructure/http/controller.ts`** — `parseBody` (Zod validation) and `refused` (service-level rejection check) helpers.
- **`infrastructure/http/request.ts`** — `callerContextOf` extracts IP/UA metadata passed into the service.
- **`infrastructure/http/response.ts`** — `successResponse` shapes the `200` payload.
- **`infrastructure/http/errors.ts`** — `rejectDatabaseError` maps unexpected DB errors to a client-safe `500`.
- **`infrastructure/adapters/logger.ts`** — `logger.warn` records re-mint failures that are intentionally swallowed.
- **`types/index.ts`** — `ChangePasswordRequest` (body shape) and `AuthTokens` (success response shape).

## Notes

- **Re-mint failure is non-fatal.** If `reissueSession` throws *after* the password write and session purge have already committed, the handler still returns `200` with an empty `AuthTokens` body. A `500` here would mislead the client into thinking the password was *not* changed. The failure is logged at `warn` level for observability.
- **Snapshot ordering.** `sessionSnapshotOf` must run *before* `passwordChangeWithCurrent` because the service revokes every session, including the caller's. The snapshot is then passed into `reissueSession` to preserve the original session's attributes.
- **Auth is assumed, not checked.** `request.authContext` is non-null only because the `isAuth` middleware runs upstream in `routes.ts`; this handler does not re-verify it.
- **Validation split.** Malformed or out-of-bounds fields (schema violations) produce a `400` via `parseBody` and are *not* counted as wrong-password attempts. The "repeat matches" rule lives in the service layer because it is a business rule, not a shape rule.
