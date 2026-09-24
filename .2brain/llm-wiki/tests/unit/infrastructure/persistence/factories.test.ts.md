---
source: tests/unit/infrastructure/persistence/factories.test.ts
sha256: 2910b9afb2ad0d36e3435aa6d79996d03cee0cf4fcb2364871b6c12bbb7c8752
generated_at: 2026-09-23T20:25:36.287433+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/factories.test.ts

## Purpose

Unit tests for the four shared factory helpers (`toObjectId`, `stripUndefined`, `toDate`, `identityOf`) that every module's `factories.ts` composes. The tests exist to pin down the *silent-failure* contracts of each helper — the cases where a wrong type or a missing key would not throw but would instead produce a record that matches nothing, skips a schema default, or carries a null timestamp.

## Key elements

- **`describe('toObjectId')`** — Verifies hex→`Types.ObjectId` conversion, that a call with no argument mints a *unique* fresh id, and that a malformed string throws rather than silently substituting a random id.
- **`describe('stripUndefined')`** — Confirms only `undefined` values are dropped; `null`, `0`, `''`, and `false` are preserved. Also asserts the input object is not mutated.
- **`describe('toDate')`** — Checks ISO-string parsing, pass-through of an existing `Date`, and that `undefined` is returned as-is (not turned into an `Invalid Date`).
- **`describe('identityOf')`** — Exercises the full identity-derivation contract: `_id` from a given id or a fresh one, `createdAt` derived from the id's embedded timestamp when absent, `updatedAt` defaulting to `createdAt` (not wall-clock time), and explicit overrides for both timestamps.
- **`HEX` constant** — Single shared 24-char hex string used as the canonical test ObjectId across all suites.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — The sole subject under test. All four exported functions (`toObjectId`, `stripUndefined`, `toDate`, `identityOf`) are imported from the `@infrastructure/persistence/factories` alias and exercised directly. No other module is imported; `mongoose` (`Types.ObjectId`) is used only as a type assertion target in the `toObjectId` and `identityOf` suites.

## Notes

- The test comments repeatedly call out the *consequence* of each edge case (e.g., a plain string in an aggregation `$match` matches zero documents; `new Date(undefined)` becomes an `Invalid Date` that Mongoose persists as `null`). When modifying the helpers, the corresponding comment describes the production bug the test guards against.
- `identityOf` sets `updatedAt` equal to `createdAt` by default — it deliberately does **not** use `new Date()`. Any refactor must preserve this, or "recently changed" views will list the entire seeded dataset.
- `stripUndefined` is tested for non-mutation; the implementation must return a new object rather than deleting keys in place.
