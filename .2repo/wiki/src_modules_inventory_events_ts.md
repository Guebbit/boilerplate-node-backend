# src/modules/inventory/events.ts

## Purpose

Declares the single domain event the inventory module emits (`inventory.reservation_expired`) by augmenting the kernel's `DomainEventMap`. It exists to give emitters and listeners a shared, type-safe spelling for the event name and its payload, while avoiding a circular import between `inventory` and `orders`.

## Key elements

- **`declare module '@kernel/events'`** — Augments `DomainEventMap` with the `'inventory.reservation_expired'` entry (payload: `{ orderId: string }`). This is the only event in the module's catalogue.
- **`RESERVATION_EXPIRED`** (const, exported) — The literal string `'inventory.reservation_expired'`, exported through the barrel so emitters and listeners reference one symbol instead of duplicating the string.

## Relationships

- **`src/modules/inventory/index.ts`** — Barrel file; re-exports `RESERVATION_EXPIRED` so external modules (e.g. `orders`) import the name from the module root.
- **`src/modules/inventory/module.ts`** — Registers the module with the kernel; the natural place where the `inventory.reservation_expired` event is wired for emission.
- **`src/modules/inventory/service.ts`** — Contains the hold-timeout logic that releases reserved units and then emits the event (the event is fired *after* the release, in past tense).

## Notes

- Stock quantity changes are intentionally **not** events here; they are a single atomic write (counter + row), so a separate event would be redundant. See `products/events.ts` for the contrast.
- The event name uses past tense (`expired`, not `expiring`) on purpose: the listener (`orders`) reacts by *cancelling* the order, so the reservation is already gone at the moment of delivery.
- The event exists to break an import cycle: `orders` already imports `inventory`, so `orders` listens via the kernel bus rather than importing back.
