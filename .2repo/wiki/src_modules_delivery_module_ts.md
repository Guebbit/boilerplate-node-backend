# src/modules/delivery/module.ts

## Purpose

Manifest file for the delivery module. Registers the module's HTTP routes, its locale files, and its single domain-event subscription (auto-ship when an order reaches `shipped`) so the kernel can wire it up without the module self-bootstrapping.

## Key elements

- **Default export** — An object satisfying `AppModule` (`@kernel/registry`). Declares `name: 'delivery'`, `basePath: '/delivery'`, the Hono `router` from `./routes`, a `subscribe()` hook, and a `locales` directory path.
- **`subscribe()`** — Subscribes to the `ORDER_STATUS_CHANGED` domain event (from `@modules/orders`). When the `to` field is `'shipped'`, it calls `shipOrder(orderId)` from `./service`; otherwise it returns `undefined` (no-op).
- **`router`** — Imported from `./routes`; the module's HTTP endpoint tree.
- **`shipOrder`** — Imported from `./service`; the business logic triggered by the event.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `AppModule` type that this file's default export satisfies.
- **`src/kernel/events.ts`** — Supplies `onDomainEvent`, the subscription primitive used inside `subscribe()`.
- **`src/modules/orders/index.ts`** — Exports the `ORDER_STATUS_CHANGED` event name constant this module listens for.
- **`src/modules/delivery/routes.ts`** — Source of the `router` object mounted under `/delivery`.
- **`src/modules/delivery/service.ts`** — Source of `shipOrder`, the action executed on the `shipped` transition.
- **`src/modules.ts`** — Aggregates this module's default export into the application's module list.
- **`src/modules/delivery/tests/integration/service.test.ts`** — Integration tests that exercise the `shipOrder` flow wired through this subscription.
- **`src/modules/cart/tests/integration/service.test.ts`** and **`stock.test.ts`** — Cart-side tests that interact with delivery's `./domain` (pricing) as part of checkout.
- **`src/modules/payments/tests/integration/service.test.ts`** and **`src/modules/products/tests/integration/service.test.ts`** — Upstream module tests that transitively touch delivery's event or domain contracts.

## Notes

- The module's *pure* shipping-rate functions live in `./domain`, not here. The cart prices a delivery method at checkout by importing from `./domain` directly, bypassing this module's HTTP surface entirely.
- `locales` is resolved relative to `__dirname` (the compiled output directory), so the `locales/` folder must be copied to the same location in any build step.
- The event handler is intentionally minimal: it only reacts to the `shipped` transition and delegates everything to `shipOrder`. Any multi-step logic belongs in `./service`, not in the subscription callback.
