---
source: src/modules/inventory/module.ts
sha256: 321860b1a8712372acc74751f4930088d8a266361062a96b42ef4fa672d228a0
generated_at: 2026-09-23T18:45:20.892450+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/module.ts

## Purpose

Module manifest entry for the **inventory** module. It declares the module's identity, permission keys, HTTP routes, locale path, and — most importantly — wires up the two domain-event subscriptions (`PRODUCT_CREATED`, `PRODUCT_DELETED`) that keep the stock-level collection and the mirrored copy on the product document in sync. It also triggers side-effect imports of `./events` and `./metrics` so those registries are populated at load time.

## Key elements

- **`default export`** (`satisfies AppModule`) — the manifest object: `name: 'inventory'`, `basePath: '/inventory'`, `routes`, `permissions`, `locales`, `personalData`, and `subscribe`.
- **`subscribe()`** — registers two `onDomainEvent` handlers:
  - `PRODUCT_CREATED` → calls `ensureLevel(productId)` unconditionally (so a zero-stock product still appears on the stock board and low-stock gauge), then conditionally `receive(productId, onHand, 'Opening stock')` when `onHand > 0`.
  - `PRODUCT_DELETED` → calls `removeLevel(productId)` **only** when `hardDelete` is true; soft deletes/restores must leave counters intact.
- **`permissions`** — `['inventory.any.read', 'inventory.any.create', 'inventory.any.sweep']`. The cross-cutting test `tests/cross-cutting/module-permissions.test.ts` enforces bi-directional attribution between this array and the shared permission file.
- **Side-effect imports** — `import './events'` and `import './metrics'` register domain-event schemas and the two stock gauges into their respective registries at module load.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, used inside `subscribe()`.
- **`src/modules/products/index.ts`** — source of the `PRODUCT_CREATED` and `PRODUCT_DELETED` event constants. The dependency is one-directional: `products` cannot import this module (the dependency graph must stay acyclic per `.dependency-cruiser.cjs`), so it emits events instead of calling in.
- **`src/modules/inventory/service.ts`** — supplies `ensureLevel`, `receive`, `removeLevel` used by the event handlers.
- **`src/modules/inventory/routes.ts`** — supplies `router`, attached to the manifest.
- **`src/modules/inventory/events.ts`** — side-effect import; registers this module's domain-event schemas.
- **`src/modules/inventory/metrics.ts`** — side-effect import; registers the two domain gauges.
- **`src/modules.ts`** — the top-level module registry that consumes this manifest.

## Notes

- The `subscribe` handler for `PRODUCT_CREATED` deliberately passes **no audit context** to `receive()`. An `ADMIN_PRODUCT_CREATED` entry already covers this row; a second contextless stock-received entry would be noise.
- `ensureLevel` runs regardless of quantity (even 0) because the stock board and low-stock gauge both read from the `stocklevels` collection, not from the product document's cache.
- `PRODUCT_DELETED` only triggers `removeLevel` on **hard** deletes. A soft delete or restore must preserve counters so a restore can resume from the correct state.
- `personalData` is `'none'` — stock movements and holds are keyed by product and order, never by person.
- There is intentionally **no** entry in `scenarios/index.ts`: a reservation/hold is an application-unreachable seeded state and is never serialized to a client.
