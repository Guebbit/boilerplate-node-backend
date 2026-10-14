---
source: src/infrastructure/http/errors.ts
sha256: 3852d63ecac37035d2dd8e83f4e523250c5cc9af9d0b9f2ba2d167eeef66e7d7
generated_at: 2026-10-14T07:53:47.388470+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/errors.ts

## Purpose

Single-point mapper that translates raw driver failures (Mongo, Mongoose, Redis, or a saturated queue) into the correct HTTP status and client-safe message. Every controller's `.catch()` and every service that must return an error envelope delegates status derivation here, so all twelve models produce the same answer for the same failure without each re-deriving the logic inline.

## Key elements

- **`ConflictError`** (class) — Base for domain errors that map to 409. Modules subclass it (e.g. `access`'s `AccessInvariantError`); the interpreter recognises the family via `instanceof` without naming the concrete subclass.
- **`isInfrastructureError(error)`** (function) — Returns `true` when the failure is an unreachable dependency (Mongo, Redis) or a full bounded queue (`ServiceBusyError`), distinguishing server-side outage from request-side refusal.
- **`databaseErrorInterpreter(error)`** (function) — Core mapping: returns `[status, message]` for CastError → 422, duplicate key → 409, BSONError → 422, ValidationError → 422, `ConflictError` → 409, `PreconditionFailedError` → 412, infra outage → 503, everything else → 500. Non-object rejections fall straight to 500.
- **`rejectServiceUnavailable(response)`** (function) — Sends 503 with a `Retry-After: 5` header and a `SERVICE_UNAVAILABLE` error item via `rejectResponse`.
- **`rejectDatabaseError(response, context, error)`** (function) — Primary entry point for controllers: derives status, logs at the right severity, and sends the response (503 path adds `Retry-After`).
- **`rejectDatabaseEnvelope(context, error)`** (function) — Same derivation and logging, but returns a reject envelope (via `generateReject`) instead of writing to a `Response`; used by services that have no Express response in hand.
- **`logDatabaseFailure(context, status, detail, error)`** (function, private) — Logs `warn` for 4xx, `error` for 5xx, passing `error` as a structured key so the logger can attach a stack trace.
- **`serviceUnavailableError()`** / **`RETRY_AFTER_SECONDS`** — Fixed 503 payload and the single `Retry-After` constant shared by both 503 paths.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse` and `generateReject`; this file calls them for every non-503 and 503 response respectively.
- **`src/infrastructure/persistence/mongo-errors.ts`** — Supplies `isDuplicateKey` and `isConnectionError`, the two Mongo-specific predicates the interpreter checks.
- **`src/infrastructure/persistence/versioning.ts`** — Exports `PreconditionFailedError`; the interpreter recognises it for the 412 branch.
- **`src/infrastructure/runtime/busy.ts`** — Exports `ServiceBusyError`; treated as an infrastructure error (503) by `isInfrastructureError`.
- **`src/infrastructure/adapters/redis.ts`** — Exports `isRedisConnectionError`, checked in `isInfrastructureError`.
- **`src/infrastructure/adapters/logger.ts`** — `logDatabaseFailure` calls `logger.warn` / `logger.error` directly.
- **`src/infrastructure/i18n/index.ts`** — `t()` localises the 503 client-facing message.
- **`src/app/error-handling.ts`** — The global error handler is a consumer of the same status/message pair the interpreter produces (the doc header states the 503 answer is shared "from the global error handler and from a controller's own `.catch`").
- **`src/infrastructure/http/controller.ts`** — Controllers built on this base call `rejectDatabaseError` in their `.catch()` callbacks.
- **`src/modules/access/service.ts`** — Throws `AccessInvariantError` (a `ConflictError` subclass) that the interpreter maps to 409.
- **`src/modules/account/controllers/delete-account-confirm.ts`**, **`post-login-2fa-send.ts`**, **`post-login-2fa.ts`** — Concrete controllers that invoke `rejectDatabaseError` (or `rejectDatabaseEnvelope` in service-layer code) on failure.

## Notes

- **`BSONError` and `ValidationError` are matched by `.name` string, not `instanceof`**, because `bson` is a transitive dependency of two packages and the wrong copy's `instanceof` silently returns `false`. `ConflictError` uses `instanceof` safely because it is defined exactly once in this file.
- **`CastError` is detected via `Object.prototype.hasOwnProperty.call(error, 'kind')`** rather than a `typeof`/`instanceof` check, so it still works on null-prototype objects.
- **The `ErrorCode` import is type-only** (`import type`); the file sits on a module-load path that executes before `@api/error-codes` is available at runtime.
- **`Retry-After` is a flat constant (5 s)** for every 503 — there is no per-outage backoff state, so the value is deliberately not computed.
- **Driver messages are never returned to the client.** The interpreter's `detail` string is a fixed, safe literal; the raw `error.message` (if any) goes only into the log line.
- **`rejectDatabaseEnvelope` omits `Retry-After`** because it returns a data envelope with no `Response` object on which to set the header.
