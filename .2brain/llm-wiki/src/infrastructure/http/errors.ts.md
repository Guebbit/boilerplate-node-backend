---
source: src/infrastructure/http/errors.ts
sha256: b5052da0b6a9a2b7be26857d3520c737561aae54a1b83721a727d92b3aded3a7
generated_at: 2026-10-29T02:01:23.035333+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/errors.ts

## Purpose

Single-point interpreter that maps any driver or infrastructure failure (Mongo, Mongoose, Redis, BSON) to a deterministic HTTP status and message. It exists so all twelve models produce the same 4xx/503/500 answer for duplicate keys, bad identifiers, and outages, rather than each controller re-deriving the status inline.

## Key elements

- **`ConflictError`** — Base class (extends `Error`) for domain errors that warrant 409. Modules subclass it (e.g. `access`'s `AccessInvariantError`); the interpreter recognises the family via `instanceof`.
- **`isInfrastructureError(error)`** — Boolean guard: `true` when the failure is a Mongo/Redis connection loss or a full `ServiceBusyError` queue, i.e. the *server* is temporarily broken (503 territory).
- **`databaseErrorInterpreter(error)`** — Core decision function. Returns a `[status, message]` tuple. Branch order: CastError (`kind`) → 422, duplicate key → 409, BSONError → 422, ValidationError → 422, `ConflictError` → 409, `PreconditionFailedError` → 412, infrastructure outage → 503, fallback → 500. Non-object rejections always fall to 500.
- **`rejectServiceUnavailable(response)`** — Sends a 503 with the standard `SERVICE_UNAVAILABLE` error item; `rejectResponse` appends `Retry-After`.
- **`rejectDatabaseError(response, context, error)`** — Controller-facing entry point. Derives status via the interpreter, logs, then sends the response. The 503 path routes through `rejectServiceUnavailable`.
- **`rejectDatabaseEnvelope(context, error)`** — Service-facing variant for code that *returns* an envelope rather than sending a `Response`. Returns `generateReject(...)` output; no `Retry-After` (added later at send time).
- **`logDatabaseFailure`** (private) — Logs at `warn` for 4xx, `error` for 5xx, attaching the raw error object under its own key so the logger can serialise a stack trace.

## Relationships

- **`src/infrastructure/persistence/mongo-errors.ts`** — Imports `isDuplicateKey` and `isConnectionError` for the 409 and 503 branches.
- **`src/infrastructure/persistence/versioning.ts`** — Imports `PreconditionFailedError` for the 412 branch.
- **`src/infrastructure/adapters/redis.ts`** — Imports `isRedisConnectionError` for the 503 branch.
- **`src/infrastructure/runtime/busy.ts`** — Imports `ServiceBusyError` (bounded-queue full) for the 503 branch.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` for `logDatabaseFailure`; severity split (warn vs. error) lives here.
- **`src/infrastructure/i18n/index.ts`** — Imports `t` for the i18n'd `SERVICE_UNAVAILABLE` message.
- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse` and `generateReject` for actually writing the HTTP reply / building the envelope.
- **`src/modules/access/services/grants.ts`** (and other module services) — Throw `ConflictError` subclasses that the interpreter catches in its 409 branch.
- **`src/modules/account/controllers/*`** (get-refresh-token, post-account-restore, post-login-2fa-send, post-login-2fa) — Call `rejectDatabaseError` or `rejectDatabaseEnvelope` in their `.catch` handlers.

## Notes

- **BSONError / ValidationError are matched by `name` string, not `instanceof`.** `bson` is a transitive dependency of two packages; `instanceof` against the wrong copy silently returns `false`. `ConflictError` *is* matched by `instanceof` because it is defined once in this file.
- **The `ErrorCode` import is type-only.** The file sits on `contracts:bundle`'s incidental module-load path, which executes before `@api/error-codes` is available at runtime.
- **Driver messages are never returned to the client.** The interpreter's `message` in the `[status, detail]` tuple is a static English string; the original error is logged but not echoed.
- **No bespoke "throw with a status" helper exists here.** If a one-off status-throw is needed, the project convention is `http-errors` (already transitively present via Express).
- **`Object.prototype.hasOwnProperty.call(error, 'kind')`** is used instead of `error.hasOwnProperty` so the CastError check still works on null-prototype objects.
