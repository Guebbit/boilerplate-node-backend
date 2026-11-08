---
source: tests/unit/infrastructure/persistence/mongo-errors.test.ts
sha256: 44d71c268637b325cd4d8aac1c8b656dafa80ab404080b28e1f0bb70732a9cef
generated_at: 2026-11-08T10:22:15.170802+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/mongo-errors.test.ts

## Purpose

Unit tests for the two predicate helpers in `mongo-errors.ts` (`isDuplicateKey`, `isConnectionError`). The file locks in the contract that these helpers discriminate on structured fields (`code`, `name`) and a specific Mongoose buffering-timeout message — never on free-form error text or `instanceof` checks.

## Key elements

- **`makeDuplicateKeyError`** (local const) — builds a synthetic `Error` with `code: 11000` to simulate a MongoDB driver duplicate-key failure without importing the real driver class.
- **`describe('isDuplicateKey')`** — verifies the helper returns `true` only for `code === 11000`, returns `false` for message-only matches, near-miss codes (`11001`), generic errors, and `undefined`.
- **`describe('isConnectionError')`** — parameterised (`it.each`) test confirming recognition of five connection-error `name` values; a dedicated case for the real `mongoose.Error` buffering-timeout message; negative cases for unrelated `mongoose.Error` messages, generic errors, and `undefined`.

## Relationships

- **`src/infrastructure/persistence/mongo-errors.ts`** — the module under test; this file imports `isDuplicateKey` and `isConnectionError` from it and asserts on their return values.
- **`mongoose`** — imported solely to construct one real `mongoose.Error` instance for the buffering-timeout positive/negative pair. No other Mongoose classes are used.

## Notes

- Errors are simulated via `Object.assign(new Error(msg), { code | name })`, not by importing `mongodb` driver error classes. This keeps the test free of a live driver dependency and means the tests would break silently if the real driver ever stopped attaching those fields.
- The buffering-timeout test is the only place a real `mongoose.Error` is instantiated; all other cases are plain `Error` objects. If the implementation ever switches from a message check to an `instanceof mongoose.Error` check, only this test would catch it.
- The near-miss code test (`11001`) is deliberate: it guards against an accidental `code >= 11000` or `code.startsWith('110')` implementation.
