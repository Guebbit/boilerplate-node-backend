# src/modules/account/services/token-cleanup.ts

## Purpose

Provides two entry points for removing expired authentication tokens from user documents: a fire-and-forget pre-flight sweep invoked on every login and refresh request, and an admin-triggered cleanup that returns the removal count to the caller and emits an audit record.

## Key elements

- **`runTokenCleanup()`** — Calls `userRepository.tokenRemoveExpired()`, logs the pruned document count, and swallows any error (logs `error.message`). Returns `Promise<void>`; the caller never sees a rejection.
- **`adminTokenCleanup(context: CallerContext)`** — Same repository call, but returns `ResponseSuccess<{ removed: number }>` on success (after emitting an audit event) or `ResponseReject` (500) on failure. Decides the HTTP status here rather than delegating to the repository layer.

## Relationships

- **`src/modules/users/repository.ts`** — Source of `userRepository.tokenRemoveExpired()`; the only persistence call in this file.
- **`src/modules/users/index.ts`** — Re-exports `userRepository` consumed here.
- **`src/infrastructure/adapters/logger.ts`** — All diagnostic output (info on start/complete, error on failure).
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the admin endpoint's reply.
- **`src/infrastructure/http/request.ts`** — `CallerContext` type carries the authenticated caller into `adminTokenCleanup`.
- **`src/infrastructure/observability/audit.ts`** — `buildAuditEvent` + `emitAuditEvent` record the admin action.
- **`src/modules/account/audit.ts`** — Supplies `accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP` constant.
- **`src/modules/account/controllers/post-login.ts`** / **`get-refresh-token.ts`** — Downstream callers of `runTokenCleanup` as a pre-flight step before issuing or refreshing a token.
- **`src/modules/account/services/index.ts`** — Barrel re-export so controllers can import from the services namespace.
- **`src/modules/account/tests/unit/token-cleanup.test.ts`** / **`token-cleanup-job.test.ts`** — Unit tests covering both functions' success and error paths.

## Notes

- `runTokenCleanup` deliberately swallows errors: it runs inside the login/refresh hot path and a failed sweep must never block the user's request. The log line is the *only* observable output (no alerting, no retry), so it logs `error.message` rather than the `Error` object — the logger JSON-serializes its argument, and `Error` instances have no enumerable properties (would log as `{}`).
- `adminTokenCleanup` owns the HTTP status decision. The repository reports a count or throws; this layer maps that to 200/500. Previously the status lived on the Mongoose model, which was considered a layering violation.
- The two functions are intentionally separate despite sharing one repository call: different error-handling contracts, different observability requirements (audit vs. none), and different call sites.
