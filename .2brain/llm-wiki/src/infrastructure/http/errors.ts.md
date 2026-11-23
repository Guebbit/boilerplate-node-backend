---
source: src/infrastructure/http/errors.ts
source_sha256: 6e3e25216e3efd317e116d0810304663836320023934ae387caf24bfafd32640
context_sha256: 5dcfeee933a4e9b0dee9fd062ea3693ec91bdcb299b4c991077611c93a48b3df
generated_at: 2026-11-22T02:47:57.403889+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/errors.ts

## Purpose
The database-error interpreter: the single place where a driver failure (Mongo, Mongoose, or an unreachable Redis) is mapped to an HTTP status, so every model answers a duplicate key, bad ObjectId, or outage the same way. It deliberately has no "throw with a status from anywhere" facility; middleware with a `Response` in hand calls `rejectResponse` directly.

## Key elements
- `ConflictError` — base class for domain errors that deserve 409 (a write refused for what it would make true, not because it was malformed). Modules subclass it (for example `access`'s `AccessInvariantError`); `infrastructure` itself names no module.
- `isInfrastructureError(error)` — true for Mongo/Redis connection errors, query timeouts, or `ServiceBusyError`; these mean 503 (server problem) rather than a request problem.
- `databaseErrorInterpreter(error)` — returns a `[httpCode, message]` tuple. Mapping, in order:
  - own `kind` property (CastError) → 422 "Invalid identifier"
  - duplicate key → 409 "Already exists"
  - `name === 'BSONError'` → 422 "Invalid identifier"
  - `name === 'ValidationError'` → 422 "Invalid request"
  - `ConflictError` → 409 (uses the error's message)
  - `PreconditionFailedError` → 412 "Precondition failed"
  - query timeout → 503 "Query timed out"
  - other infrastructure errors → 503 "Service unavailable"
  - any other object → 500 with its string `message` or "Unknown error"
  - non-objects → 500 "Unknown error"
- `rejectServiceUnavailable(response, error?)` — sends a 503 via `rejectResponse` with code `QUERY_TIMEOUT` for query timeouts, otherwise `SERVICE_UNAVAILABLE` (messages from i18n `t(...)`). `rejectResponse` adds `Retry-After`.
- `logDatabaseFailure` (private) — logs `warn` for 4xx and `error` for 5xx. For 5xx it records the error on the active span. It increments `queryTimeoutsTotal` on timeouts. For a 500 the log headline is the error class name rather than its message, which may quote data.
- `rejectDatabaseError(response, context, error)` — the entry point for controller `.catch` handlers. It derives the status, logs it with the `x-request-id` header value, and responds. 503 goes through `rejectServiceUnavailable`; everything else goes through `rejectResponse(response, status)`. The driver message is logged, never returned to the client.
- A further variant, documented as the same behavior for code that returns an envelope instead of sending one (services with no `Response`), continues past the portion of the file shown here.

## Relationships
- Imports `logger` from `src/infrastructure/adapters/logger.ts` (serializes the `error` key, attaches the stack and scrubs the message) and `isRedisConnectionError` from `src/infrastructure/adapters/redis.ts`.
- Imports `isDuplicateKey`, `isConnectionError` and `isQueryTimeout` from `src/infrastructure/persistence/mongo-errors.ts`, and `PreconditionFailedError` from `src/infrastructure/persistence/versioning.ts`.
- Imports `ServiceBusyError` from `src/infrastructure/runtime/busy.ts`.
- Imports `recordErrorOnActiveSpan` from `src/infrastructure/observability/tracer.ts` and `queryTimeoutsTotal` from `src/infrastructure/observability/metrics-database.ts`.
- Imports `t` from `src/infrastructure/i18n/index.ts` for 503 messages.
- Imports `generateReject` and `rejectResponse` from `src/infrastructure/http/response.ts`, which builds the actual response envelope.
- Takes the `ErrorCode` type from `@api/error-codes`.
- Used by controllers' `.catch` handlers (`src/infrastructure/http/controller.ts`, `src/modules/account/controllers/get-refresh-token.ts`), the global error handler (`src/app/error-handling.ts`), and services such as `src/modules/access/services/grants.ts`. These usages are inferred from the graph and the file's docs, not visible in the shown portion.

## Notes
- `BSONError` and `ValidationError` are matched by `name`, not `instanceof`, because `bson` is a transitive dependency of two packages and `instanceof` against the wrong copy silently returns false. `ConflictError` uses `instanceof` because it is defined only here.
- The `kind` check uses `Object.prototype.hasOwnProperty.call`, so it works on null-prototype objects.
- Branch order matters: the query-timeout and infrastructure checks come before the generic 500 fallback.
- `ErrorCode` and `Response` are imported type-only. The file sits on `contracts:bundle`'s module-load path, which runs before `@api/error-codes` exists.
- New status mappings belong in `databaseErrorInterpreter`, not in controllers.
- For a genuine need to throw an error with a status, the file's header points to `http-errors` (already present transitively via Express) rather than a bespoke class.
