---
source: src/infrastructure/persistence/conditional-status.ts
sha256: 74b4847f412de054530c1c5f45c9e4449e9678753004b0626c95fab0c74eedd5
generated_at: 2026-10-29T02:12:03.408967+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/conditional-status.ts

## Purpose

Provides a single shared atomic write primitive — "set `status` to Y only while it is still in X" — used by every module lifecycle transition. It exists so the status guard lives in the MongoDB filter (evaluated under the document lock) rather than in a read-then-write sequence, preventing silent double-ships or double-refunds from racing writes.

## Key elements

- **`ConditionalStatusOptions`** — interface for the optional parameters: `set` (extra fields to write in the same `$set` statement, e.g. `paidAt`) and `session` (a Mongoose `ClientSession` to join the caller's transaction).
- **`updateStatusIfIn<TDocument>`** — the sole exported function. Calls `model.findOneAndUpdate` with `{ ...match, status: { $in: from } }` as the filter and `{ $set: { ...set, status: to } }` as the update. Returns the updated `HydratedDocument` (via `returnDocument: 'after'`) or `null` when no document was in a matching `from` status.

## Relationships

- **Consumed by every module repository** (`delivery`, `example`, `inventory`, `orders`, `payments`, `returns`) — each repository's lifecycle write (e.g. mark-as-paid, confirm-shipment) calls `updateStatusIfIn` rather than issuing its own conditional `findOneAndUpdate`. This keeps the status guard in one place.
- **Tested by** `tests/integration/persistence/conditional-status.test.ts` — verifies the atomic guard and the `null`-return path under concurrent/racing conditions.

## Notes

- The `as QueryFilter<TDocument>` cast is intentional: spreading a generic `Record<string, unknown>` into Mongoose's typed filter would otherwise require every caller to annotate its scope per-collection. The comment in the source confirms this is a deliberate widening.
- `session` is spread conditionally (`...(session ? { session } : {})`) so callers that have no transaction can omit it without passing `undefined` to Mongoose.
- The `from` parameter is `readonly string[]`; callers pass a literal tuple (e.g. `['CREATED', 'RESERVED']`) to enumerate every legal predecessor status for the move.
- Design principle (referenced in the header): *deciding* (domain logic choosing the next status) and *enforcing* (this persistence guard) are intentionally separated per `docs/theory/tactical-ddd.md#deciding-and-enforcing-stay-separate`.
