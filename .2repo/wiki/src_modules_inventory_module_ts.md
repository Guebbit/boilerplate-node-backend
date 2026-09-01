# src/modules/inventory/module.ts

## Purpose

Module manifest and registration entry point for the inventory domain. It wires together the routes, event handlers, and domain gauges into a single `AppModule` descriptor and registers the module with the kernel. The file also carries the authoritative design note: stock counters are columns on the product document, and inventory is the **only** writer of those counters.

## Key elements

- **Default export** — an object satisfying `AppModule` from `@kernel/registry`. Fields: `name`, `basePath`, `routes`, `locales`. No `seeds` or `seedExport` (a hold is only reachable post-checkout; a reservation is never serialized to a client).
- **`import './events'`** — side-effect import; registers inventory event handlers at module load.
- **`import './metrics'`** — side-effect import; registers the two domain gauges with the metrics registry at module load.
- **`import { router } from './routes'`** — pulls the HTTP router into the manifest so the kernel can mount it under `/inventory`.
- **`AppModule` type import** (`@kernel/registry`) — provides the structural contract enforced by `satisfies AppModule`.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `AppModule` type; this file's export is one entry in the kernel's module registry.
- **`src/modules.ts`** — the top-level aggregator that imports this module's default export to include inventory in the application's module list.
- **`src/modules/inventory/routes.ts`** — provides the `router` object consumed by this manifest.
- **`src/modules/inventory/events.ts`** — imported for its side effects (event handler registration).
- **`src/modules/inventory/metrics.ts`** — imported for its side effects (gauge registration).

## Notes

- The counters are **not** stored in a separate inventory collection; they are columns on the product document. The migration that added them (`20260817120000-inventory-counters.js`) is owned by this domain, but that ownership is not visible in the import graph — the doc comment is the only place it is recorded.
- Exactly-once transitions are enforced via a "conditionally claimed status" pattern; a cancel racing the sweep or a duplicate webhook still resolves to one winner. This is the contract that `cart`, `orders`, and `payments` rely on when they request a transition by name and receive a boolean.
- No seed data exists for this module by design (see `orders/demo.ts` for the rationale).
