---
source: src/modules/returns/events.ts
sha256: 63a8c1083a4bd5512ebe5fd390391abf732f195572bf8199b86df0b655c73ecf
generated_at: 2026-10-15T11:53:35.815434+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/events.ts

## Purpose

Declares the three domain events the returns module emits by augmenting the kernel's app-wide `DomainEventMap` interface, and exports a string constant for each event name so other code can reference them without hard-coding the strings.

## Key elements

- **`declare module '@kernel/events'`** — Augments `DomainEventMap` with three payload types (chosen over a central list; see `modules/orders/events.ts` for rationale):
  - `'return.requested'` — fired when a return is opened (withdrawal or staff-awaiting request). Payload: `returnId`, `orderId`, `reason`.
  - `'return.received'` — fired when goods arrive back on sale. Payload: `returnId`, `orderId`.
  - `'return.closed'` — fired when the refund settles (or there is none to return). Payload: `returnId`, `orderId`, `refundAmount`, `currency`.
- **`RETURN_REQUESTED`**, **`RETURN_RECEIVED`**, **`RETURN_CLOSED`** — Exported string constants matching the event names above, intended for use by emitters and consumers.

## Relationships

- **`src/modules/returns/module.ts`** — Its `publicEvents` projection reads these event definitions and exposes them in the `webhooks` public catalogue.
- **`src/modules/returns/services/*`** (`create.ts`, `receive.ts`, `close.ts`, `outcome.ts`, `cancel-remainder.ts`) — The service layer emits these events during their respective lifecycle transitions.
- **`src/modules/returns/index.ts`** — Barrel re-export; makes the constants available to the rest of the module.
- **Tests** (`tests/integration/outbox.test.ts`, `receive.test.ts`, `service.test.ts`, `tests/unit/public-events.test.ts`) — Assert that the correct events are emitted with the expected payloads.

## Notes

- Module augmentation is the convention here: each module extends the shared `DomainEventMap` locally rather than registering into a central registry.
- `return.closed` timing is context-dependent — it fires immediately at birth for pre-dispatch withdrawals (where the order's own cancel carries the refund) or later when the payment sweep completes a refund.
- The file contains no runtime logic; it is purely type declarations plus three `const` exports.
