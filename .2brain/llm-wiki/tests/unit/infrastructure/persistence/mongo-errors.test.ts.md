---
source: tests/unit/infrastructure/persistence/mongo-errors.test.ts
sha256: 44d71c268637b325cd4d8aac1c8b656dafa80ab404080b28e1f0bb70732a9cef
generated_at: 2026-10-15T13:18:21.911267+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/mongo-errors.test.ts

## Purpose

Unit tests for the two predicate helpers in `mongo-errors.ts` (`isDuplicateKey`, `isConnectionError`). They verify that detection relies on structured error fields (numeric `code`, error `name`) rather than fragile message-string matching, and cover both positive and negative edge cases including near-miss codes and unrelated `mongoose.Error` instances.

## Key elements

- **`makeDuplicateKeyError`** (local helper) — builds a plain `Error` with `code: 11000` to simulate a driver duplicate-key error without importing the Mongo driver.
- **`describe('isDuplicateKey', …)`** — asserts the function returns `true` only for `code === 11000`; returns `false` for message-only matches, other codes (`11001`), generic errors, and `undefined`.
- **`describe('isConnectionError', …)`** — asserts the function recognises a fixed list of error `name` values (`MongoServerSelectionError`, `MongooseServerSelectionError`, `MongoNetworkError`, `MongoNotConnectedError`, `MongoNetworkTimeoutError`), the Mongoose buffering-timeout message, while rejecting unrelated `mongoose.Error` messages, generic errors, and `undefined`.

## Relationships

- **`src/infrastructure/persistence/mongo-errors.ts`** — the module under test; this file imports `isDuplicateKey` and `isConnectionError` from it and exercises both.
- **`mongoose`** (package) — imported solely to construct a real `mongoose.Error` instance for the buffering-timeout positive case and an unrelated one for the negative case. No other Mongoose functionality is used.

## Notes

- The tests deliberately avoid `instanceof` and actual driver error classes (e.g. `MongoServerError`). Errors are simulated via `Object.assign(new Error(msg), { code }…)` or `{ name }`, mirroring the production code's duck-typing strategy.
- The buffering-timeout case is the only test that constructs a genuine `mongoose.Error`; this is because that signal is the *message text* (a Mongoose-specific phrasing), not a `name` or `code` field.
- Near-miss code `11001` is explicitly tested to guard against off-by-one or range-based checks.
