# src/modules/delivery/module.ts

## Purpose

Module registration file for the **delivery** subdomain. Wires together the delivery router, event subscriptions, and cross-module dependencies into a single `AppModule` descriptor so the kernel can boot the shipping-rate, shipment, and fake-courier surface under `/delivery`.

## Key elements

- **Default export** — an object `satisfies AppModule` with:
  - `name: 'delivery'`
  - `subdomain: 'supporting'` — classified as a supporting subdomain (operational concern, not a bounded aggregate).
  - `basePath: '/delivery'`
  - `routes` — the express/Hono router re-exported from `./routes`.
  - `dependsOn` — declarative dependency list (`orders` as *customer-supplier*, `users` as *conformist*) with human-readable `because` strings.
  - `subscribe()` — registers a domain-event listener: when `ORDER_STATUS_CHANGED` fires with `to === 'shipped'`, calls `shipOrder(orderId)` from `./service`.
  - `locales` — path to a co-located `locales/` directory for i18n strings.
- **`shipOrder`** (imported from `./service`) — the sole action triggered by the event subscription.
- **`ORDER_STATUS_CHANGED`** (imported from `@modules/orders`) — the event constant that drives the subscription.

## Relationships

- **`src/kernel/registry.ts`** — imports the `AppModule` type that shapes the default export.
- **`src/kernel/events.ts`** — imports `onDomainEvent` used inside `subscribe()`.
- **`src/modules/orders/index.ts`** — imports the `ORDER_STATUS_CHANGED` event constant; the delivery module acts as a *customer* of orders (reads an order, moves its status to `shipped`).
- **`src/modules/delivery/routes.ts`** — provides the HTTP router mounted at the module's `basePath`.
- **`src/modules/delivery/service.ts`** — provides `shipOrder`, the only business action invoked from this file.
- **`src/modules/delivery/tests/integration/service.test.ts`** — integration tests exercising the service path wired here.
- **`src/modules/cart/tests/integration/service.test.ts`** / **`stock.test.ts`** — cart integration tests that touch delivery (pricing a shipping method via the pure-function `./domain` import, as noted in the file's JSDoc).
- **`src/modules/payments/tests/integration/service.test.ts`** / **`src/modules/products/tests/integration/service.test.ts`** — adjacent module test suites that may assert cross-module invariants involving delivery state.

## Notes

- The JSDoc at the top of the file explicitly states the dependency direction: **cart → delivery** (cart imports delivery's pure rate functions from `./domain`), same direction as cart → orders. Delivery does **not** import cart.
- The `dependsOn` array lists `users` as a *conformist* dependency (read-only, for recipient language), but `users` is **not** imported in this file — the actual read happens downstream in `./service` or `./routes`.
- `subscribe()` returns `undefined` for every status transition other than `'shipped'`; it does not throw or log on mismatched statuses.
- The `satisfies AppModule` syntax means the object is type-checked against the kernel contract but its literal type (including the extra `subdomain` field) is preserved — no widening.
