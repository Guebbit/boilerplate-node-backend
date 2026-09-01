# src/modules/orders/module.ts

## Purpose
Module manifest for the **orders** domain: wires routes, event subscriptions, demo seeding, and locale paths into a single `AppModule` object the kernel registry can load. It also declares the one cross-module subscription the order lifecycle needs (auto-cancelling an order when its inventory reservation times out).

## Key elements
- **Default export (`AppModule`)** – The module's registration object: `name: 'orders'`, `basePath: '/orders'`, `routes`, `subscribe`, `seeds`, `seedExport`, `demoShapes`, `locales`.
- **`subscribe()`** – Calls `onDomainEvent(RESERVATION_EXPIRED, …)` to cancel an order (`cancelById(orderId, { admin: true })`) when inventory releases a timed-out hold. The two release paths (inventory expiry vs. admin cancel) converge safely because `cancelById` → `releaseForOrder` is idempotent.
- **`seeds` / `seedExport`** – Re-exports `seedOrdersCollection` and `exportSeededOrders` from `./demo` for the demo/dev data pipeline.
- **`demoShapes`** – Declares `orders: 'response'` so the demo harness serialises `GET /orders/:id` as a full response document.
- **`locales`** – Points at `./locales` for i18n strings.
- **`import './events'`** – Side-effect import that registers `ORDER_CANCELLED` and `ORDER_STATUS_CHANGED` declarations with the event kernel.

## Relationships
- **`src/kernel/registry.ts`** – Imports the `AppModule` type; this file's default export is the object the registry validates and loads.
- **`src/kernel/events.ts`** – Imports `onDomainEvent` to attach the `RESERVATION_EXPIRED` handler.
- **`src/modules/inventory/index.ts`** – Imports the `RESERVATION_EXPIRED` event constant (the trigger for auto-cancel).
- **`src/modules/orders/routes.ts`** – Imports `router` and exposes it under `basePath: '/orders'`.
- **`src/modules/orders/service.ts`** – Imports `cancelById`, the admin-scope cancel used by the subscription.
- **`src/modules/orders/events.ts`** – Side-effect import; no symbols are consumed.
- **`src/modules/orders/demo.ts`** – Imports the two seed helpers.
- **`src/modules.ts`** – Uploader that aggregates this module's manifest for the kernel.
- **Cart / Delivery / Payments / Products integration tests** – Exercise this module's HTTP and event behaviour end-to-end; they import the app (which loads this module) rather than importing it directly.

## Notes
- The `./events` import is a **bare side-effect import** — removing the line silently drops the event registrations. There is no import to guard.
- The subscription uses `{ admin: true }` deliberately: the *shop* is cancelling (reservation expired), not the customer, so the event fires under the admin code path.
- Per the module doc-block, orders **embed** `productSchema` at purchase time rather than referencing a live catalogue row. Schema changes to products therefore alter stored order history in this collection.
- The import graph is kept acyclic by design: cart → orders → inventory → products. Cart must not be imported back here.
