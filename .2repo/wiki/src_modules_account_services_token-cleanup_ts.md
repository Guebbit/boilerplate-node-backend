# src/modules/account/services/token-cleanup.ts

## Purpose

Removes expired (and grace-window-lapsed rotated) tokens from user documents. Exposes two entry points: a fire-and-forget sweep run as a pre-flight step on every login/refresh request, and an admin-triggered cleanup behind `DELETE /account/tokens/expired` that must return a concrete outcome and write an audit record.

## Key elements

- **`runTokenCleanup(): Promise<void>`** — Calls `userRepository.tokenRemoveExpired(graceMs)`. All errors are caught, logged, and swallowed; the caller never sees a rejection. Intended to run before the actual auth logic on login and refresh.
- **`adminTokenCleanup(context: CallerContext): Promise<ResponseSuccess<{removed:number}> | ResponseReject>`** — Same repository call, but propagates the result: on success emits an `AUTH_TOKEN_EXPIRED_CLEANUP` audit event and returns `generateSuccess({ removed })`; on failure logs and returns `generateReject(500, [])`.
- **`getRotationGraceMilliseconds()`** (imported from `../session/config`) — Supplies the grace window passed to the repository so rotated tokens whose window has elapsed are also purged.

## Relationships

- **`src/modules/users/index.ts` / `repository.ts`** — Source of `userRepository.tokenRemoveExpired(ms)`, the only database operation this file performs.
- **`src/modules/account/controllers/post-login.ts`** and **`get-refresh-token.ts`** — Call `runTokenCleanup` as a pre-flight step before issuing/refreshing a token.
- **`src/infrastructure/observability/audit.ts`** + **`src/modules/account/audit.ts`** — Provide `emitAuditEvent`, `buildAuditEvent`, and the `accountAuditActions.AUTH_TOKEN_EXPIRED_CLEANUP` constant used only by `adminTokenCleanup`.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the HTTP payload for the admin path.
- **`src/infrastructure/http/request.ts`** — Supplies the `CallerContext` type consumed by `adminTokenCleanup`.
- **`src/infrastructure/adapters/logger.ts`** — Structured logging in both paths.
- **`src/modules/account/session/config.ts`** — `getRotationGraceMilliseconds` defines how long a rotated token remains valid after rotation.
- **`src/modules/account/tests/unit/token-cleanup.test.ts`** / **`token-cleanup-job.test.ts`** — Unit tests covering both exported functions.

## Notes

- **Error-logging convention:** Both catch blocks log `error instanceof Error ? error.message : String(error)` rather than the `Error` object itself. The logger JSON-serializes, and `Error` instances have no enumerable own properties, so logging the object would produce `"error":{}`.
- **HTTP status is decided here, not in the repository.** A prior design had `tokenRemoveExpired` resolve `{ status: 500 }` on failure (a Mongoose model choosing an HTTP status). That was removed; the sweep now either resolves a count or throws, and this file maps the failure to a 500.
- **`runTokenCleanup` is intentionally non-cancellable and non-observable by the caller.** It always resolves (never rejects), so callers on the hot path (login, refresh) need no `.catch`.
- **No idempotency guard beyond the repository query.** If two requests hit simultaneously, both will call `tokenRemoveExpired`; the second will simply find zero rows to remove.
