# src/modules/orders/module.ts

## Purpose

Module manifest for the **orders** domain. Wires together the router, domain-event subscription, declared dependencies, seed data, and locale path into a single `AppModule` object that the kernel registry consumes at startup. It is the one place where the orders module's cross-cutting wiring (events, dependency metadata, DDD classification) lives.

## Key elements

- **`export default` (`AppModule`)** — The module descriptor: `name: 'orders'`, `subdomain: 'core'`, `basePath: '/orders'`, `routes`, `dependsOn`, `subscribe`, `seeds`, `seedExport`, `demoShapes`, `locales`. Conforms structurally via `satisfies AppModule`.
- **`dependsOn`** — Declares two upstream dependencies:
  - `inventory` (role: *customer-supplier*) — orders ask inventory to hold/release units by name.
  - `products` (role: *conformist*) — order items embed `productSchema` by value, so catalogue shape is mirrored.
- **`subscribe`** — Registers a `RESERVATION_EXPIRED` handler (from `inventory`) that calls `cancelById(orderId, { admin: true })`, auto-cancelling the order when a stock hold times out.
- **`import './events'`** — Side-effect import; loads and registers the `ORDER_CANCELLED` and `ORDER_STATUS_CHANGED` domain-event declarations.
- **`router`** — Re-exported from `./routes`; mounted under `/orders`.
- **`seedOrdersCollection` / `exportSeededOrders`** — Seed-data helpers re-exported from `./demo`.
- **`cancelById`** — Imported from `./service`; the only service function used directly in this file (by the event subscription).

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type; this file's default export must satisfy it.
- **`src/kernel/events.ts`** — Provides `onDomainEvent`, used inside `subscribe`.
- **`src/modules/inventory/index.ts`** — Exports `RESERVATION_EXPIRED`, the event this module listens to. This is the single back-edge from inventory into orders, kept acyclic via the event mechanism.
- **`src/modules/orders/events.ts`** — Side-effect imported to register this module's own domain events.
- **`src/modules/orders/routes.ts`** — Source of the `router` mounted at `basePath`.
- **`src/modules/orders/service.ts`** — Source of `cancelById`, invoked on reservation expiry.
- **`src/modules/orders/demo.ts`** — Source of `seedOrdersCollection` and `exportSeededOrders`.
- **`src/modules.ts`** — Presumed aggregator that collects this module alongside siblings.
- **Downstream test suites** (`cart`, `delivery`, `payments`, `products` integration tests; `observability` unit test) — Exercise behavior that depends on orders' status invariants; they do not import this file directly but interact with orders through the event/dependency graph.

## Notes

- The `subscribe` handler uses **admin scope** (`{ admin: true }`): the shop is cancelling, not the customer, so the write bypasses per-account filtering.
- **No double-release:** when `RESERVATION_EXPIRED` fires, inventory has already released the hold. `cancelById` calls back into `releaseForOrder`, which finds the hold already gone — the two paths converge safely.
- **Load-order dependency:** `import './events'` is a bare side-effect import. If reordered or tree-shaken away, the `ORDER_CANCELLED` / `ORDER_STATUS_CHANGED` declarations will not be registered.
- The doc comment references `TACTICAL_DDD_PLAN.md` §5: if any module in this codebase grows an aggregate, this module (orders) is the designated candidate.
