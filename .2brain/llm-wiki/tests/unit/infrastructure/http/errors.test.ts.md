---
source: tests/unit/infrastructure/http/errors.test.ts
sha256: 3fe49acaa1c9d5864dabd437a314810881019394b8d2ca9216fc3ad7e1a6de9e
generated_at: 2026-10-15T13:11:01.250806+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/errors.test.ts

## Purpose

Unit tests for `databaseErrorInterpreter` and its companions in `src/infrastructure/http/errors.ts`. The interpreter maps driver/Mongoose error objects to a `[httpCode, message]` tuple that determines whether a failure is reported as a client error (4xx) or a server error (500). The tests pin each branch's status code, message, and discrimination strategy, and guard against regressing real production bugs (malformed IDs on public endpoints returning 500, driver prose leaking into response bodies).

## Key elements

- **`databaseErrorInterpreter` tests** — the core subject. Verifies the tuple output for every recognized error shape and the 500 catch-all.
- **`rejectDatabaseEnvelope` / `rejectDatabaseError` tests** — exercise the response-rejection path, asserting the structured envelope (`status`, `errors[].code`) produced for e.g. `PreconditionFailedError`.
- **`makeCastError` / `makeDuplicateKeyError` / `makeValidationError` / `makeBsonError`** — local fixtures that build plain objects shaped like Mongoose/BSON/Redis driver errors, used as inputs to the interpreter.
- **`ConflictError` branch tests** — verify `instanceof`-based discrimination (single-copy class) and empty-message fallback.
- **`PreconditionFailedError` branch tests** — verify 412 status and the `PRECONDITION_FAILED` error code in the envelope.
- **"rejection that is not Error-shaped" tests** — guard against `null`, `undefined`, and bare-string rejections crashing the `hasOwnProperty` call inside the interpreter.
- **Mocked `logger`** — `@infrastructure/adapters/logger` is fully mocked so no logging side-effects run during tests.

## Relationships

- **`src/infrastructure/http/errors.ts`** — the module under test; all assertions target its exported functions and classes (`databaseErrorInterpreter`, `rejectDatabaseError`, `rejectDatabaseEnvelope`, `isInfrastructureError`, `ConflictError`).
- **`src/infrastructure/persistence/versioning.ts`** — source of `PreconditionFailedError`, exercised as a branch input.
- **`src/infrastructure/runtime/busy.ts`** — source of `ServiceBusyError`, imported (available for future branch tests).
- **`src/infrastructure/adapters/logger.ts`** — mocked via `jest.mock` to isolate logging calls.
- **`tests/support/express.ts`** — provides `makeResponseStub` for testing `rejectDatabaseError`'s response interaction.
- **`tests/support/stub.ts`** — provides `asStub<T>()` to satisfy TypeScript's type system when constructing plain objects that mimic driver error shapes.

## Notes

- **Discrimination strategy is deliberate and asymmetric.** `ConflictError` is matched via `instanceof` (exactly one copy in the tree), while `BSONError` and `ValidationError` are matched via their `name` property string because `bson`/`mongoose` can appear as transitive dependencies of multiple packages, making `instanceof` silently false. Tests assert both the positive match and the negative (same-shape-but-not-subclass → 500).
- **CastError uses `hasOwnProperty('kind')`**, not a plain property read. A test constructs an object that inherits `kind` from its prototype and asserts it is *not* treated as a CastError.
- **`||` vs `??` for empty messages is intentional.** `new Error('')` must fall through to `'Unknown error'`; a test with an eslint-disable comment pins this.
- **No driver prose in responses.** Multiple tests assert the client-facing message does *not* contain the driver's `message`, `kind` name, index names, or encoded-id details.
- **`rejectDatabaseEnvelope` returns a structured object** (`{ status, errors: [{ code }] }`) rather than calling `res.status()` directly; the `PreconditionFailedError` test uses `toMatchObject` to verify the `code` field.
