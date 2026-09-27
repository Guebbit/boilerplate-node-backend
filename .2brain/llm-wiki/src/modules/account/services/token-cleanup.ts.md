---
source: src/modules/account/services/token-cleanup.ts
sha256: f49e6d7795305ad4081e66ce77affdc1d301736876b90605fe8d2a25850dffad
generated_at: 2026-09-27T14:30:47.176822+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/token-cleanup.ts

## Purpose

Sweeps expired (and rotated-away) entries from the `tokens` array across all user documents. Exposes two entry points: a fire-and-forget pre-flight step run on every login/refresh request, and an admin-triggered action behind `DELETE /account/tokens/expired` that returns an HTTP outcome and writes an audit record.

## Key elements

- **`runTokenCleanup(): Promise<void>`** — Calls `userService.tokenRemoveExpired` with the reuse-detection window. All errors are caught and logged; the caller (login/refresh controller) is never rejected.
- **`adminTokenCleanup(context: CallerContext)`** — Same underlying sweep, but records an audit entry (`AUTH_TOKEN_EXPIRED_CLEANUP`) on success and returns `generateSuccess({ removed })` or `generateReject(500, [])` on failure.
- Both functions pass `getReuseDetectionWindowMilliseconds()` (from `session/config`) as the age threshold, **not** the rotation grace window.

## Relationships

- **`@modules/users` (`userService.tokenRemoveExpired`)** — Performs the actual collection-wide removal; returns a count or throws.
- **`controllers/post-login.ts`, `controllers/get-refresh-token.ts`** — Invoke `runTokenCleanup` as a pre-flight step before processing the request.
- **`session/config.ts`** — Supplies the reuse-detection window used as the sweep threshold.
- **`@infrastructure/adapters/logger.ts`** — Logs start, completion, and error details (raw `Error` object passed through so `redactFormat` preserves `name`/`stack`).
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the admin HTTP response.
- **`@infrastructure/observability/audit.ts` + `../audit`** — `recordAudit` with `accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP` for the admin path.
- **`services/index.ts`** — Re-exports this module for the account barrel.
- **Tests** — `token-cleanup.test.ts`, `token-cleanup-job.test.ts`, and `jwt.test.ts` cover both entry points and their interaction with rotation.

## Notes

- **Threshold choice is deliberate.** The sweep uses the *reuse-detection* window, not the rotation grace window. Using the shorter grace window would delete a tombstone before `rotateRefreshToken` could detect a replay as token reuse.
- **Error containment is intentional.** `runTokenCleanup` swallows all errors so a slow/failing sweep can never break login or refresh.
- **HTTP status is decided in this file.** The admin catch block maps any failure to `500`; the Mongoose layer only reports a count or throws.
- **Stryker mutators are disabled** on log-line statements (`// Stryker disable next-line all` / `all`) to prevent mutation-testing from altering diagnostic output.
