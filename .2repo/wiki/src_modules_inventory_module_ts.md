# src/modules/inventory/module.ts

## Purpose

Module registration file for the **inventory** domain. It declares the module's identity, subdomain classification, route table, and upstream dependencies, and triggers side-effect imports (events, metrics) so they self-register at load time. The inventory module owns the reservation lifecycle (`reserveForOrder` → `commitForOrder` / `releaseForOrder`) over two stock counters that live on the product document.

## Key elements

- **Default export** – an `AppModule` object: `name: 'inventory'`, `subdomain: 'supporting'`, `basePath: '/inventory'`, `routes`, `dependsOn`, `locales`.
- **`routes`** – re-exported from `./routes`; mounted under `/inventory`.
- **`./events` (side-effect import)** – registers domain event handlers at module load.
- **`./metrics` (side-effect import)** – registers two domain gauges with the metrics registry at module load.
- **`dependsOn`** – single declaration: a **conformist** relationship with `products`. Inventory reads catalogue documents and drives their two stock counters through the repository's conditional primitives; it never owns those columns.
- **`locales`** – path to a `locales/` directory beside this file.
- **No `seeds` / `seedExport`** – deliberate: a hold only exists after a checkout, so a seeded hold would be an unreachable state; reservations are never serialized to a client.

## Relationships

- **`src/kernel/registry.ts`** – supplies the `AppModule` type that the default export `satisfies`.
- **`src/modules.ts`** – the aggregate module barrel; imports this default export to include inventory in the application.
- **`src/modules/inventory/routes.ts`** – provides the `router` mounted on this module.
- **`src/modules/inventory/events.ts`** – imported purely for its side effects (event registration).
- **`src/modules/inventory/metrics.ts`** – imported purely for its side effects (gauge registration).
- **`src/modules/cart/tests/integration/stock.test.ts`** – integration test exercising inventory's reservation/commit/release path in the cart flow.
- **`src/modules/cart/tests/integration/service.test.ts`** – integration test covering cart-service interactions that trigger inventory state changes.
- **`src/modules/delivery/tests/integration/service.test.ts`** – integration test where delivery-service events (e.g. cancellation) drive `releaseForOrder`.
- **`src/modules/payments/tests/integration/service.test.ts`** – integration test where payment confirmation drives `commitForOrder`.
- **`src/modules/products/tests/integration/service.test.ts`** – integration test verifying that inventory's conformist reads and conditional counter writes do not corrupt catalogue invariants.

## Notes

- Classified **supporting**, not an aggregate: the doc comment states it is "worth its own rules in `domain/`; not worth an aggregate." Expect simpler invariants than core or generic subdomains.
- **Exactly-once semantics** are enforced by conditionally claiming a hold's status (cancel vs. sweep, duplicate webhooks), not by idempotency keys. The module doc comment spells out the four lifecycle transitions.
- The counters are **owned by inventory, declared by products**. Products never writes them; all mutations go through inventory's transition functions. This is the practical content of the "conformist" dependency.
- Deleting this module "leaves a shop that cannot sell" (per the file's own doc comment) — treat its absence as a hard failure, not a degraded mode.
