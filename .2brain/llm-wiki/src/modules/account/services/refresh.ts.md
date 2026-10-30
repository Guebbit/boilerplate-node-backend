---
source: src/modules/account/services/refresh.ts
sha256: 2efefa3314473b9881aacfc8262348a570274e845a4cd79526a7f4acff88774a
generated_at: 2026-10-29T02:44:19.238299+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/refresh.ts

## Purpose

Implements the refresh-token exchange endpoint logic: given a (possibly absent) refresh cookie value, it rotates the session via `rotateRefreshToken`, records an audit row for every outcome (success, missing token, invalid token, idle-expired session, or reuse of an already-rotated token), and rethrows the error so the controller can shape the HTTP response. The rotation itself is delegated to `../session/jwt`; this file is the orchestration, audit, and metrics layer around it.

## Key elements

- **`refreshAccessToken(refreshToken: string | undefined, context: CallerContext): Promise<RotatedSession>`** — The sole export. Resolves with the new `{ accessToken, refreshToken, refreshMaxAge }` triple on success; rejects with the original error on failure. All audit and metrics bookkeeping happens in a single `.catch` so the happy path stays branch-free.
- **`MissingRefreshTokenError`** (local) — Marker error thrown when the refresh cookie is absent, so the `catch` block can distinguish "no token" from "bad token" without the caller branching twice.
- **`failureReason(error)`** (local) — Maps a failure to the `metadata.reason` string written into the audit row: `'missing_token'`, `'session_idle'`, or `'invalid_token'`.
- **`authRefreshReuseTotal`** (from `../metrics`) — Counter incremented only when `TokenReuseError` is caught.

## Relationships

- **`../session/jwt`** — Source of the actual rotation (`rotateRefreshToken`) and the error types this file inspects (`TokenReuseError`, `TokenRejection`). The `RotatedSession` return type also comes from here.
- **`@infrastructure/observability/audit`** — `recordAudit` is called on both success and failure paths to write the audit trail.
- **`../audit`** — Provides the action constants (`AUTH_TOKEN_REFRESHED`, `AUTH_REFRESH_TOKEN_REUSE_DETECTED`) used in audit records.
- **`../metrics`** — Provides `authRefreshReuseTotal`, incremented on reuse detection.
- **`@types` / `src/types/auth-context.ts`** — Supplies the `CallerContext` type that carries caller identity for audit.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports this module's public API to consumers.

## Notes

- **Reuse vs. ordinary failure are audited differently.** Reuse (`TokenReuseError`) gets its own action, carries the resolved `actorUserId`, and omits `metadata.reason`. Ordinary failures get `actorUserId: 'anonymous'` (no verified access token was ever presented) and a `metadata.reason` string.
- **`actorRole` is intentionally left at its default (`anonymous`)** in the reuse case: the request never carried a verified access token, so admin status is unknown and guessing would misrepresent the audit fact.
- **The function rethrows the error** after recording audit/metrics. It does not swallow or transform the error; the caller (controller/presenter) is responsible for the HTTP status and body.
- **`failureReason` does not handle `TokenReuseError`** — that path is branched on separately in the `.catch` and never reaches the `metadata.reason` field.
