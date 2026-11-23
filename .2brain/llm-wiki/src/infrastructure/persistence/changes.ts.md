---
source: src/infrastructure/persistence/changes.ts
source_sha256: 14e66f31b84e317cdb2e5a5c2a752924feebb757fc1ca997f78f5a3b3692ef6a
context_sha256: fc5e6528f2ccf7b0c7fd39494d8db9f4bd1d955f45e7349191e891a82ffe6898
generated_at: 2026-11-22T03:01:16.668478+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/changes.ts

## Purpose
Helpers for applying an update's change-set to Mongoose. It defines how `null` ("clear this field") and `undefined` (an unset path) map onto what is stored. It covers both hydrated-document assignment and direct Mongo update documents. Both rely on the same convention: a cleared optional field is removed with `$unset`, not stored as `null`.

## Key elements
- `clearedOrValue(value)`: returns `value`, or `undefined` if it is `null`. Assigning `undefined` to a hydrated document path makes `.save()` emit `$unset` for it.
- `SetAndUnset`: interface with optional `$set` (`Record<string, unknown>`) and `$unset` (`Record<string, 1>`).
- `setAndUnset(changes)`: splits a path → value map into `$set` (defined values) and `$unset` (`undefined` values, each mapped to `1`). An empty half is omitted, because Mongo rejects an empty `$set` or `$unset`. The result is meant to be spread into an update document.

## Relationships
The graph lists these neighbors but the file itself imports nothing. They are presumably its consumers, though this file's content does not show how they use it:
- Repositories: `src/modules/addresses/repository.ts`, `src/modules/locales/repository.ts`, `src/modules/orders/repository.ts`, `src/modules/payments/repository.ts`, `src/modules/webhooks/repository.ts`.
- Services: `src/modules/products/services/crud.ts`, `src/modules/users/services/update.ts`, `src/modules/webhooks/services/subscriptions.ts`.
- Related persistence helper: `src/infrastructure/persistence/translatable-columns.ts`.
- Tests: `tests/unit/infrastructure/persistence/changes.test.ts`.

## Notes
- `null` and `undefined` mean different things at different layers. `clearedOrValue` converts `null` to `undefined` for document assignment. `setAndUnset` treats only `undefined` as a clear, so a `null` value would be `$set` as `null`.
- The module doc references a "put replaces, patch merges" section of the request-flow documentation.
