---
source: src/modules/stock-alerts/module.ts
source_sha256: e55e01c78b19bb8720088f829faef340a6b1d280d6ca92ced1ed938c4e948845
context_sha256: b15679e6c617dee151fd20ec32b20f9a41984e4fc9c3ee127dc0f232ba7bae5d
generated_at: 2026-11-22T07:54:49.027882+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/module.ts

## Purpose
Manifest entry for the `stock-alerts` module. It declares the module to the kernel registry: its routes, config slice, jobs, personal-data handling, event subscription, locales and email templates. Per the file's doc comment, a signed-in buyer asks to be told once when a product they can't order becomes available again. The module owns the requests and the one mail, and a five-minute sweep asks `inventory` which waiting products are no longer `out_of_stock`. Nothing announces a restock.

## Key elements
- **default export** – an object `satisfies AppModule` with:
  - `name: 'stock-alerts'`
  - `mounts`: the `router` at `/stock-alerts`
  - `config`: `[stockAlertsConfig.slice]`
  - `jobs`: `stockAlertsJobs`
  - `personalData`: one section, `stockAlerts`
    - `collect` returns `stockAlertService.exportRows(userId)`.
    - `erase` calls `stockAlertService.removeByUserId(userId, session)`. It joins the caller's hard-delete transaction.
  - `subscribe`: registers a `PRODUCT_DELETED` handler through `onDomainEvent`. The handler checks whether the product is still live (via `productService` from the products module). If it is not live, it calls `stockAlertService.removeByProductId(productId)`.
  - `locales` and `templates`: the `locales` and `templates` directories next to the module, resolved with `__dirname`.

## Relationships
- `@kernel/registry`: supplies the `AppModule` type that the manifest must satisfy.
- `@kernel/events`: supplies `onDomainEvent`, used to subscribe to `PRODUCT_DELETED`.
- `@modules/products` (`index.ts`, which re-exports from `module.ts` and `services/`): supplies the `PRODUCT_DELETED` event constant and the `productService` used in the delete handler.
- `./routes`, `./jobs`, `./service`, `./config`: the sibling files that provide the router, jobs, service methods and config slice wired here.
- `src/modules.ts`: the module list that presumably includes this manifest.
- `tests/integration/erasure.test.ts`: likely covers account erasure through the `personalData` hook.
- `notifications` (per the doc comment): writes the inbox row from this module's event.

## Notes
- The delete handler skips products that are live again. A retried `PRODUCT_DELETED` delivery can arrive after a restore, and the buyer's request should still stand for a product on sale.
- `erase` takes the caller's `session`, so the removal is part of the caller's transaction rather than a separate one.
