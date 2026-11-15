---
source: src/infrastructure/persistence/conditional-status.ts
sha256: b15b2e9067e31242a7bbca57076c2c13f22db58ba0dd11ad826a31c907f2a231
generated_at: 2026-11-14T18:12:53.359162+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/conditional-status.ts

## Purpose

Provides a single atomic primitive — "set status to `to` only if it is still in one of `from`" — so that every module's lifecycle transition is race-safe at the database level. The status condition lives in the MongoDB filter rather than a prior read, guaranteeing that two concurrent writes cannot both succeed. This eliminates a whole class of double-ship / double-refund bugs without each repository re-implementing the pattern.

## Key elements

- **`ConditionalStatusOptions`** (interface) — optional extras the caller passes alongside the status move: `set` (additional fields stamped in the same `$set`, e.g. `paidAt`, `committedAt`) and `session` (a Mongoose `ClientSession` to join the write to the caller's transaction).
- **`updateStatusIfIn`** (generic function, the sole runtime export) — calls `model.findOneAndUpdate` with a filter of `{ ...match, status: { $in: from } }` and an update of `{ $set: { ...set, status: to } }`. Returns the hydrated document after the write, or `null` if the document was not in a permitted `from` state (or did not match). Uses `returnDocument: 'after'` and conditionally spreads `session` into the options.

## Relationships

- **Consumed by every domain repository** (`delivery`, `example`, `inventory`, `orders`, `payments`, `returns`, `tasks` repositories). Each repository calls `updateStatusIfIn` to perform its module's lifecycle transition, passing its Mongoose model, the document's identifying filter, the allowed `from` statuses, the target `to` status, any stamped fields, and the ambient transaction session.
- **Tested by** `tests/integration/persistence/conditional-status.test.ts`, which exercises the concurrency and null-return semantics.

## Notes

- The `match` parameter is spread into the filter alongside the `status: { $in: … }` clause. Callers are responsible for including the correct scope discriminator (`_id`, `orderId`, etc.); the function does not add one.
- `session` is optional and nullable; when `null` or omitted it is simply not passed to Mongoose, so the write runs outside any explicit transaction.
- Because the condition is evaluated by mongod while it holds the document, the "read-then-write" anti-pattern is structurally impossible here — but it still applies to any *other* code that reads status separately before calling this function.
- The file is a pure helper with no imports beyond Mongoose types; it owns no state and performs no business-rule checks (valid transitions are enforced by the caller's `from` array).
