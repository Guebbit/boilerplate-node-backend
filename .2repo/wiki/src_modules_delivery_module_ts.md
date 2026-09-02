# src/modules/delivery/module.ts

## Purpose

Module manifest that registers the **delivery** feature with the application kernel. It wires up HTTP routes, subscribes to the `ORDER_STATUS_CHANGED` domain event (triggering shipment when an order transitions to `shipped`), and points to the module's locale files. All business logic lives elsewhere (`./service`, `./routes`, `./domain`); this file is purely declarative wiring.

## Key elements

- **`default` export (satisfies `AppModule`)** — the manifest object:
  - `name: 'delivery'` — module identifier.
  - `basePath: '/delivery'` — URL prefix for this module's routes.
  - `routes: router` — re-exported from `./routes`; the HTTP surface for shipping rates and shipments.
  - `subscribe()` — registers a one-shot `onDomainEvent(ORDER_STATUS_CHANGED, …)` handler. When the event payload's `to` is `'shipped'`, it calls `shipOrder(orderId)` from `./service`; any other status transition is a no-op.
  - `locales` — absolute path to a `locales/` directory next to this file, used by i18n to localize recipient-facing email.

## Relationships

- **`src/kernel/registry.ts`** — imports the `AppModule` type that constrains the exported manifest shape.
- **`src/kernel/events.ts`** — imports `onDomainEvent` used inside `subscribe()`.
- **`src/modules/orders/index.ts`** — imports the `ORDER_STATUS_CHANGED` event constant (the trigger for the subscription).
- **`src/modules/delivery/routes.ts`** — supplies the `router` object attached to the manifest.
- **`src/modules/delivery/service.ts`** — supplies `shipOrder`, the action invoked when the event fires.
- **`src/modules/delivery/tests/integration/service.test.ts`** — integration tests exercising the `shipOrder` path this manifest triggers.
- **Cart module tests** (`src/modules/cart/tests/integration/*.test.ts`) — the cart module consumes `./domain` (pure rate functions) at checkout; this manifest is *not* part of that path, but the tests verify end-to-end pricing that delivery's domain exports.

## Notes

- The `subscribe` callback is defined inline and closed over at registration time; there is no teardown/unsubscribe logic in this file.
- The doc-block states the module intentionally keeps rates as **pure functions in `./domain`** so cart can price a shipping method without importing the delivery HTTP layer. The manifest itself does not expose those pure functions directly; they are a sibling concern.
- `locales` uses `__dirname` + `path.join`, so it resolves relative to the build output directory, not the source tree.
