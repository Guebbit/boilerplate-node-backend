# src/modules/account/services/token-cleanup.ts

## Purpose

Sweeps expired entries from the `tokens` array in user documents. Exposes two entry points that share the same underlying repository call but differ in contract: a fire-and-forget pre-flight step for login/refresh requests, and an admin-triggered action that must return an outcome and emit an audit record.

## Key elements

- **`runTokenCleanup(): Promise<void>`** — Calls `userRepository.tokenRemoveExpired()`, logs the count of pruned documents. Catches all errors internally (logs them, never re-throws) so the calling request is never failed.
- **`adminTokenCleanup(context: CallerContext): Promise<ResponseSuccess<{removed: number}> | ResponseReject>`** — Calls the same repository method. On success, emits an audit event (`AUTH_TOKEN_EXPIRED_CLEANUP`) and returns the removal count. On failure, logs and returns a `500` reject.

## Relationships

- **`src/modules/users/index.ts` → `repository.ts`** — Imports `userRepository`; both functions call `.tokenRemoveExpired()` on it.
- **`src/infrastructure/adapters/logger.ts`** — Uses `logger.info` / `logger.error` for operational logging in both paths.
- **`src/infrastructure/http/response.ts`** — Uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types to shape the admin response.
- **`src/infrastructure/http/request.ts`** — Imports the `CallerContext` type used by `adminTokenCleanup`.
- **`src/infrastructure/observability/audit.ts`** — Uses `emitAuditEvent` and `buildAuditEvent` to record the admin cleanup.
- **`src/modules/account/audit.ts`** — Imports `accountAuditActions` for the `AUTH_TOKEN_EXPIRED_CLEANUP` action constant.
- **`src/modules/account/controllers/post-login.ts`** / **`get-refresh-token.ts`** — Call `runTokenCleanup` as a pre-flight step before processing the request.
- **`src/modules/account/services/index.ts`** — Re-exports the two functions as part of the account services surface.
- **`src/modules/account/tests/unit/token-cleanup.test.ts`** / **`token-cleanup-job.test.ts`** — Unit tests covering both paths.

## Notes

- **Error serialization gotcha:** Both catch blocks log `error instanceof Error ? error.message : String(error)` explicitly. The logger serializes values as JSON, and `Error` instances have no enumerable own properties — logging the `Error` object directly would produce `"error":{}`.
- **HTTP status is decided here, not in the repository.** `adminTokenCleanup` maps any thrown error to a `500` reject at this layer. A prior design had the Mongoose model return `{ status: 500 }`; that was removed so the domain layer reports "count or throw" and the HTTP meaning stays in the service.
- **`runTokenCleanup` never rejects.** Its `.catch` is the terminal handler; the promise always settles. This is intentional and load-bearing for the login/refresh flow.
