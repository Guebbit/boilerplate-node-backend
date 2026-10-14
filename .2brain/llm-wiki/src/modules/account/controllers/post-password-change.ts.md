---
source: src/modules/account/controllers/post-password-change.ts
sha256: 3eb0dbbf27cb31e23789e4d616c2909d8bfa05e3935b80acd485653ac1b06014
generated_at: 2026-10-14T08:35:51.208107+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-password-change.ts

## Purpose

HTTP controller for `POST /account/password`. Validates the request body, delegates the actual password change (current-password-verified, no email round-trip) to `accountService.passwordChangeWithCurrent`, then re-mints the caller's session so they remain logged in. It exists as a thin adapter between the Express route and the domain service, handling validation, error mapping, metrics, and the session-reissue edge case.

## Key elements

- **`postPasswordChange`** (exported) — The sole handler. Pipeline: Zod parse → service call → session re-mint → response. No other exports.
- **`sessionSnapshotOf` (called before the service)** — Captures the current session state *before* `passwordChangeWithCurrent` revokes all sessions. The snapshot is passed to `reissueSession` so the new token continues the caller's existing session.
- **Graceful re-mint degradation** — If `reissueSession` throws, the handler still sends `200` + success message (password *did* change, old sessions *are* gone) and logs a `logger.warn`. The response body omits tokens.
- **`authPasswordChangeTotal`** — Prometheus counter incremented on every terminal path (`success` / `failure`), including the degraded re-mint branch (still counted as `success`).

## Relationships

- **`../services` (accountService)** — `passwordChangeWithCurrent` performs the actual write and revokes all other sessions. This controller is its only caller in the HTTP layer.
- **`../session/session`** — `sessionSnapshotOf` reads the pre-revoke state; `reissueSession` creates the new auth-token pair after the change.
- **`../domain/session-proof`** — Imports `AMR.password` to tag the re-minted session's authentication-method reference.
- **`../metrics`** — `authPasswordChangeTotal` counter for observability.
- **`@infrastructure/http/controller`** — `rejectValidation` (400 on bad body) and `refused` (business-logic rejection, e.g. wrong current password).
- **`@infrastructure/http/errors`** — `rejectDatabaseError` maps unexpected service errors to a 5xx.
- **`@infrastructure/http/response`** — `successResponse` shapes the 200 reply with `AuthTokens`.
- **`@infrastructure/http/request`** — `callerContextOf` extracts IP/UA etc. forwarded to the service for audit.
- **`@infrastructure/i18n`** — `t('account.password-change.success')` localises the success message.
- **`@infrastructure/adapters/logger`** — Logs the swallowed re-mint failure (the only place `logger` is used in this file).
- **`@types`** — `ChangePasswordRequest` (body shape) and `AuthTokens` (response shape).
- **`../routes`** — Wires `postPasswordChange` to the `POST /account/password` path behind `isAuth` middleware.

## Notes

- **Ordering constraint:** `sessionSnapshotOf` *must* run before `passwordChangeWithCurrent`; the service revokes every session for that user, including the caller's. Swapping the order would make the re-mint reference a dead session.
- **`request.authContext!`** is asserted non-null on the basis that `isAuth` middleware already rejected unauthenticated requests. No defensive check is repeated here.
- **Re-mint failure is intentionally non-fatal.** A 500 would mislead the client into thinking the password was *not* changed. The 200-without-tokens response is the correct signal; the `logger.warn` is the only audit trail for that degraded path.
- **Validation vs. authentication errors are distinct:** a missing/malformed field → `rejectValidation` (400); a wrong current password → `refused` (likely 401/403, business logic in the service). Both increment the metric as `failure`, but they hit different HTTP status codes and different code paths.
