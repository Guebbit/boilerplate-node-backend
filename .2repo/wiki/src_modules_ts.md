# src/modules.ts

## Purpose

Central registry that enumerates which domain modules this build serves. It is the single point where a module is added (a new folder under `src/modules/` plus one import/entry) or removed (delete the entry and `rm -rf` the folder). All consumers that need the full module list import `enabledModules` from here rather than hard-coding paths.

## Key elements

- **`enabledModules: AppModule[]`** — The sole export. A flat array of the 13 registered `AppModule` instances (account, audit-logs, cart, delivery, feedback, inventory, locales, observability, orders, payments, products, users, wishlist). Order is alphabetical purely for stable diffs; it has no functional meaning for mounting, import resolution, or `subscribe` timing.
- **`AppModule` (type import from `@kernel/registry`)** — The structural contract each module must satisfy. This file only *types* the array; it does not instantiate or configure modules.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type that `enabledModules` is typed as. Defines the interface every entry in the array must implement.
- **`src/modules/account/module.ts`, `…/audit-logs/module.ts`, `…/cart/module.ts`, `…/delivery/module.ts`, `…/feedback/module.ts`, `…/inventory/module.ts`** — Each is one of the imported values that populate `enabledModules`. They export a default `AppModule` instance consumed here.
- **`scripts/contracts/openapi-bundle.ts`** — Maintains a `MODULE_SECTIONS` list that is cross-checked against this file on every import. Any module that ships its own `openapi.yaml` must have a matching entry there; the script self-validates against the set declared here.
- **`src/app.ts`, `src/app/routes.ts`, `src/app/workers.ts`, `src/app/demo.ts`** — App-layer entry points that iterate over `enabledModules` to mount routes, register workers, or seed demo state.
- **`db/demo/assemble.ts`, `db/demo/index.ts`, `scripts/export-demo-dataset.ts`** — Demo/dataset tooling that reads `enabledModules` to determine which domain tables or fixtures to generate.

## Notes

- The alphabetical ordering is a **convention, not a semantic ordering**. Reordering entries has no runtime effect.
- Adding a module requires touching **two files**: this file (one import + one array entry) *and* `scripts/contracts/openapi-bundle.ts` if the module ships an `openapi.yaml`. Forgetting the second will cause a contract-bundle validation failure on next import.
- Removing a module entry and then running the app is the intended way to surface any hidden coupling—there is no graceful-degradation layer. If something breaks, it is a real dependency that was not previously explicit.
