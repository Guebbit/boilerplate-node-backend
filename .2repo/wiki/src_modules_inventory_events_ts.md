# src/modules/inventory/events.ts

## Purpose

Declares the inventory module's domain event(s) by augmenting the kernel's `DomainEventMap`, so the event catalogue grows per-module without a shared enumeration file. Currently contains a single event, `inventory.reservation_expired`, plus its shared string-constant export.

## Key elements

- **`DomainEventMap['inventory.reservation_expired']`** — Module-augmentation entry on `@kernel/events`. Payload is `{ orderId: string }`. Emitted *after* held stock is released, one per expired hold, by `runReservationSweep`.
- **`RESERVATION_EXPIRED`** — Exported constant holding the literal `'inventory.reservation_expired'`. Re-exported through the barrel so emitters and listeners share one spelling instead of two independent string literals.

## Relationships

- **`src/modules/inventory/service.ts`** — Contains `runReservationSweep`, which emits `inventory.reservation_expired` after freeing held units.
- **`src/modules/inventory/index.ts`** — Barrel file; re-exports `RESERVATION_EXPIRED` so consumers import the name from the package root.
- **`src/modules/inventory/module.ts`** — Registers the inventory module in the kernel; the event declaration here is the contract that registration surfaces to listeners.
- The `orders` module is the intended listener (cancels the order), but it is *not* a direct import target of this file — the event exists precisely to avoid an `inventory → orders` import cycle.

## Notes

- The event is intentionally in the **past tense** (`expired`, not `expiring`): stock is already released by the time a listener runs. Listeners compensate for a completed fact; they do not approve a pending one.
- Stock counter changes and their explanatory row are a single write (see `products/events.ts`) and are **not** modelled as events. Only the hold-timeout case is, because the cancellation action belongs to another module that already imports inventory.
- The file declares exactly one event. If you add a second, follow the same pattern: augment `DomainEventMap`, export a `SCREAMING_SNAKE` constant, re-export through `index.ts`.
