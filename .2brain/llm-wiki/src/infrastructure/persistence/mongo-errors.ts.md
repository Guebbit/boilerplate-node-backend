---
source: src/infrastructure/persistence/mongo-errors.ts
sha256: fc649ae0ad37e7faaf685d8b978820a4a5f947b19f22a987fc7775d5e313e920
generated_at: 2026-11-14T18:14:08.098631+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/mongo-errors.ts

## Purpose

Pure predicate functions that classify a caught Mongo/Mongoose rejection by its driver-level code or name. They exist so that repositories and the HTTP error interpreter can make driver-fact decisions (duplicate key, query timeout, server unreachable) without importing Mongo error classes or reaching into the response layer.

## Key elements

- **`isDuplicateKey(error: unknown): boolean`** — Returns `true` when the error carries `code === 11000` (E11000, unique-index violation). Used as a retry signal in upserts and as a "409 already-taken" trigger in the HTTP interpreter.
- **`isQueryTimeout(error: unknown): boolean`** — Returns `true` when `code === 50` (`MaxTimeMSExpired`). Mapped to a 503 `QUERY_TIMEOUT` response by the HTTP layer.
- **`isConnectionError(error: unknown): boolean`** — Returns `true` when the error's `.name` is one of the known server-selection / network / not-connected names, or when it is a bare `MongooseError` whose message contains `"buffering timed out"`. Mapped to a 503 by the HTTP layer.
- **`CONNECTION_ERROR_NAMES`** (module-private) — `Set<string>` of the five driver/Mongoose error names that indicate no server was reachable.
- **`MAX_TIME_MS_EXPIRED`** (module-private) — Constant `50`.
- **`BUFFERING_TIMEOUT_MESSAGE`** (module-private) — The literal string Mongoose ships with its buffering-timeout error.

## Relationships

- **`src/infrastructure/http/errors.ts`** — The HTTP error interpreter calls all three predicates to decide between 409, 503 (`QUERY_TIMEOUT`), and 503 (unavailable) responses. The `isConnectionError` doc comment explicitly points to `databaseErrorInterpreter` in that file.
- **Repository modules** (`src/modules/account/repository.ts`, `src/modules/addresses/repository.ts`, `src/modules/cart/repository.ts`, `src/modules/inventory/repository.ts`, `src/modules/notifications/repository.ts`, `src/modules/payments/repository.ts`) — The module doc describes `isDuplicateKey` as the signal a repository checks to treat a racing upsert as a retry rather than a hard failure.
- **Service modules** (`src/modules/account/services/export.ts`, `src/modules/account/services/oauth.ts`, `src/modules/invoicing/services/numbering.ts`, `src/modules/tasks/services/system.ts`, `src/modules/tasks/services/workflow.ts`) — Listed as graph neighbors; likely call the same predicates to classify failures at the service boundary before delegating to the HTTP interpreter.

## Notes

- **Never `instanceof`.** All three predicates check `.code` or `.name` on a plain object. The `mongodb` package is a transitive dependency of more than one workspace package; an `instanceof` against the wrong copy silently returns `false`.
- **Code over message (for E11000).** The error message names the offending index; checking the code keeps the check stable across index renames.
- **Mongoose buffering timeout has no dedicated class.** It surfaces as a generic `MongooseError`; the only distinguishing signal is the fixed `"buffering timed out"` substring, which is why `isConnectionError` falls through to a message check only in that one case.
- All three functions accept `unknown` and are safe to call on any caught value (including `null`/`undefined` or non-object throws).
