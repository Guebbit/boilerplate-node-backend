---
source: src/modules/account/services/token-cleanup.ts
sha256: 9de4eed037705202e112df49871bc38f6334cf1dddb2bb7cb3351f606db6258d
generated_at: 2026-09-23T18:09:48.671431+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/token-cleanup.ts

## Purpose

Removes expired and superseded token entries from user documents. Provides two entry points: a fire-and-forget sweep that runs ahead of every login/refresh request, and an admin-facing variant that returns an outcome and writes an audit record.

## Key elements

- **`runTokenCleanup(): Promise<void>`** — Fire-and-forget sweep. Calls `userService.tokenRemoveExpired(getReuseDetectionWindowMilliseconds())`, logs the count removed, and swallows all errors (logs them at `error` level). Intended to be called as a pre-flight step so a failure here never fails the triggering request.
- **`adminTokenCleanup(context: CallerContext): Promise<ResponseSuccess<{removed:number}> | ResponseReject>`** — Admin-triggered cleanup (`DELETE /account/tokens/expired`). Same underlying call, but returns `generateSuccess({removed})` on success or `generateReject(500, [])` on failure. Records an audit entry via `recordAudit` using `accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP`.

## Relationships

- **`@modules/users` (`userService`)** — Source of `tokenRemoveExpired`. This file never touches Mongoose directly; all DB work is delegated there.
- **`@modules/account/session/config`** — Supplies `getReuseDetectionWindowMilliseconds`, the window passed to `tokenRemoveExpired`. (Not the rotation grace window—see Notes.)
- **`@infrastructure/adapters/logger`** — `logger.info` / `logger.error` for both functions. The error object is passed whole so `redactFormat` can serialize `{name, message, stack}`.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the admin response.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit record in `adminTokenCleanup` only.
- **`@modules/account/audit`** — Provides the `accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP` enum value.
- **`@types`** — `CallerContext` is the shape of the admin caller identity.
- **`controllers/post-login.ts`, `controllers/get-refresh-token.ts`** — Call `runTokenCleanup` as a pre-flight step before issuing/rotating a token.
- **`services/index.ts`** — Re-exports this module for other consumers.
- **`tests/unit/token-cleanup.test.ts`, `tests/unit/token-cleanup-job.test.ts`, `tests/integration/jwt.test.ts`** — Unit and integration coverage for both functions.

## Notes

- The sweep window is the **reuse-detection window**, not the rotation grace window. A stale tombstone must survive at least as long as reuse detection will look for it; purging on the shorter grace window would delete a superseded entry before `rotateRefreshToken` could flag a later replay.
- Error handling in `runTokenCleanup` is intentionally a no-op beyond logging—there is no rethrow, no fallback. This is a hard guarantee: the triggering request must proceed.
- HTTP status mapping (500) is decided in this file, not in `userService`. The comment explicitly states a Mongoose model should not choose an HTTP status.
- Stryker mutation-testing `disable`/`restore` annotations guard the logging lines (they are deliberately side-effect-only statements that shouldn't be mutated).
