---
source: tests/unit/infrastructure/http/errors.test.ts
sha256: 0f0fa73da0eb88000bd19cb36203d9ce0971c34ff033ec065cf3056ea8751b33
generated_at: 2026-09-27T16:06:05.070080+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/errors.test.ts

## Purpose

Unit tests for `databaseErrorInterpreter` and `rejectDatabaseError` in `src/infrastructure/http/errors.ts`. The interpreter maps a driver/Mongoose error onto a `[httpCode, message]` tuple; the tests pin each branch's status code and client-safe message, and verify that no branch leaks driver prose, schema internals, or user data into the response body.

## Key elements

- **`databaseErrorInterpreter`** (SUT) — under test across every `describe` block; returns `[status, message]`.
- **`rejectDatabaseError`** (SUT) — tested for correct status pass-through and for not throwing on non-Error rejections.
- **`ConflictError`** — imported from the SUT; tested via a local subclass (`ModuleOwnedConflict`) to confirm `instanceof` matching and empty-message fallback.
- **`makeCastError`** — fixture: `Error` with own `kind: 'ObjectId'` (the discriminator).
- **`makeDuplicateKeyError`** — fixture: `Error` with `code: 11000`.
- **`makeValidationError`** — fixture: `Error` with `name: 'ValidationError'`.
- **`makeBsonError`** — fixture: `Error` with `name: 'BSONError'`.
- **Logger mock** — `jest.mock('@infrastructure/adapters/logger')` isolates the SUT from side-effects.

## Relationships

- **`src/infrastructure/http/errors.ts`** — the module under test; provides `databaseErrorInterpreter`, `rejectDatabaseError`, `ConflictError`, `isInfrastructureError`, `rejectDatabaseEnvelope`.
- **`src/infrastructure/adapters/logger.ts`** — mocked entirely so no log calls leak into test output.
- **`tests/support/express.ts`** — supplies `makeResponseStub()` used to assert on `res.status(...)` / `res.json(...)`.
- **`tests/support/stub.ts`** — supplies `asStub<T>()` to cast fixture objects into typed shapes without altering runtime values.

## Notes

- **Two matching strategies, deliberately opposite:** `BSONError` and `ValidationError` are identified by the `name` property (because `bson`/`mongoose` can appear as duplicate transitive copies, making `instanceof` unreliable). `ConflictError` is identified by `instanceof` (exactly one copy in the tree, and a same-named non-subclass must *not* match).
- **`CastError` is matched on an *own* `kind` property** via `hasOwnProperty`; an object that merely inherits `kind` from a parent prototype falls through to the 500 catch-all.
- **Empty messages use `||`, not `??`:** `new Error('')` must produce the `"Unknown error"` placeholder, not an empty string in the client envelope.
- **Non-Error rejections** (`null`, `undefined`, a bare string, a number) must be handled without throwing inside the interpreter; `rejectDatabaseError` must answer 500 rather than propagating the throw.
- **Status is never parsed from the message text.** A CastError whose message happens to start with a digit (`"404 not castable"`) still yields 422, not 404.
