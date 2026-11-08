---
source: tests/unit/infrastructure/persistence/factories.test.ts
sha256: c9b29487ca64d2b64479823b06cb77ab93b040e7afa21da3283c031c6709fb6f
generated_at: 2026-11-08T10:21:59.459374+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/factories.test.ts

## Purpose

Unit tests for the three shared helpers (`toObjectId`, `toDate`, `identityOf`) that every module's `factories.ts` builds on. They pin down the silent-failure semantics of each helper so that a regression surfaces here rather than as a phantom "no such record" deeper in a pipeline.

## Key elements

- **`describe('toObjectId')`** — Verifies hex-string → `Types.ObjectId` conversion, that calling with no argument mints a fresh unique id, and that a malformed string *throws* rather than silently substituting a random id.
- **`describe('toDate')`** — Verifies ISO-string parsing, `Date` pass-through, and that `undefined` stays `undefined` (so `stripUndefined` can drop the field instead of persisting an Invalid Date as `null`).
- **`describe('identityOf')`** — Verifies that `_id` is set, `createdAt` is derived from the ObjectId's embedded timestamp when omitted, an explicit `createdAt` takes precedence, `updatedAt` defaults to `createdAt` (not `new Date()`), both timestamps can be supplied independently, and a call with an empty object still yields a complete, insertable identity.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — The sole production dependency. This test file imports `toObjectId`, `toDate`, and `identityOf` from that module and exercises their public contracts. There is no other production or test file in the dependency graph.
- **`mongoose` (Types)** — Imported solely for the `expect(...).toBeInstanceOf(Types.ObjectId)` assertions; no Mongoose connection or model is involved.

## Notes

- The test comments document *why* each behavior matters in the broader system (e.g., a plain string matching zero docs in an aggregation `$match`, a seeded catalogue sorting by id-embedded timestamp, an untouched record not appearing in "recently changed" views). If the semantics of `factories.ts` change, these comments are the primary rationale for the new behavior.
- `identityOf` deliberately sets `updatedAt = createdAt` (not `new Date()`) for seeded records. Any test that asserts `updatedAt` equals the *current* time will be wrong by design.
- `toObjectId` is asymmetric: zero-arg → mint a new id; malformed-string arg → throw. There is no "best-effort parse" path.
