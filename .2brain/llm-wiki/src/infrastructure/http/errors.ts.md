---
source: src/infrastructure/http/errors.ts
sha256: b5052da0b6a9a2b7be26857d3520c737561aae54a1b83721a727d92b3aded3a7
generated_at: 2026-11-08T03:29:10.315233+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/errors.ts

## Purpose

The database-error interpreter: the single mapping point that translates a driver failure (Mongo, Mongoose, Redis) into an HTTP status code and message. It exists so that all twelve models and every controller's `.catch` produce the same status for the same failure (duplicate key → 409, bad ObjectId → 422, outage → 503), rather than each site re-deriving the answer inline.

## Key elements

- **`ConflictError`** (exported class) — Base for domain errors that deserve 409. Modules subclass it (e.g. `access`'s `AccessInvariantError`); `databaseErrorInterpreter` recognises the family via `instanceof`.
- **`isInfrastructureError(error)`** (exported) — Returns `true` when the failure is a Mongo/Redis connection error or a `ServiceBusyError` (bounded queue full), as opposed to a request the server understood and refused.
- **`databaseErrorInterpreter(error)`** (exported) — The core decision function. Returns a `[httpCode, message]` tuple. Branches in order: CastError → 422, duplicate key → 409, BSONError → 422, Mongoose `ValidationError` → 422, `ConflictError` subclass → 409, `PreconditionFailedError` → 412, infrastructure outage → 503, everything else → 500.
- **`rejectServiceUnavailable(response)`** (exported) — Sends a 503 with the canonical `SERVICE_UNAVAILABLE` error item; `rejectResponse` adds `Retry-After`.
- **`rejectDatabaseError(response, context, error)`** (exported) — The entry point every controller `.catch` calls. Derives status via the interpreter, logs at the appropriate level, then dispatches the response (503 path vs. generic `rejectResponse`).
- **`rejectDatabaseEnvelope(context, error)`** (exported) — Same derivation + logging, but returns a reject envelope (via `generateReject`) for service-layer code that has no `Response` object.
- **`logDatabaseFailure(context, status, detail, error)`** (internal) — Logs at `warn` for 4xx, `error` for 5xx; attaches `status` and raw `error` as structured fields so the logger's serializer can attach a stack trace.

## Relationships

- **`@infrastructure/http/response.ts`** — Imports `rejectResponse` and `generateReject`; `rejectServiceUnavailable`, `rejectDatabaseError`, and `rejectDatabaseEnvelope` all delegate actual response construction to these.
- **`@infrastructure/persistence/mongo-errors.ts`** — Imports `isDuplicateKey` and `isConnectionError`; consumed inside `databaseErrorInterpreter` and `isInfrastructureError`.
- **`@infrastructure/persistence/versioning.ts`** — Imports `PreconditionFailedError`; checked in the interpreter for the 412 branch.
- **`@infrastructure/adapters/redis.ts`** — Imports `isRedisConnectionError`; consumed by `isInfrastructureError`.
- **`@infrastructure/runtime/busy.ts`** — Imports `ServiceBusyError`; consumed by `isInfrastructureError`.
- **`@infrastructure/adapters/logger.ts`** — Imports `logger`; used by `logDatabaseFailure` for warn/error level logging.
- **`@infrastructure/i18n`** — Imports `t`; used to internationalise the 503 message string.
- **`@api/error-codes`** (type-only) — Imports `ErrorCode` for the `SERVICE_UNAVAILABLE` constant shape.
- **`src/app/error-handling.ts`** — The global Express error handler; also calls `rejectServiceUnavailable` for the same 503 path.
- **`src/modules/access/services/grants.ts`** — Throws `AccessInvariantError` (a `ConflictError` subclass) that the interpreter maps to 409.
- **`src/modules/account/controllers/*`** (get-refresh-token, post-account-restore, post-login-2fa-send) — Call `rejectDatabaseError` / `rejectDatabaseEnvelope` in their `.catch` handlers.
- **`scripts/audit/api-standards.yaml`** — Documents the status-code contract that this file enforces (409/422/503/500 semantics).

## Notes

- **No bespoke "throw with status" class.** The module doc explicitly rejects this pattern; if a need arises, the standard answer is `http-errors` (already in the tree transitively via Express).
- **`instanceof` vs `name`-string detection is deliberate.** `BSONError` and Mongoose `ValidationError` are detected by `name` because `bson` is a transitive dependency of two packages and `instanceof` against the wrong copy silently returns `false`. `ConflictError` is safe to use with `instanceof` because it is defined once, in this file.
- **The `kind` check uses `Object.prototype.hasOwnProperty.call`** rather than `error.hasOwnProperty()` to survive null-prototype objects (e.g. `Object.create(null)`).
- **`error` is never assumed to be an `Error` instance.** Every branch guards with `typeof === 'object'` and reads properties defensively; the generic 500 fallback handles non-object rejections (`null`, a string, a thrown number).
- **i18n import is type-only for `ErrorCode`** to avoid a runtime circular dependency on `@api/error-codes` during the `contracts:bundle` module-load path (see the comment on the import).
- **`rejectDatabaseEnvelope` omits `Retry-After`.** The hint is added later by `rejectResponse` when the envelope is actually sent, avoiding duplication.
