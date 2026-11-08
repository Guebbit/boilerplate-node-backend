---
source: src/modules/cart/module.ts
sha256: 3297ee2cec142d7ec3d08e964de46107599d46aaac21a584674c232fa2ff2f0e
generated_at: 2026-11-08T05:14:41.855417+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/module.ts

## Purpose

Module manifest that registers the cart module with the kernel: it wires the router, config, rate limits, personal-data hooks, and a single domain-event subscription into one `AppModule` object that `src/modules.ts` collects at startup.

## Key elements

- **Default export (`AppModule`)** — the full manifest: `name`, `mounts`, `config`, `rateLimits`, `personalData`, `subscribe`, `locales`.
- **`mounts`** — mounts the router from `./routes` at `/cart`.
- **`config`** — exposes `cartConfig.slice` (from `./config`).
- **`rateLimits`** — passes through `cartRateLimits` (from `./rate-limits`).
- **`personalData`** — two hooks the users module calls:
  - `collect` — returns only `{ productId, quantity }` per line (never the joined product name/price).
  - `erase` — calls `cartService.deleteByUserId(userId, session)`, joining the caller's existing hard-delete transaction rather than opening its own.
- **`subscribe`** — handles `PRODUCT_DELETED`: checks `productService.isLive(productId)` first, then calls `cartService.productRemoveFromCartsById` only if the product is truly gone.
- **`locales`** — points to a `locales` directory adjacent to this file.

## Relationships

- **`@kernel/registry`** — imports the `AppModule` type; the default export `satisfies AppModule`.
- **`@kernel/events`** — uses `onDomainEvent` to register the `PRODUCT_DELETED` handler.
- **`./routes`** — provides the `router` mounted at `/cart`.
- **`./config`** — provides `cartConfig` for the manifest's config slice.
- **`./rate-limits`** — provides `cartRateLimits`.
- **`./services`** — provides `cartService` used by both `personalData` hooks and the event handler.
- **`@modules/products`** — imports `PRODUCT_DELETED` (event constant) and `productService` (for the `isLive` check). Products reaches back into cart *only* through this domain event, keeping the import graph acyclic.
- **`src/modules.ts`** — aggregates this module's default export into the application's module list.
- **`tests/support/checkout-modules.ts`** — test harness that mounts this module alongside orders, products, etc. for integration scenarios.

## Notes

- **`collect` deliberately omits product name/price.** The doc comment and the shared `CartItem` OpenAPI contract (`additionalProperties: false`) both enforce this; the joined product is catalogue data, not the caller's.
- **`erase` takes a `session` parameter** and passes it to `deleteByUserId`. It participates in the caller's transaction rather than committing independently — important when multiple modules erase in one sweep.
- **`PRODUCT_DELETED` handler guards with `isLive`.** A retried event delivery can arrive *after* a product is restored; without the check, the handler would wrongly tell shoppers the product was removed.
- **Cross-module back-references are event/hook-based, not imports.** Users calls `personalData.erase`; products emits `PRODUCT_DELETED`. Neither is a static import, preserving the acyclic dependency graph noted in the file's doc comment.
