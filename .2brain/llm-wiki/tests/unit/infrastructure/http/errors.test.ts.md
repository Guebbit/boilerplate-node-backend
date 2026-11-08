---
source: tests/unit/infrastructure/http/errors.test.ts
sha256: 0e86140ced36edb3e995de82a74772405d30b866b50cfddda78422334d755ebf
generated_at: 2026-11-08T10:12:36.819474+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/errors.test.ts

## Purpose

Unit tests for `databaseErrorInterpreter` and its companion helpers in `src/infrastructure/http/errors.ts`. They pin the mapping from driver/Mongoose errors to `[httpCode, message]` tuples, verifying that client-fault errors (malformed ids, duplicates, validation) return actionable 4xx codes with sanitized messages, while genuine server faults still surface as 500.

## Key elements

- **`databaseErrorInterpreter` (SUT)** — the function under test; maps an arbitrary rejection to a status/message pair.
- **`rejectDatabaseEnvelope`** — tested via the `PreconditionFailedError` case; asserts the full response envelope shape (`status`, `errors[].code`).
- **Branch fixtures** — `makeCastError`, `makeDuplicateKeyError`, `makeValidationError`, `makeBsonError` construct minimal objects that satisfy each discrimination strategy without instantiating real driver classes.
- **ConflictError / PreconditionFailedError / ServiceBusyError** — imported from their respective modules to exercise the infrastructure-defined subclass branches.
- **Logger mock** — `jest.mock('@infrastructure/adapters/logger', …)` silences side-effect logging during tests.
- **`asStub`** (from `tests/support/stub`) — types a plain object as a class instance without `instanceof`.
- **`makeResponseStub`** (from `tests/support/express`) — provides a mock Express `res` for `rejectDatabaseError` tests.

## Relationships

- **`src/infrastructure/http/errors.ts`** — the module under test; every assertion targets its exported functions and classes.
- **`src/infrastructure/adapters/logger.ts`** — mocked wholesale so interpreter branches that log side-channels don't pollute test output.
- **`src/infrastructure/persistence/versioning.ts`** — source of `PreconditionFailedError`; exercised directly in the 412 branch.
- **`src/infrastructure/runtime/busy.ts`** — source of `ServiceBusyError`; imported to cover that branch.
- **`tests/support/stub.ts`** — `asStub` used to cast plain objects to `CastError` / `BSONError` types without real instances.
- **`tests/support/express.ts`** — `makeResponseStub` supplies the Express response mock for `rejectDatabaseError` / `rejectDatabaseEnvelope` tests.

## Notes

- **Discrimination strategy is deliberately inconsistent per branch and the tests lock it in:** `CastError` uses `hasOwnProperty('kind')` (rejects inherited `kind`), `BSONError`/`ValidationError` match on the `name` string (safe because the package may exist as two copies in the tree, making `instanceof` unreliable), and `ConflictError` uses `instanceof` (safe because it has exactly one definition in `infrastructure`). The tests assert each strategy and explicitly verify the *opposite* does not match.
- **Security assertions are first-class:** duplicate-key and validation-error branches must not echo user data (emails, field names) into the response message.
- **NaN guard:** a CastError whose message starts with digits must still yield a numeric 422, not a status parsed from the prose (which would make Express throw and escalate to 500).
- **Non-Error rejections** (`null`, `undefined`, bare strings) must be rejected before any `hasOwnProperty` call to avoid a throw inside the interpreter.
- **Empty-message fallback uses `||`, not `??`:** an empty-string message must fall through to `"Unknown error"`, and a test pins this with an `eslint-disable` comment acknowledging the intentional lint violation.
