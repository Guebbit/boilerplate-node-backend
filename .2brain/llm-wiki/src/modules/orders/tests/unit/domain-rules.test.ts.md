---
source: src/modules/orders/tests/unit/domain-rules.test.ts
sha256: f1d0cf0611f60abf6435bfa97a513b38fd63e4564643f64c3256ac24eeb2bc15
generated_at: 2026-11-08T07:11:42.041205+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/domain-rules.test.ts

## Purpose

Unit tests for the pure domain-rule functions in `rules.ts`. The file deliberately uses no mocks, no database, and no fake timers—each rule takes plain arguments and returns a verdict, so the tests call them directly and assert the returned shape.

## Key elements

- **`line(quantity)`** — local factory that builds an `OrderLineCandidate` with a resolved product (`price: '10.00'`). Default quantity is 1.
- **`checkOrderLines` tests** — verify the empty-set rejection (`reason: 'no-lines'`), the all-resolved acceptance, and that a single unresolved product (undefined *or* null) rejects the whole set with `reason: 'product-missing'`. Confirms the all-or-nothing semantics of an order snapshot.
- **`isShippedItem` tests** — confirm the default (no `requiresShipping` field) reads as *shipped*, that `requiresShipping: true` → shipped, `false` → digital, and that a null/missing product is treated as shipped (the "safe direction").
- **`isDigitalOnlyOrder` tests** — empty array → false; all-digital → true; any single shipped line → false.
- **`buyerIdOf` / `isBuyer` tests** — `buyerIdOf` calls `.toString()` on the `userId` object and returns `undefined` for null/missing. `isBuyer` compares the order's `userId` to the caller's `id`, rejecting null, undefined, or a missing caller entirely.

## Relationships

- **`src/modules/orders/domain/rules.ts`** — sole import target. This file exercises every exported function and the `OrderLineCandidate` type from that module. No other production code is imported.

## Notes

- The trailing comment block explicitly scopes out soft-delete and read-scope logic, pointing to `service-crud.test.ts` and `service-scope.test.ts` instead. Don't expect those behaviors here.
- The "safe direction" for `isShippedItem` (unresolved product → shipped) is a deliberate fail-safe choice, not an oversight—treat it as a contract, not a bug.
- `buyerIdOf` relies on `toString()` rather than string equality on a primitive; if `userId` ever becomes a plain string, the implementation in `rules.ts` must still call `toString()` or these tests will pass but the intent shifts.
