---
source: src/modules/returns/events.ts
sha256: 2306a36bf179261f35554a0a250a314b815351f031ce3bdf791a6b71793f3f00
generated_at: 2026-11-08T07:59:27.226829+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/events.ts

## Purpose

Declares the returns module's domain events by augmenting the kernel's `DomainEventMap` interface, and exports the four event-name string constants that services and tests import to reference those events. The augmentation pattern (per-module `declare module` blocks rather than one central list) mirrors `modules/orders/events.ts`.

## Key elements

- **`declare module '@kernel/events'`** — Extends `DomainEventMap` with four payload types:
  - `return.requested` — a return was opened (withdrawal or staff-pending request); carries `reason`, `requestedAt`, optional `statedVia`.
  - `return.decided` — staff approved or declined; **internal only**, no AsyncAPI channel.
  - `return.received` — goods arrived and were restocked; one `restock` movement per line in the same transaction as the status move.
  - `return.closed` — refund settled (immediately or via payment sweep); carries `refundAmount`, `currency`, optional `remedy` (absent on returns born closed).
- **`RETURN_REQUESTED` / `RETURN_RECEIVED` / `RETURN_CLOSED` / `RETURN_DECIDED`** — Exported string constants for the event names, used at emit/read sites to avoid hard-coding the literals.

## Relationships

- **`src/types/index.ts`** — Source of the `ReturnReason` and `ReturnRemedy` types used in the payload shapes.
- **`src/modules/returns/module.ts`** — Its `publicEvents` selector projects the public subset of these events into the webhooks catalogue.
- **`src/modules/returns/index.ts`** — Barrel re-export of the four `RETURN_*` constants.
- **Services (`decide.ts`, `outcome.ts`, `receive.ts`)** — Import the constants to emit the corresponding events during their operations.
- **Tests** — `public-events.test.ts` asserts the public catalogue shape; integration tests (`receive`, `close-by-hand`, `outbox`, `service`) verify events fire at the expected points.

## Notes

- `return.decided` is intentionally **not** projected to any external AsyncAPI channel; it exists only for internal auditing/mail triggers.
- `refundAmount` is a **string** (decimal), not a number.
- A withdrawal created before dispatch fires both `return.requested` and `return.closed` back-to-back at birth; the `remedy` field is omitted on the `return.closed` event in that case.
- `requestedAt` records when the *buyer* stated the reason, not when the system recorded it — don't conflate with a server timestamp.
