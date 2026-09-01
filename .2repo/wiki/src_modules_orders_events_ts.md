# src/modules/orders/events.ts

## Purpose

Declares the `orders` module's domain events by augmenting the kernel's `DomainEventMap` interface, and exports the event-name constants so emitters and listeners share a single source of truth. Because `orders` sits low in the dependency graph (payments and delivery depend on it, not vice-versa), emitting these events is the module's only outward communication channel.

## Key elements

- **`DomainEventMap` augmentation** (`declare module '@kernel/events'`) — adds two entries to the kernel's global event payload map:
  - `'order.cancelled'` → `{ orderId: string; refund: boolean }`. Emitted after the cancel write; `refund` conveys whether the requester is owed money (customer vs. operator).
  - `'order.status_changed'` → `{ orderId: string; from: OrderStatus; to: OrderStatus }`. Emitted on any status transition; listeners filter on `to`.
- **`ORDER_CANCELLED`** (`export const`) — the literal `'order.cancelled'`, exported to avoid duplicating the string across emitters and listeners.
- **`ORDER_STATUS_CHANGED`** (`export const`) — the literal `'order.status_changed'`, same purpose.

## Relationships

- **`src/types/index.ts`** — provides the `OrderStatus` type used in the `order.status_changed` payload.
- **`src/modules/orders/service.ts`** — the expected emitter of both events (announces state changes produced by order operations).
- **`src/modules/orders/index.ts` / `src/modules/orders/module.ts`** — barrel / module-registration files that wire this event declaration into the module's public surface and the kernel's event registry.

## Notes

- Events are added via **interface augmentation**, not by editing the kernel's own map. This keeps the catalogue open to every module without a central edit.
- `order.cancelled` is documented as emitted **after** the write; the `$in` guard upstream guarantees at-most-once delivery, so the event is a notification, not a trigger.
- The `refund` flag is intentionally carried in the payload so listeners don't have to re-derive policy from context.
