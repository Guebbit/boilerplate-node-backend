# src/modules/payments/module.ts

## Purpose

Module registration file for the **payments** module. Declares the module's identity (name, base path, subdomain), its inter-module dependencies in DDD terms, its HTTP routes, and its domain-event subscriptions, then hands the whole thing to the kernel via the `AppModule` contract. It is the single entry point the rest of the system uses to wire payments in.

## Key elements

- **Default export (`AppModule`)** – The module descriptor object, checked with `satisfies AppModule`. Carries `name`, `subdomain` (`'supporting'`), `basePath` (`/payments`), `routes`, `dependsOn`, `subscribe`, and `locales`.
- **`subscribe`** – A zero-arg function (invoked by the kernel at boot, not at import time) that calls `onDomainEvent(ORDER_CANCELLED, …)`. When the payload carries a `refund` field it delegates to `refundForOrder(orderId)`; otherwise it is a no-op.
- **`dependsOn`** – Declarative list of three relationships: **orders** (customer-supplier), **inventory** (customer-supplier), **users** (conformist). Each entry includes a `because` string explaining the coupling.
- **`routes`** – Re-exported from `./routes`; mounted under `/payments`.
- **`refundForOrder`** – Imported from `./service`; the single function this file calls at runtime (via the event handler).
- **`locales`** – Resolved with `path.join(__dirname, 'locales')`; a CJS-style path for i18n files.

## Relationships

- **`src/kernel/registry.ts`** – Supplies the `AppModule` type that the default export satisfies.
- **`src/kernel/events.ts`** – Supplies `onDomainEvent`, used inside `subscribe` to register the `ORDER_CANCELLED` handler.
- **`src/modules/orders/index.ts`** – Exports the `ORDER_CANCELLED` event constant that this module subscribes to; also the "orders" dependency declared in `dependsOn`.
- **`src/modules/payments/routes.ts`** – Provides the Express/router instance assigned to the `routes` field.
- **`src/modules/payments/service.ts`** – Provides `refundForOrder`, the refund logic invoked when an order is cancelled with a refund.
- **`src/modules.ts`** – Aggregates all module default exports (including this one) for the kernel to register at startup.

## Notes

- `subscribe` is a **function**, not a call. The kernel is expected to invoke it during module boot; importing this file alone triggers no side effects.
- The `dependsOn` array is **metadata only** — it documents intent for humans and tooling but does not enforce import order or runtime checks.
- The `refundForOrder` call is guarded by a truthiness check on `refund` in the event payload; a cancelled order *without* a refund field produces no action.
- `locales` uses `__dirname`, meaning this file must be executed in a CommonJS (or CJS-compatible) context; a pure ESM build would need a different resolution strategy.
