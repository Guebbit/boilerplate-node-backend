---
source: src/infrastructure/http/errors.ts
sha256: 5ddd002bc300b8d0375a88503daf52ec7eb64654a2a5761da6a9797f869a88f9
generated_at: 2026-09-27T14:08:45.891634+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/errors.ts

## Purpose

Single-point database-error interpreter that maps any driver failure (Mongo, Mongoose, Redis outage) to a deterministic HTTP status and message tuple, so all twelve models answer the same failure identically. Also provides the two reject helpers (`rejectDatabaseError`, `rejectDatabaseEnvelope`) that controllers and services call in their `.catch()` blocks, and the `ConflictError` base class that module-level invariant violations extend.

## Key elements

- **`ConflictError`** — abstract base for 409-level domain invariants. Modules subclass it (e.g. `access`'s `AccessInvariantError`); the interpreter recognises the family via `instanceof`.
- **`isInfrastructureError(error)`** — predicate: `true` when Mongo or Redis is unreachable (i.e. 503, not 4xx/500).
- **`databaseErrorInterpreter(error): [number, string]`** — the core mapping. Branches: CastError → 422, duplicate key → 409, BSONError → 422, ValidationError → 422, `ConflictError` subclass → 409, connection error → 503, everything else → 500.
- **`rejectServiceUnavailable(response)`** — sends 503 with `Retry-After: 5` and a localised `SERVICE_UNAVAILABLE` item.
- **`rejectDatabaseError(response, context, error)`** — primary controller entry: logs the driver detail + context, then delegates to `rejectServiceUnavailable` or `rejectResponse` with the interpreted status.
- **`rejectDatabaseEnvelope(context, error)`** — same logic for services that return an envelope object instead of writing to an Express `Response` (no `Retry-After` header possible).
- **`RETRY_AFTER_SECONDS`** / **`serviceUnavailableError()`** — internal constants/factory for the 503 payload.

## Relationships

- **`src/infrastructure/persistence/mongo-errors.ts`** — supplies `isDuplicateKey` and `isConnectionError` predicates consumed by the interpreter.
- **`src/infrastructure/adapters/redis.ts`** — supplies `isRedisConnectionError` predicate.
- **`src/infrastructure/http/response.ts`** — supplies `rejectResponse` and `generateReject`; this file is the decision layer *above* the response writer.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is called in both reject helpers with the context, interpreted detail, status, and raw error for stack-trace serialisation.
- **`src/infrastructure/i18n/index.ts`** — `t()` localises the `SERVICE_UNAVAILABLE` message.
- **`src/modules/access/service.ts`** — defines `AccessInvariantError extends ConflictError`; the interpreter's `instanceof ConflictError` branch catches it.
- **`src/app/error-handling.ts`** — the global Express error middleware; uses the same `rejectServiceUnavailable` / interpreter path so uncaught rejections produce identical 503s.
- **Account controllers** (`post-login`, `get-refresh-token`, `delete-account-confirm`, 2FA endpoints) — call `rejectDatabaseError` in their `.catch()` blocks as the sole error-exit.

## Notes

- **`instanceof` vs `name` detection is deliberate and inconsistent on purpose.** `BSONError` and `ValidationError` are matched by `error.name` because `bson` is a transitive dependency of two packages and `instanceof` against the wrong copy silently returns `false`. `ConflictError` is safe with `instanceof` because it is defined exactly once in this file.
- **The driver's message is logged, never sent to the client.** The `context` string (e.g. `'getProducts'`) and the interpreted `detail` go to the log; the client only sees the fixed status + generic message.
- **`rejectDatabaseEnvelope` omits `Retry-After`** because it returns a data envelope, not an Express response — there is no header surface.
- **Non-object rejections** (`null`, a thrown string/number) fall straight to `[500, 'Unknown error']`; the interpreter guards with `typeof === 'object'` before reading any property.
- The file explicitly **does not** export a "throw-with-status" helper. If that need arises, the documented answer is the `http-errors` package already in the dependency tree.
