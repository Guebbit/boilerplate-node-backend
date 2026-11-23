---
source: src/infrastructure/persistence/conditional-status.ts
source_sha256: ed8f2ab8cbd50e38a1b969d3116ddd17ad5c65711fe98f712a84bb9eef7ac31e
context_sha256: 183bc8d42745668bb66db7768861e702ecb0eb7491888822d7cf2b0cba19f33a
generated_at: 2026-11-22T03:01:41.994648+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/conditional-status.ts

## Purpose
Provides the single shared atomic "move to status X only if currently in one of Y" write used by every module's lifecycle. The status condition is placed in the query filter rather than checked in a prior read, so two racing writers cannot both succeed. This prevents silent double-ships or double-refunds.

## Key elements
- `ConditionalStatusOptions` — optional extras for the write:
  - `set`: extra fields (e.g. `paidAt`, `committedAt`) written in the same statement as the status change.
  - `session`: a Mongoose `ClientSession`, so the write joins the caller's transaction (e.g. alongside an outbox row).
- `updateStatusIfIn(model, match, from, to, options?)` — runs `findOneAndUpdate` with filter `{ ...match, status: { $in: from } }` and update `$set: { ...set, status: to }`. Returns a promise of the updated document (`returnDocument: 'after'`), or `null` if no document matched or its status was not in `from`.

## Relationships
- Used by the module repositories: `src/modules/delivery/repository.ts`, `src/modules/example/repository.ts`, `src/modules/inventory/repository.ts`, `src/modules/orders/repository.ts`, `src/modules/payments/repository.ts`, `src/modules/returns/repository.ts` and `src/modules/tasks/repository.ts`, which share this one implementation instead of writing their own conditional update.
- Covered by `tests/integration/persistence/conditional-status.test.ts`.

## Notes
- A `null` result is ambiguous by design: it means either "not found/not matched" or "status was not in `from`". Callers must interpret it.
- `status` is applied last in the `$set`, so a `status` key inside `set` is overridden by `to`.
- `session` is only passed to Mongoose when truthy; `null` or `undefined` means no transaction.
- `from` is copied into a new array for `$in`, so a readonly array is accepted.
- Never replace this with a read-then-write: that reintroduces the race the file exists to prevent (see the `@see` reference in the file's module doc, on deciding and enforcing staying separate).
