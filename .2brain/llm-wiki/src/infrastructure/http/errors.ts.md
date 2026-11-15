---
source: src/infrastructure/http/errors.ts
sha256: 431c8ffd3e0d9e2e0d2623bcae6b439d1e038d445ad03e41dce3975d3bda5da7
generated_at: 2026-11-14T18:00:00.248611+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/errors.ts

## Purpose

The single point where a caught driver or domain failure (Mongo, Mongoose, Redis, queue, timeout) is mapped to an HTTP status and message, so all twelve models answer a duplicate key, a bad ObjectId, or an outage identically. Controllers and services call its reject helpers from their `.catch()` blocks rather than interpreting the error themselves.

## Key elements

- **`ConflictError`** — base class for domain errors that deserve 409. Modules subclass it (e.g. `AccessInvariantError` in `access`); `instanceof` against the base is how the interpreter recognises the family.
- **`isInfrastructureError(error)`** — returns `true` if the failure is a dependency outage, a full bounded queue, or a query timeout (i.e. the server is temporarily broken, not the request at fault).
- **`databaseErrorInterpreter(error): [number, string]`** — the core mapping function. Inspects the error object (CastError `kind`, duplicate-key flag, `BSONError`/`ValidationError` by name, `ConflictError`/`PreconditionFailedError` by `instanceof`, query-timeout, generic infra) and returns the HTTP status + detail tuple.
- **`rejectServiceUnavailable(response, error?)`** — sends a 503 with the correct `ErrorCode` (`QUERY_TIMEOUT` vs `SERVICE_UNAVAILABLE`) and a `Retry-After` hint via `rejectResponse`.
- **`rejectDatabaseError(response, context, error)`** — the entry point every controller `.catch` uses. Derives the status, logs at the right severity, then dispatches to `rejectServiceUnavailable` or `rejectResponse`.
- **`rejectDatabaseEnvelope(context, error)`** — same as above for services that return a reject envelope instead of writing to an Express `Response`.
- **`logDatabaseFailure`** (internal) — logs `warn` for 4xx, `error` for 5xx; records the error on the active span for 5xx; increments the `queryTimeoutsTotal` metric for timeouts.

## Relationships

- **`src/infrastructure/persistence/mongo-errors.ts`** — provides `isDuplicateKey`, `isConnectionError`, `isQueryTimeout` predicates used by the interpreter.
- **`src/infrastructure/adapters/redis.ts`** — provides `isRedisConnectionError` so Redis outages map to 503 alongside Mongo.
- **`src/infrastructure/runtime/busy.ts`** — exports `ServiceBusyError`, recognised as an infrastructure failure (503).
- **`src/infrastructure/persistence/versioning.ts`** — exports `PreconditionFailedError`, mapped to 412.
- **`src/infrastructure/http/response.ts`** — provides `rejectResponse` and `generateReject`, which actually write the HTTP response.
- **`src/infrastructure/adapters/logger.ts`** — the `logger` instance used to emit warn/error lines with structured fields.
- **`src/infrastructure/i18n/index.ts`** — `t()` used for client-facing messages in `rejectServiceUnavailable`.
- **`src/infrastructure/observability/tracer.ts`** — `recordErrorOnActiveSpan` marks the span red for 5xx.
- **`src/infrastructure/observability/metrics-database.ts`** — `queryTimeoutsTotal` counter incremented on timeout detection.
- **`src/modules/access/services/grants.ts`** — throws `AccessInvariantError`, a `ConflictError` subclass recognised by the interpreter's 409 branch.
- **`src/app/error-handling.ts`** — the global Express error handler; uses the same `rejectServiceUnavailable` / error-code conventions defined here.

## Notes

- **BSONError / ValidationError are detected by `name` string, not `instanceof`.** `bson` is a transitive dependency of two packages, so two copies exist in `node_modules` and `instanceof` against the wrong copy silently returns `false`. `ConflictError` and `PreconditionFailedError` *are* safe to check with `instanceof` because they are defined once in this tree.
- **CastError detection uses `Object.prototype.hasOwnProperty.call(error, 'kind')`** rather than `error.hasOwnProperty('kind')` so it still works on a null-prototype object.
- **No "throw with a status" helper exists here by design.** The stated convention: a middleware that already has the `Response` calls `rejectResponse` directly; if a throw-with-status is genuinely needed, use `http-errors` (already transitive via Express) rather than a bespoke class.
- **`ErrorCode` is imported as `import type`** because this file sits on `contracts:bundle`'s incidental module-load path, which executes before `@api/error-codes` is available at runtime.
- **500 log headline uses `error.name` (the class), not the message**, because the message may quote user data. The raw error is passed as a structured field so the logger's serializer can attach a stack trace and scrub.
- **`rejectDatabaseEnvelope` does not add `Retry-After`** (unlike `rejectResponse`), since it returns a data envelope rather than writing an HTTP response.
