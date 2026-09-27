---
source: tests/unit/infrastructure/persistence/mongo-errors.test.ts
sha256: 4fbff24eac709b478c7f2bfca0ab11bf2d934c6bbfbbd62d627721a892542c6b
generated_at: 2026-09-27T16:09:32.745303+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/mongo-errors.test.ts

## Purpose

Unit tests for the three narrow error-detection guards in `mongo-errors.ts` (`isDuplicateKey`, `isBadObjectId`, `isConnectionError`). Each describe block pins down *how* the guard discriminates (code vs. message, `instanceof` vs. shape, `name` property vs. class) and that non-matching inputs—including `undefined`—return `false` without throwing.

## Key elements

- **`makeDuplicateKeyError()`** – local factory that produces a realistic `Error` with `code: 11000` attached, used to exercise `isDuplicateKey` against the driver's actual signal.
- **`describe('isDuplicateKey', …)`** – verifies the guard reads the numeric `code` property (not the message text) and rejects near-miss codes (e.g. `11001`).
- **`describe('isBadObjectId', …)`** – verifies the guard uses `instanceof mongoose.Error.CastError` *and* checks `kind === 'ObjectId'`; explicitly rejects plain objects that merely look like a CastError.
- **`describe('isConnectionError', …)`** – verifies the guard matches on the `name` string across five driver/Mongoose error classes, plus the buffering-timeout `MongooseError` message; rejects unrelated `MongooseError` instances (e.g. "Aggregate has empty pipeline").

## Relationships

- **`src/infrastructure/persistence/mongo-errors.ts`** – the sole SUT. This file imports and exercises its three exported predicates; no other module is touched.

## Notes

- The test comments encode design rationale that is otherwise invisible in the source: `code` over message (resilient to index renames), `instanceof` over duck-typing (prevents hand-built fixtures from passing), and `name` over `instanceof` (the driver classes are not all importable as a single base). When refactoring `mongo-errors.ts`, keep the guard's discrimination mechanism aligned with these expectations.
- `isConnectionError` also matches a specific `MongooseError` message ("buffering timed out"), so that string is effectively part of the contract—renaming it in the driver would silently break detection.
