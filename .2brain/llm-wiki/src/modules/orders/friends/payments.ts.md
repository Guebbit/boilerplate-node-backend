---
source: src/modules/orders/friends/payments.ts
sha256: 90a64dbcc421671c6413fa2349e0d6ac98240daebc08307e31caede872fba70d
generated_at: 2026-11-14T20:38:21.177317+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/friends/payments.ts

## Purpose

A single re-export that serves as the only write-side entry point `payments` is permitted to use inside the `orders` module. It exists to enforce a narrow, auditable boundary between the two bounded contexts: a settled payment is the sole event allowed to transition an order to `paid`.

## Key elements

- **`markPaid`** — Re-exported from `../services/status`. The only `orders` write operation exposed to the `payments` domain.

## Relationships

- **`src/modules/orders/services/status.ts`** — Source of the re-export; contains the actual `markPaid` implementation.
- **`src/modules/payments/services/settlement.ts`** — Expected consumer: the settlement flow calls through this friend boundary to mark an order paid.
- **Test files** (`src/modules/orders/tests/integration/timeline.test.ts`, `src/modules/orders/tests/contract/api.contract.test.ts`, `src/modules/invoicing/tests/integration/issue-invoice.test.ts`) — Exercise the order-status transition that flows through this re-export.

## Notes

- This file intentionally contains **no logic** — only a re-export. Do not add implementation here; put behavior in `services/status.ts`.
- The "friends" directory is a deliberate DDD boundary (see `docs/theory/strategic-ddd.md` §5). Adding a second export here widens the allowed surface without a corresponding design change, so treat any edit as an architectural decision.
