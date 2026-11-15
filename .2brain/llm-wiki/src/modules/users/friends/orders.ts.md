---
source: src/modules/users/friends/orders.ts
sha256: 6cdb2b7795e273644b83a89158e46d18aeb3bb7293713e54b95860a624e9b243
generated_at: 2026-11-14T22:22:15.081257+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/friends/orders.ts

## Purpose

A single re-export that exposes `takeAutomaticPurchaseHold` (defined in `src/modules/users/services/purchase-hold.ts`) as the **only** `users` write operation the `orders` module is permitted to invoke. It exists to enforce a strategic-DDD boundary: because `orders` owns the cancellation count that justifies a purchase hold, it must be the sole caller that triggers one, and this "friend" file is the gate through which that access is granted. See `docs/theory/strategic-ddd.md` §5.

## Key elements

- **`takeAutomaticPurchaseHold`** (re-export) — the one function `orders` may call to place an automatic purchase hold on a user. No other function from the `users` domain is surfaced here.

## Relationships

- **`src/modules/users/services/purchase-hold.ts`** — the actual implementation of `takeAutomaticPurchaseHold`. This file is a thin re-export of that function.
- **`src/modules/orders/services/purchase-hold.ts`** — the `orders`-side counterpart that owns the cancellation-count logic and consumes `takeAutomaticPurchaseHold` through this friend file.
- **`src/modules/users/tests/integration/purchase-hold.test.ts`** — integration tests exercising the hold flow, including the path through this re-export.
- **`src/modules/cart/tests/integration/service.test.ts`** — cart integration tests that touch the purchase-hold boundary (indirectly, via the same service path).

## Notes

- This file contains **no logic** — it is purely an access-control seam. Do not add new re-exports without revisiting the strategic-DDD rule that `orders` is the *only* permitted caller of this write.
- The `friends/` directory name is intentional: it signals "this is the only door `orders` may walk through" rather than a generic shared-utility barrel.
- Import path for `orders`: `import { takeAutomaticPurchaseHold } from '…/users/friends/orders'`, **not** `…/users/services/purchase-hold`.
