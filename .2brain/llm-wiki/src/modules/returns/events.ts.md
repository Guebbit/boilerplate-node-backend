---
source: src/modules/returns/events.ts
sha256: 931f122f91608151ef2229630d6f2695aa9a0e75fcdd4b9aabb055c501a65480
generated_at: 2026-10-29T05:39:01.511145+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/events.ts

## Purpose

Declares the four domain events the returns module emits by augmenting the kernel's shared `DomainEventMap` (same pattern as `modules/orders/events.ts`). Provides the typed payload shapes for each event and exports string-name constants so callers reference events without hard-coding literals.

## Key elements

- **`DomainEventMap` augmentation (`declare module '@kernel/events'`)** — adds four payload types to the app-wide map:
  - `return.requested` — a return opened (withdrawal or staff-pending request). Carries `returnId`, `orderId`, `reason`, `requestedAt` (buyer's stated time), and optional `statedVia` (withdrawal channel only).
  - `return.decided` — staff approved or declined. Internal; no AsyncAPI channel.
  - `return.received` — goods arrived and restocked (one `restock` movement per line, same transaction as the status move).
  - `return.closed` — refund settled (or none owed). May fire immediately at birth for pre-dispatch withdrawals.
- **`RETURN_REQUESTED` / `RETURN_RECEIVED` / `RETURN_CLOSED` / `RETURN_DECIDED`** — exported `const` strings equal to the event keys, for use in emission and subscription sites.

## Relationships

- **`src/modules/returns/module.ts`** — reads this map via its `publicEvents` projection to expose events in the `webhooks` public catalogue.
- **`src/modules/returns/services/decide.ts`** — emits `return.decided`.
- **`src/modules/returns/services/receive.ts`** — emits `return.received`.
- **`src/modules/returns/services/outcome.ts`** — emits `return.closed` (and, for pre-dispatch withdrawals, `return.requested` at birth).
- **`src/types/index.ts`** — supplies the `ReturnRemedy` type used in the `return.closed` payload.
- **`src/modules/returns/index.ts`** — re-exports the event constants for module consumers.
- **Tests** (`public-events.test.ts`, `receive.test.ts`, `outbox.test.ts`, etc.) — assert on the event names and payload shapes defined here.

## Notes

- `return.decided` is **internal only**; it has no AsyncAPI channel and should not be expected on the public webhook catalogue.
- `requestedAt` records the buyer's stated time, not the shop's recording time.
- `statedVia` is present **only** on withdrawal-stated requests; `remedy` is absent on a return born closed.
- `return.closed` can fire in the same transaction as `return.requested` for a pre-dispatch withdrawal (the order's own cancel carries the refund), so subscribers must tolerate that ordering.
