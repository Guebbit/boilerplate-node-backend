# src/modules/payments/module.ts

## Purpose

Module manifest for the **payments** domain. Wires the module's HTTP routes, a domain-event subscription (refund on order cancellation), and locale files into the application shell so the kernel can mount and start it. Exists purely as the composition root for the payments feature; it contains no business logic.

## Key elements

- **`export default { … } satisfies AppModule`** — the module descriptor consumed by the kernel registry. Declares:
  - `name: 'payments'` — module identifier.
  - `basePath: '/payments'` — URL prefix for its routes.
  - `routes: router` — the Express/Fastify router from `./routes`.
  - `subscribe()` — registers a listener on the `ORDER_CANCELLED` domain event; when an order carries a `refund` payload, calls `refundForOrder(orderId)` from `./service`.
  - `locales` — path to the module's locale directory.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that constrains the default export shape.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, the subscription helper used inside `subscribe()`.
- **`src/modules/orders/index.ts`** — exports the `ORDER_CANCELLED` event constant the subscription listens for.
- **`src/modules/payments/routes.ts`** — supplies the `router` mounted under `/payments`.
- **`src/modules/payments/service.ts`** — supplies `refundForOrder`, the action invoked when the cancel event fires with a refund.
- **`src/modules.ts`** — aggregates this module (and others) for kernel boot.
- **`src/modules/cart/tests/integration/stock.test.ts`** — integration test that exercises the stock-hold/confirm flow the payments confirm path depends on.
- **`src/modules/payments/tests/integration/service.test.ts`** — integration tests for the refund service called by this subscription.

## Notes

- The `subscribe` callback is called **once** at module start by the kernel; it is not re-registered per request. If `refund` is absent on the event payload, the handler is a no-op (returns `undefined`).
- The file intentionally contains **no** domain logic—only wiring. Payment rules live in `./service` and `./routes`.
- `locales` uses `path.join(__dirname, 'locales')`, so the directory must exist relative to the compiled file location (matters for bundlers or `ts-node` transpile-only modes).
- The module docstring states payments is a **leaf** in the dependency graph ("Reached by: nothing"); removing it breaks payment processing but not compilation of other modules.
