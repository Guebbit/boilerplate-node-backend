---
source: src/modules/inventory/events.ts
source_sha256: ded0ccb3f8d6b38b3aa4f4c4fa40d8c70e214019d9e598eee93c59176a415fd1
context_sha256: f633221098b63885f20135a633cbcc9610638add4b19e975c414c8e746ab087b
generated_at: 2026-11-22T05:18:49.818893+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/events.ts

## Purpose
Declares the domain event names the inventory module emits, as constants. Each is typed with `satisfies DomainEventName`, so emitters and listeners share one spelling instead of separate string literals. Payloads and listeners are described in `./asyncapi.domain-events.yaml`, not in this file.

## Key elements
- `RESERVATION_EXPIRED` (`'inventory.reservation_expired'`): emitted when a hold times out. `orders` reacts by cancelling the order.
- `PREORDER_ALLOCATED` (`'inventory.backorder_allocated'`): emitted when a backorder is allocated. `delivery` imports this module only for the event name.
- `STOCK_RETAKEN` (`'inventory.stock_retaken'`): the module's own refresh event. It is announced by the payment's own transaction, and its listener lives in `module.ts`.
- `HOLD_ORPHANED` (`'inventory.hold_orphaned'`): declared with a pointer to its channel in the AsyncAPI file.

## Relationships
- `src/kernel/events.ts`: supplies the `DomainEventName` type that every constant must satisfy.
- `src/modules/inventory/index.ts`: the barrel through which these constants are exported to other modules.
- `src/modules/inventory/module.ts`: holds the listener for `STOCK_RETAKEN`.
- `src/modules/inventory/services/allocate.ts`, `src/modules/inventory/services/holds.ts`, `src/modules/inventory/services/sweep.ts`, `src/modules/inventory/tests/integration/preorder.test.ts` and `src/modules/inventory/tests/integration/service.test.ts` are graph neighbors. The file itself doesn't say which constants they use, so check them directly.

## Notes
- Stock changes are deliberately not events (see `src/modules/products/events.ts`). The counter and the row explaining it are written together in one write.
- Of the four events, only `stock_retaken` stays inside the module. The other three reach other modules.
- `RESERVATION_EXPIRED` and `PREORDER_ALLOCATED` are events rather than direct calls to avoid circular imports. `orders` and `delivery` already import inventory, so inventory must not import them back.
- The constant `PREORDER_ALLOCATED` maps to the event name `backorder_allocated`, so the two terms differ.
- The file's header comment points to a "the pipeline" section of the inventory module documentation for further background.
