# src/modules/orders/tests/unit/domain-rules.test.ts

## Purpose

Unit tests for the `checkOrderLines` domain rule. The tests are intentionally pure — no mocks, no database, no fake timers — because the rule is a simple function that takes candidate order lines and returns a verdict. The file exists to pin down the exact rejection reasons and the "all-or-nothing" contract of an order.

## Key elements

- **`line(quantity?)`** – local helper that builds an `OrderLineCandidate` with a resolved product (`{ price: 10 }`). Defaults to quantity 1.
- **`describe('checkOrderLines')`** – the sole test block. Asserts:
  - Empty array → `{ ok: false, reason: 'no-lines' }`
  - All lines with resolved products → `{ ok: true }`
  - A line with `product: undefined` **or** `product: null` → `{ ok: false, reason: 'product-missing' }` (parametrised via `it.each`)
  - One bad line among otherwise-valid lines → `{ ok: false }` (the whole set is rejected, not partially filtered)

## Relationships

- **`src/modules/orders/domain/rules.ts`** – sole import source. Pulls in the `checkOrderLines` function and the `OrderLineCandidate` type. The tests assert the exact shape of the return value defined there.

## Notes

- The two rejection reasons (`no-lines`, `product-missing`) map to **different HTTP status codes** downstream, so the tests explicitly verify they stay distinct strings.
- A trailing comment records that `nextDeletionState` and `readScope` used to live in this file but were inlined into `service.ts` (one-liners with a single caller). Their coverage now lives in `service-crud.test.ts` and `service-scope.test.ts` respectively. Don't re-add them here.
- The "snapshot" rule (an order cannot drop a missing product and keep the rest) is a deliberate domain constraint, not an implementation detail — the test on the last line documents that intent.
