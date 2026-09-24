---
source: src/infrastructure/http/errors.ts
sha256: 0517619ece36ed7cfda81110c776289194daebb27754104e5683b14d1f4057e3
generated_at: 2026-09-23T17:42:31.518920+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/errors.ts

## Purpose

The single mapping point from raw Mongo/Mongoose driver failures to an HTTP status code. It exists so that all twelve models (and any service) resolve a duplicate key, a bad ObjectId, a schema validation failure, or an access-invariant breach to the *same* status and message, rather than each controller re-deriving the logic inline.

## Key elements

- **`databaseErrorInterpreter(error: unknown): [number, string]`** — Pure classifier. Inspects the error object's shape (property `kind`, `name`, `message`) and returns the appropriate `[httpCode, message]` tuple. Handles: CastError → 422, duplicate-key → 409, BSONError → 422, ValidationError → 422, AccessInvariantError → 409, anything else object-shaped → 500, non-object → 500.
- **`rejectDatabaseError(response, context, error)`** — Controller-level `.catch` entry point. Calls the interpreter, logs the driver message (with request/trace id) via `logger.error`, then delegates to `rejectResponse`. The driver's internal message is **never** sent to the client.
- **`rejectDatabaseEnvelope(context, error)`** — Service-level equivalent for code that has no `Express Response`. Returns a `generateReject(status)` envelope instead of writing one, so services don't re-derive the status inline.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse` (sends a pre-shaped HTTP error) and `generateReject` (returns an error envelope object). Both are called by the two reject helpers in this file.
- **`src/infrastructure/persistence/mongo-errors.ts`** — Provides `isDuplicateKey`, the predicate this file uses to detect unique-index violations.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger`; both reject helpers call `logger.error` with the operation context, derived detail, status, and the raw error (which the logger's serializer expands into a stack trace).
- **`src/infrastructure/http/controller.ts`** / account module controllers — Consumers. Their `.catch()` handlers call `rejectDatabaseError` (when they hold a `Response`) or `rejectDatabaseEnvelope` (services that return an envelope). This file is the shared "what status does this failure deserve" answer for all of them.
- **`src/app/error-handling.ts`** — Sits in the same error-handling path; this file handles the *database* branch specifically, while the broader middleware handles transport-level and non-DB failures.

## Notes

- **No `instanceof` anywhere.** BSONError and ValidationError are matched by `name` string because `bson`/`mongoose` can exist as duplicate transitive dependencies; `instanceof` against the wrong copy silently returns `false`.
- **`Object.prototype.hasOwnProperty.call`** is used for the CastError `kind` check so it still works on null-prototype objects (e.g. `Object.create(null)` fixtures).
- **`AccessInvariantError` is matched by name string, not imported.** The layering rule prevents `infrastructure` from reaching up into a module; the status decision (409, request-shape conflict) belongs here, but the class cannot be a dependency.
- **Deliberately absent:** a "throw an error carrying an HTTP status" helper. The module doc states that if a genuine need arises, the answer is the existing `http-errors` package, not a bespoke class.
- **`context` parameter** is developer-facing only (e.g. `'postLogin2fa'`); it appears in the log line for traceability but is never serialized into the client response.
