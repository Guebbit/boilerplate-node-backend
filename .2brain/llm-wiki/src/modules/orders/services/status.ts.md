---
source: src/modules/orders/services/status.ts
sha256: 4bbc1bece8ace83fb6d1490099dea20fd59011d77222e705c0b434a73f5b990f
generated_at: 2026-09-23T19:09:17.956806+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/status.ts

## Purpose

The single status-writer for the orders module. Other modules (`payments`, `delivery`) **report** a completed fact to this file; it decides whether that fact still applies to the order's current lifecycle position, applies the transition atomically via the repository, and emits a domain event. It is never called as a "request" — only as a "report" of something another module has already recorded.

## Key elements

- **`markSystemMove`** _(internal)_ — Shared helper. Reads the valid `from` status from the lifecycle table (`statusesLeadingTo(to, 'system')`), calls `orderRepository.updateStatusIfIn(orderId, [from], to)`, and on success emits `ORDER_STATUS_CHANGED`. Returns the updated `OrderDocument` or `null`.
- **`markPaid(orderId)`** — Public. Reports a settled payment. Sole caller is `payments`' `settlePayment`.
- **`markShipped(orderId)`** — Public. Reports a parcel handover. Called by `delivery` only after the parcel record is written.
- **`markDelivered(orderId)`** — Public. Reports parcel arrival. Called by `delivery` only after the arrival record is written.

All three public functions are thin wrappers over `markSystemMove` and share the same return contract: `OrderDocument | null`.

## Relationships

- **`src/kernel/events.ts`** — Imports `emitDomainEvent` to broadcast `ORDER_STATUS_CHANGED` after a successful transition (fire-and-forget via `void`).
- **`src/modules/orders/domain/index.ts`** — Imports `statusesLeadingTo`, which derives the single valid `from` status from the lifecycle table without restating it here.
- **`src/modules/orders/domain/lifecycle.ts`** — The table `statusesLeadingTo` reads; guarantees exactly one `system`-actor edge into `paid`, `shipped`, and `delivered`.
- **`src/modules/orders/events.ts`** — Imports the `ORDER_STATUS_CHANGED` event constant.
- **`src/modules/orders/model.ts`** — Imports the `OrderDocument` type used in return values.
- **`src/modules/orders/repository.ts`** — Calls `orderRepository.updateStatusIfIn` for the conditional (compare-and-swap) status write.
- **`src/modules/orders/services/index.ts`** — Barrel file that re-exports the three public functions to module consumers.
- **`src/types/index.ts`** — Source of the `OrderStatus` enum.
- **`src/modules/orders/tests/integration/service-status.test.ts`** — Integration tests exercising the transition logic.

## Notes

- **`from` is never hardcoded.** It is read at call-time via `statusesLeadingTo(to, 'system')`, so adding or reordering a lifecycle edge only requires touching the table — this file cannot drift out of sync.
- **The `[0]` destructure is sound by invariant, not by runtime check.** It relies on the documented guarantee that exactly one `system` edge leads into each of the three target statuses. There is no fallback if the table ever violated that.
- **`null` means "no-op," not "error."** Callers (e.g., a redelivered webhook) must treat `null` as "the order was already past this stage" and proceed without retry.
- **Event emission is fire-and-forget** (`void emitDomainEvent(...)`). A subscriber failure will not surface as a rejection in the caller's Promise chain.
