---
source: src/modules/orders/tests/unit/projections.test.ts
sha256: c12f62dace0bec0b3a983f679dbd42e7a9dae5fc4db896c96764277d56985b13
generated_at: 2026-10-15T11:20:25.667591+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/projections.test.ts

## Purpose

Unit tests for the two order projection functions—`paymentStatusOf` and `returnStatusOf`—verifying their status-derivation logic (default values, override precedence, and pass-through) without exercising any fulfilment-related projections.

## Key elements

- **`describe('paymentStatusOf')`** — covers three cases: no stamp & no `paidAt` → `'unpaid'`; no stamp but `paidAt` present → `'paid'`; a stamped `'partially_refunded'` or `'refunded'` overrides `paidAt`.
- **`describe('returnStatusOf')`** — covers two cases: no stamp → `'none'`; any stamped value is returned as-is.
- **`paidAt`** — a fixed `Date('2026-03-01T00:00:00Z')` constant used as the "order was paid" input.

## Relationships

- **`src/modules/orders/domain/index.ts`** — the import target; this test pulls `paymentStatusOf` and `returnStatusOf` through the domain barrel export rather than reaching into the leaf file directly.
- **`src/modules/orders/domain/projections.ts`** — the module where both functions are actually implemented; the barrel re-exports them. The tests exercise only the logic that lives there.

## Notes

- The file's module doc comment explicitly scopes out fulfilment-status testing, pointing readers to a sibling `fulfillment.test.ts`. Do not add fulfilment assertions here.
- `paymentStatusOf` takes `(stamped: string | undefined, paidAt: Date | undefined)`. The tests confirm the precedence rule: an explicit stamped status always wins over the inferred `'paid'` from `paidAt`.
- `returnStatusOf` is a thin pass-through (stamp → status, or `'none'`). If the implementation changes to include derived logic, the existing tests will not catch regressions beyond the two cases listed.
