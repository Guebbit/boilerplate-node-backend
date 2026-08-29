# src/modules/orders/events.ts

## Purpose

Declares the domain events emitted by the orders module by augmenting the kernel's `DomainEventMap` interface, and exports typed event-name constants. This keeps the event catalogue distributed (each module augments the map itself) and gives emitters and listeners a single shared spelling for each event name.

## Key elements

- **`DomainEventMap` augmentation** (`declare module '@kernel/events'`) — adds two event payloads to the kernel's event registry:
  - `'order.cancelled'` — `{ orderId: string; refund: boolean }`. Emitted after the cancellation write succeeds. The `refund` flag carries *policy* (whether money is owed back) rather than letting listeners decide.
  - `'order.status_changed'` — `{ orderId: string; from: OrderStatus; to: OrderStatus }`. Emitted on any status transition regardless of the actor (admin, payment landing, courier job). Listeners are expected to filter on `to`.
- **`ORDER_CANCELLED`** (`export const`) — string constant `'order.cancelled'`.
- **`ORDER_STATUS_CHANGED`** (`export const`) — string constant `'order.status_changed'`.

## Relationships

- **`src/types/index.ts`** — provides the `OrderStatus` type used in the `order.status_changed` payload.
- **`src/modules/orders/index.ts`** — barrel file that re-exports `ORDER_CANCELLED` and `ORDER_STATUS_CHANGED` so consumers can import the constants without reaching into the events file directly.
- **`src/modules/orders/service.ts`** — the emitter: performs the order write (cancel, status move) and then fires these events. The events are emitted *after* the write, meaning listeners always see a committed fact.
- **`src/modules/orders/module.ts`** — module registration point that wires the orders service and its event listeners into the kernel's event bus.

## Notes

- The `refund` boolean on `order.cancelled` is a deliberate policy carrier, not a signal to "do the refund." Suppressing the event when no refund is due would misrepresent the fact that a cancellation happened; instead the flag tells the listener *whether* to act.
- `order.status_changed` is intentionally actor-agnostic. Listeners must filter on the `to` value; the event does not carry a "source" field.
- Module augmentation (not a direct edit of `@kernel/events`) is the convention: no shared file enumerates all domains, so the catalogue grows per-module without cross-cutting edits.
