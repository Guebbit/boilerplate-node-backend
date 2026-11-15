---
source: src/modules/returns/events.ts
sha256: f19e4e09d6391ee97efb0c283367d21a55229bc3fdba7f79f014f4100267806f
generated_at: 2026-11-14T21:34:38.885284+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/events.ts

## Purpose

Declares the domain events emitted by the returns module by augmenting the kernel's `DomainEventMap` interface (module augmentation rather than a central list, following the pattern in `modules/orders/events.ts`). It also exports the string-key constants for each event so other modules can reference them without re-typing the literal.

## Key elements

- **`declare module '@kernel/events'`** — Augments `DomainEventMap` with four return-specific payload types:
  - `return.requested` — A return was opened (withdrawal or staff-request). Carries `returnId`, `orderId`, `orderNumber`, `reason`, `requestedAt`, and optional `statedVia`.
  - `return.decided` — Staff approved or declined a request. Internal event; not exposed on any AsyncAPI channel.
  - `return.received` — Goods arrived and were restocked (one `restock` movement per line, same transaction as the status move).
  - `return.closed` — Return finished; refund settled. Carries `refundAmount`, `currency`, and optional `remedy`.
- **`RETURN_REQUESTED`** — String constant `'return.requested'`.
- **`RETURN_RECEIVED`** — String constant `'return.received'`.
- **`RETURN_CLOSED`** — String constant `'return.closed'`.
- **`RETURN_DECIDED`** — String constant `'return.decided'`.
- **Imports** — `ReturnReason` and `ReturnRemedy` from `@types` (see `src/types/index.ts`).

## Relationships

- **`src/modules/returns/module.ts`** — Its `publicEvents` method projects this file's events into the `webhooks` public catalogue; the internal decision event is deliberately excluded.
- **`src/modules/returns/services/receive.ts`** — Emits the requested and received events defined here.
- **`src/modules/returns/services/decide.ts`** — Emits the decided event defined here.
- **`src/modules/returns/services/outcome.ts`** — Emits the closed event when the refund settles.
- **`src/modules/returns/index.ts`** — Re-exports the event string constants for external consumers.
- **`src/types/index.ts`** — Source of the `ReturnReason` and `ReturnRemedy` types used in the payload definitions.
- **Tests** (`public-events.test.ts`, `service.test.ts`, `outbox.test.ts`, `receive.test.ts`, `close-by-hand.test.ts`) — Assert on the event payloads and emission order defined here.

## Notes

- `return.requested` fires at birth for a withdrawal born closed (reached the order before dispatch); in that case `return.closed` follows immediately in the same flow.
- `return.closed` fires when the refund *settles*, which may be later than the status change (payment-sweep completes it). `refundAmount` is a string, not a number.
- `remedy` is absent on a return born closed; `statedVia` is absent on any reason other than a withdrawal.
- The file is a type-only module at runtime (the constants are the sole runtime exports); the `declare module` block contributes nothing to the bundle.
