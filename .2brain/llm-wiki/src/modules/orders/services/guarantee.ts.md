---
source: src/modules/orders/services/guarantee.ts
sha256: 6ed803f1ab1e5c93d5ee8ad86bf2a9d0c6624d836632a48b76fb2a1e00ec3433
generated_at: 2026-10-29T04:47:13.792400+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/guarantee.ts

## Purpose

Extends an order's legal guarantee by twelve months following a repair, as required by EU Directive 2024/1799. The extension is one-shot per order and runs inside the caller's Mongoose transaction (the receipt/return flow).

## Key elements

- **`extendGuarantee(orderId, session)`** — The sole export. Looks up the order in the given transaction session, then either updates `conformityUntil` to `conformityUntil + 12 months` (via `repairedConformityUntil`) and sets `conformityExtendedAt`, or returns `false` if the order is missing, has no deadline yet, or has already been extended. Returns `Promise<boolean>` indicating whether this call performed the extension.

## Relationships

- **`src/modules/orders/domain/index.ts`** — Imports `repairedConformityUntil`, the pure function that computes the new deadline (original + 12 months).
- **`src/modules/orders/repository.ts`** — Imports `orderRepository`; calls `findInSession` to load the order and `extendConformity` to persist the new deadline + extension timestamp atomically within the session.
- **`src/modules/orders/services/index.ts`** — Barrel for the orders services layer; re-exports `extendGuarantee` so the returns/receipt flow can import from the services index.

## Notes

- Idempotency is enforced by the `conformityExtendedAt` field on the order document, not by the repository. A second call (second repair, duplicate event) simply returns `false` without a write.
- The "no deadline yet" guard (`!order?.conformityUntil`) handles orders that have never received their goods; extending a null deadline is meaningless, so it is skipped.
- All reads and writes share the passed `ClientSession`, so the caller is responsible for committing or rolling back the surrounding transaction. This function never commits on its own.
