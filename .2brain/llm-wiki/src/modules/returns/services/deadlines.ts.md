---
source: src/modules/returns/services/deadlines.ts
sha256: 09a492b7864c1f1612f3c41ec35f1c5559e6035486e93e0c25cb51bd99eecf07
generated_at: 2026-11-08T08:03:19.713989+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/deadlines.ts

## Purpose
Converts the two raw deadline dates stored on an order (`withdrawUntil`, `conformityUntil`) into the normalised `FrozenDeadlines` shape that the reason-evaluation logic (`reasonsOpenAt`, `isReasonOpen`) expects. The key transformation: the withdrawal deadline is advanced by one "silent day" via `withdrawalClosesAt` so the returned value is the instant a withdrawal actually stops being accepted, not the last calendar day the buyer was told.

## Key elements
- **`frozenDeadlinesOf(order)`** — the sole export. Accepts a narrow `Pick<OrderDocument, 'withdrawUntil' | 'conformityUntil'>` and returns a `FrozenDeadlines`. `withdrawUntil` is mapped through `withdrawalClosesAt` (or stays `undefined`); `conformityUntil` is passed through unchanged.

## Relationships
- **`src/modules/orders/index.ts`** — imports `withdrawalClosesAt` and the `OrderDocument` type.
- **`src/modules/orders/domain/withdrawal.ts`** — likely origin of `withdrawalClosesAt`, re-exported through the orders index.
- **`src/modules/orders/model.ts`** — likely defines `OrderDocument`, the shape this function reads from.
- **`src/modules/returns/domain/index.ts`** — source of the `FrozenDeadlines` return type.
- **`src/modules/returns/domain/reasons.ts`** — consumers of the returned `FrozenDeadlines` (`reasonsOpenAt`, `isReasonOpen`).
- **`src/modules/returns/tests/unit/deadlines.test.ts`** — unit tests for `frozenDeadlinesOf`.

## Notes
- The one-day offset is *not* a configurable constant; it lives inside `withdrawalClosesAt` in the orders module. If that function changes, the effective withdrawal window in returns shifts silently.
- The function is pure and side-effect-free — no date arithmetic is done here, only a delegation to `withdrawalClosesAt`.
- `conformityUntil` is intentionally *not* adjusted; only the withdrawal deadline gets the silent-day extension.
