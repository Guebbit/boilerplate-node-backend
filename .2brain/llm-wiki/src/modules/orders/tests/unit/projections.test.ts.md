---
source: src/modules/orders/tests/unit/projections.test.ts
sha256: 9d047912a0b15f2101506e19ae1f1fde8464b52ba8e3a7362a854f3d6d7c8d98
generated_at: 2026-11-08T07:13:09.582995+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/projections.test.ts

## Purpose

Unit tests for the `paymentStatusOf` and `returnStatusOf` projection functions, verifying how they resolve an order's payment and return status from owner-stamped values and the `paidAt` timestamp.

## Key elements

- **`describe('paymentStatusOf')`** — three cases:
  - Both args `undefined` → `'unpaid'`.
  - `paidAt` set, no stamp → `'paid'`.
  - Parameterized (`it.each` over `'partially_refunded'`, `'refunded'`): a stamped value takes precedence over `paidAt`.
- **`describe('returnStatusOf')`** — two cases:
  - `undefined` input → `'none'`.
  - Any stamped string is returned as-is.

## Relationships

- Imports `paymentStatusOf` and `returnStatusOf` from `../../domain` (i.e. `src/modules/orders/domain/index.ts`), which re-exports them from `src/modules/orders/domain/projections.ts`.
- The module doc-comment points to `fulfillment.test.ts` for the fulfillment projection's tests, which live in a sibling file and are intentionally excluded here.

## Notes

- Only the *payment* and *return* projections are covered here; the fulfillment projection is tested in its own file.
- The `paidAt` fixture is a hardcoded ISO date (`2026-03-01`), not a relative value, so tests are deterministic.
- The "stamp wins over `paidAt`" rule is the key behavioral contract being pinned down by the parameterized case.
