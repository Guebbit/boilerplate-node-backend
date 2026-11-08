---
source: src/infrastructure/persistence/conditional-status.ts
sha256: 74b4847f412de054530c1c5f45c9e4449e9678753004b0626c95fab0c74eedd5
generated_at: 2026-11-08T03:42:06.007775+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/conditional-status.ts

## Purpose

Provides the single shared atomic "set status to X only if it is still in Y" write used by every module lifecycle transition. It enforces the condition in the MongoDB filter itself (rather than in a prior read) so that concurrent racers are resolved by mongod holding the document lock — preventing silent double-ships, double-refunds, or other lost-update bugs.

## Key elements

- **`ConditionalStatusOptions`** — optional bag the caller passes alongside the status move:
  - `set` — extra fields (e.g. `paidAt`, `committedAt`) written in the same statement.
  - `session` — a Mongoose `ClientSession` that joins the write to the caller's transaction (outbox pattern).
- **`updateStatusIfIn<TDocument>(model, match, from, to, options?)`** — the sole export. Builds a `findOneAndUpdate` whose filter is `{ ...match, status: { $in: from } }` and whose update is `{ $set: { ...set, status: to } }`. Returns the updated `HydratedDocument<TDocument>` or `null` if the document was not in a `from` status (or did not match).

## Relationships

- **Consumers (all module repositories):** `src/modules/delivery/repository.ts`, `src/modules/example/repository.ts`, `src/modules/inventory/repository.ts`, `src/modules/orders/repository.ts`, `src/modules/payments/repository.ts`, `src/modules/returns/repository.ts` — each calls `updateStatusIfIn` to perform its lifecycle status transition without re-implementing the conditional-write pattern.
- **Tests:** `tests/integration/persistence/conditional-status.test.ts` — integration test exercising the function against a real MongoDB instance (race conditions, session propagation, `null` returns).

## Notes

- The `as QueryFilter<TDocument>` cast on the filter object is intentional: `match` is typed `Record<string, unknown>`, which is wider than Mongoose's generic filter type. Per-collection filter typing would add boilerplate with no safety gain.
- `returnDocument: 'after'` means the resolved document reflects the **post-update** state (including any `set` stamps).
- The `session` key is spread conditionally (`...(session ? { session } : {})`) so that passing `null` does not produce `{ session: null }` in the Mongoose options object.
- `set` is spread **before** `status: to` in the `$set` object, so a caller cannot accidentally override the target status by including `status` in their own `set` record.
