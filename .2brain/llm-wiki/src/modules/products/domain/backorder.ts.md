---
source: src/modules/products/domain/backorder.ts
source_sha256: c4090babdd1e38254a5d0d1759c509b0cb51cbcf18e7468039c9c0f9746f35cf
context_sha256: 117a5000b1300ea3997b736e7a631942493148045fcea939fda4c7fd8fd89989
generated_at: 2026-11-22T07:09:00.348142+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/domain/backorder.ts

## Purpose
Pure domain rule that decides whether a released product can keep being sold on backorder while its shelf is empty. The current time is passed in as an argument, so every case can be tested without waiting on a real clock. The result is derived on demand and never stored.

## Key elements
- `BackorderFacts` — interface extending `PreorderFacts`. It adds two optional fields:
  - `allowBackorder`: the switch. Absent reads `false`.
  - `restockDate`: when stock is expected back. A date in the past reads as sold out until staff set a new one or clear it.
- `isBackorder(facts, now)` — returns `true` only when all of these hold:
  - `allowBackorder === true`
  - `active !== false`
  - `purchasable !== false`
  - the product is not a preorder at `now`
  - `restockDate` is absent or still in the future (strictly after `now`)

## Relationships
- `./preorder` — imports `isPreorder` and `PreorderFacts`. A product still in preorder is excluded from backorder, and `BackorderFacts` inherits the preorder fields (including `active` and `purchasable`).
- `src/modules/products/domain/availability.ts` — per the doc comments, the availability rule adds the inventory allowance on top of this result when it computes its own answer.
- `src/modules/products/tests/unit/backorder.test.ts` — the unit tests for this file.
- `src/modules/products/domain/index.ts` and `src/modules/cart/services/preorder.ts` — graph neighbors, but this file's content shows no direct interaction with them.

## Notes
- `isBackorder` judges only the product's terms. It does not check stock or the allowance. Per the comments, the allowance belongs to `inventory` and is enforced by `availableFor`.
- A missed `restockDate` is deliberately treated as sold out, because the shop then has no basis to promise another date.
- Absent flags use their defaults. `allowBackorder` must be explicitly `true`, while `active` and `purchasable` only block when explicitly `false`.
