# src/modules/orders/module.ts

## Purpose

Module manifest (entry point) for the **orders** module. Wires together the HTTP router, domain-event subscriptions, demo seeding, and locale path into a single `AppModule` object that the kernel registry consumes. Also installs the module's two reactive event handlers: cancelling an order when its inventory reservation expires, and detaching a user ID from all their orders when that user is deleted.

## Key elements

- **`default` export** — The `AppModule` manifest (`satisfies AppModule`). Declares `name: 'orders'`, `basePath: '/orders'`, and exposes `routes`, `subscribe`, `seeds`, `seedExport`, `demoShapes`, and `locales`.
- **`subscribe`** — Registers two `onDomainEvent` handlers:
  - `RESERVATION_EXPIRED` → calls `cancelById(orderId, { admin: true })` (the shop cancels; `inventory` already released the units, so no double-release).
  - `USER_DELETED` → calls `detachUserId(userId)` (detaches the user reference; the order record is preserved, never hard-deleted).
- **Side-effect import `'./events'`** — Registers this module's own event declarations (`ORDER_CANCELLED`, `ORDER_STATUS_CHANGED`) with the kernel event bus.
- **Re-exports consumed here**: `router` from `./routes`, `cancelById` / `detachUserId` from `./service`, `seedOrdersCollection` / `exportSeededOrders` from `./demo`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Imports the `AppModule` type used in the `satisfies` clause. |
| `src/kernel/events.ts` | Imports `onDomainEvent` to register the two event subscriptions. |
| `src/modules/inventory/index.ts` | Imports the `RESERVATION_EXPIRED` domain event constant. |
| `src/modules/orders/routes.ts` | Imports `router` to expose on the manifest. |
| `src/modules/orders/service.ts` | Imports `cancelById` and `detachUserId` for the event handlers. |
| `src/modules/orders/events.ts` | Side-effect import; populates the event declaration registry. |
| `src/modules/orders/demo.ts` | Imports seeding and export helpers used by `seeds` / `seedExport`. |

> The file does **not** import `cart`, `delivery`, `payments`, or `users`' service code. `users` is reached only via the `USER_DELETED` event constant. `cart` depends on this module (downstream), keeping the import graph acyclic.

## Notes

- **Embed, don't reference:** An order stores a snapshot of the product row (`productSchema`) rather than a live product ID. A catalogue shape change does not retroactively alter existing order documents.
- **Detach, don't delete:** On `USER_DELETED` the handler only nulls the user reference; the order document remains for audit / data-export purposes.
- **`satisfies` over `:`:** The manifest uses `satisfies AppModule` to keep the object's inferred literal types (e.g. the exact `locale` path string) while still being type-checked against the contract.
- **Admin-scope cancel:** The reservation-expiry handler passes `{ admin: true }` because the *shop* is initiating the cancellation, not the customer.
