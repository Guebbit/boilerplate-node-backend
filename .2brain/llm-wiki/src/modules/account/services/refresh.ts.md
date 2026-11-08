---
source: src/modules/account/services/refresh.ts
sha256: 2efefa3314473b9881aacfc8262348a570274e845a4cd79526a7f4acff88774a
generated_at: 2026-11-08T04:22:29.793646+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/refresh.ts

## Purpose

Orchestrates the refresh-token → access-token exchange: accepts an optional refresh cookie, delegates the actual rotation to the JWT session module, classifies the outcome (success, missing token, invalid, reuse), and records the appropriate audit row and metric before returning the new token pair to the controller. It exists to keep the "what to audit and how" policy separate from the "how to rotate" mechanics.

## Key elements

- **`refreshAccessToken(refreshToken, context)`** — the sole export. Accepts `string | undefined` for the refresh cookie and a `CallerContext`. Resolves with a `RotatedSession` (new access/refresh tokens + `maxAge`) or rejects. Every path—success, missing, invalid, reuse—is audited exactly once inside this function.
- **`MissingRefreshTokenError`** — internal (non-exported) sentinel error thrown when the cookie is absent. Lets the single `.catch` distinguish "no token" from other rejections without branching the happy path.
- **`failureReason(error)`** — private mapper that translates non-reuse errors into the audit `metadata.reason` string (`missing_token`, `session_idle`, `invalid_token`).

## Relationships

- **`src/modules/account/session/jwt.ts`** — provides `rotateRefreshToken` (the actual rotation), plus `TokenReuseError`, `TokenRejection`, and the `RotatedSession` type consumed here.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is called on every outcome.
- **`src/modules/account/audit.ts`** — supplies the `accountAuditActions` enum values used as audit `action` fields.
- **`src/modules/account/metrics.ts`** — `authRefreshReuseTotal.inc()` is called when a `TokenReuseError` is caught.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — source of the `CallerContext` type.
- **`src/modules/account/services/index.ts`** — barrel file that re-exports `refreshAccessToken` for consumers.

## Notes

- **Reuse vs. ordinary failure is intentionally distinct in the audit trail.** A `TokenReuseError` produces a different `action` (`AUTH_REFRESH_TOKEN_REUSE_DETECTED`), carries the real `actorUserId` from the error, and omits `metadata.reason`. Ordinary failures use `AUTH_TOKEN_REFRESHED` with `actorUserId: 'anonymous'` and a `reason` string.
- **`actorRole` is never set** (defaults to `anonymous`) because this request never carried a verified access token; the file's comment notes that guessing admin status would misreport a fact the user-id already pinpoints.
- The function is fully async in effect (returns a `Promise`) but declared as a promise-chain rather than `async/await`, so the rotation and audit recording are sequenced via `.then`/`.catch`.
- `MissingRefreshTokenError` is never exported; it is a private control-flow device, not a public API surface.
