# src/modules/orders/tests/unit/domain-rules.test.ts

## Purpose
Unit tests for the `checkOrderLines` domain rule. Exercises the function as a pure argument→verdict mapper (no mocks, no database, no fake timers) to lock down its contract: what input shapes are accepted, what rejection reasons are returned, and the atomicity guarantee that a single bad line invalidates the entire set.

## Key elements
- **`line(quantity?)`** — local helper that builds a valid `OrderLineCandidate` (`{ quantity, product: { price: 10 } }`); the `quantity` parameter defaults to 1.
- **`describe('checkOrderLines')`** — the sole test block, covering:
  - Empty array → `{ ok: false, reason: 'no-lines' }`
  - All-resolved lines → `{ ok: true }`
  - `it.each` over `undefined` / `null` product → `{ ok: false, reason: 'product-missing' }` (two reasons must stay distinct because they map to different status codes)
  - Mixed valid + unresolved line → still `{ ok: false }` (atomicity: a snapshot order cannot be partially kept)

## Relationships
- **`src/modules/orders/domain/rules.ts`** — the sole import source; provides `checkOrderLines` (the function under test) and the `OrderLineCandidate` type used to shape test fixtures.

## Notes
- **Moved-out tests.** A trailing comment records that `nextDeletionState` and `readScope` *used* to live in `rules.ts` and were tested here. Both were single-expression helpers with one caller each, so they were inlined back into `service.ts`. Their coverage now lives in `service-crud.test.ts` (toggle) and `service-scope.test.ts` (scope + fail-closed cases). Do not re-add them to this file.
- **Reason strings are part of the public contract.** `'no-lines'` and `'product-missing'` are asserted as exact string values; renaming either in `rules.ts` will break these tests *and* any downstream status-code mapping.
