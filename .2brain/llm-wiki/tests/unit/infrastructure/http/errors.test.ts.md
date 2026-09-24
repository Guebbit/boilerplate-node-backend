---
source: tests/unit/infrastructure/http/errors.test.ts
sha256: c8f256c12806b48bbd8f7f9dcef854e9bebd3919875d9e43435664c9eed73618
generated_at: 2026-09-23T20:20:16.937405+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/errors.test.ts

## Purpose

Unit tests for the HTTP error-interpretation layer (`databaseErrorInterpreter` and `rejectDatabaseError`). The suite pins the mapping from driver/Mongoose error shapes to `[httpCode, message]` tuples and verifies that `rejectDatabaseError` sends the correct status, a safe response body, and a developer-facing log line. Each branch is motivated by a real incident where a client error was reported as a 500 or the response body leaked driver prose and user data.

## Key elements

- **`makeCastError()`** – builds a `CastError`-shaped object with an _own_ `kind: 'ObjectId'` property (the discriminator the interpreter checks via `hasOwnProperty`).
- **`makeDuplicateKeyError()`** – an `Error` carrying `code: 11000` and a realistic E11000 message.
- **`makeValidationError()`** – a `Error` with `name: 'ValidationError'` and a representative Mongoose message.
- **`makeBsonError()`** – a `Error` with `name: 'BSONError'` and a BSON-parsing message.
- **`describe('databaseErrorInterpreter')`** – asserts the tuple for each branch (500 catch-all, CastError → 422, duplicate-key → 409, BSONError → 422, ValidationError → 422) and guards against leaking internal details into the message.
- **`describe('rejectDatabaseError')`** – verifies the Express response stub receives the interpreter-chosen status, a generic body message, and that the logger receives the full detail.
- **`describe('a rejection that is not Error-shaped at all')`** – parameterised tests confirming `null`, `undefined`, bare strings, and numbers fall through to `[500, 'Unknown error']` without throwing.
- **Logger mock** – `jest.mock('@infrastructure/adapters/logger')` provides a `jest.Mocked` logger whose `.error` call is asserted in the `rejectDatabaseError` tests.

## Relationships

- **`src/infrastructure/http/errors.ts`** – the module under test; imports `databaseErrorInterpreter`, `rejectDatabaseEnvelope`, and `rejectDatabaseError`.
- **`src/infrastructure/adapters/logger.ts`** – mocked at module level; the test asserts that `rejectDatabaseError` delegates the full detail to `logger.error` rather than including it in the response body.
- **`tests/support/express.ts`** – provides `makeResponseStub`, the fake Express response object used to capture `.status()`, `.json()`, and `.send()` calls.
- **`tests/support/stub.ts`** – provides `asStub<T>`, a type-assertion helper used to build correctly-shaped fake error objects without real Mongoose/BSON instances.

## Notes

- **Own-property check for `kind`:** The interpreter discriminates CastError via `Object.prototype.hasOwnProperty.call(err, 'kind')`. The test explicitly verifies that an object _inheriting_ `kind` is **not** treated as a CastError.
- **`name`-based matching, never `instanceof`:** BSONError and ValidationError branches match on the string `name` property. The test documents _why_: `bson` and `mongoose` can appear as transitive dependencies of two different packages, so an `instanceof` check against the wrong copy silently returns `false`, killing the branch.
- **Empty message uses `||`, not `??`:** A `new Error('')` must produce `'Unknown error'`, not an empty string in the response. The test marks the empty string as intentional input with an eslint-disable comment.
- **Non-object rejections:** `.catch()` receives `unknown`. The test confirms that `null`, `undefined`, primitives, etc. are handled before any property access that would throw (e.g. `hasOwnProperty.call(null, …)`).
- **Response body safety:** For every 4xx branch the test asserts the message does **not** contain driver prose, schema type names, index names, or user-supplied values. The full detail is expected only in the `logger.error` call.
