# src/modules/payments/module.ts

## Purpose

Module manifest (entry point) for the **payments** module. It registers the module's HTTP routes, subscribes to two cross-module domain events, and declares the locale directory — all in a single object typed against the kernel's `AppModule` contract. This file is what the kernel's module loader picks up when bootstrapping the app.

## Key elements

- **`export default { … } satisfies AppModule`** — the manifest object with:
  - `name: 'payments'`, `basePath: '/payments'` — identity and URL prefix.
  - `routes` — re-exports the router from `./routes`.
  - `subscribe()` — wires two domain-event handlers (see below).
  - `locales` — absolute path to the module's i18n files.
- **`subscribe()`**
  - Listens for `ORDER_CANCELLED` (from `@modules/orders`): if the event payload carries a `refund` flag, calls `refundForOrder(orderId)`; otherwise does nothing.
  - Listens for `USER_DELETED` (from `@modules/users`): calls `detachUserId(userId)` to unlink the payer without deleting the payment record.

## Relationships

- **`src/kernel/registry.ts`** — imports the `AppModule` type that the manifest must satisfy.
- **`src/kernel/events.ts`** — imports `onDomainEvent`, the kernel's event-bus subscription API used inside `subscribe()`.
- **`src/modules/orders/index.ts`** — source of the `ORDER_CANCELLED` constant; the payments module reacts to this event to auto-refund.
- **`src/modules/users/index.ts`** — source of the `USER_DELETED` constant; the payments module reacts to this event to detach the payer.
- **`src/modules/payments/routes.ts`** — provides the `router` that gets attached to the module's `basePath`.
- **`src/modules/payments/service.ts`** — provides `refundForOrder` and `detachUserId`, the two service functions invoked by the event handlers.
- **`src/modules.ts`** — the top-level module aggregator that imports/registers this manifest during app boot.

## Notes

- The `ORDER_CANCELLED` handler is **conditional**: the refund only fires if the event payload includes a truthy `refund` field. A cancelled order without a refund flag is a no-op here.
- The `USER_DELETED` handler deliberately **detaches** (nulls out the user reference) rather than deleting the payment. This mirrors the order's own survival semantics and ensures financial records persist after account erasure.
- The manifest uses `satisfies AppModule` (not `: AppModule`), preserving the literal type of each field while still enforcing the interface.
