# src/modules.ts

## Purpose
The single source of truth for which domain modules are active in a given build. It imports one default export per module folder and re-exports them as a flat array, so that the rest of the app (routing, demo data, scripts) can iterate over "the modules this build serves" without knowing which ones exist.

## Key elements
- **`enabledModules: AppModule[]`** — The sole export. An alphabetically-ordered array of 13 module instances (account, audit-logs, cart, delivery, feedback, inventory, locales, observability, orders, payments, products, users, wishlist). Each element is the default export of its respective `src/modules/<name>/module.ts`.
- **`AppModule` (type import)** — Structural contract for a module entry, defined in `src/kernel/registry.ts`.

## Relationships
- **`src/kernel/registry.ts`** — Supplies the `AppModule` type that shapes every entry in `enabledModules`.
- **`src/modules/*/module.ts`** (account, audit-logs, cart, delivery, feedback, inventory, locales, observability, orders, payments, products, users, wishlist) — Each provides the default-exported module instance included in the array.
- **`src/app.ts` / `src/app/routes.ts` / `src/app/demo.ts`** — Consumers that iterate `enabledModules` to boot routers, register routes, or seed demo state.
- **`db/demo/assemble.ts` / `db/demo/index.ts`** — Demo-dataset tooling that walks the enabled set to generate sample records.
- **`scripts/export-demo-dataset.ts`** — Script-level consumer of the module list.
- **`docs/theory/modules.md` / `docs/theory/module-lifecycle.md` / `docs/theory/reading-path.md`** — Prose documentation that references this file as the registration point.

## Notes
- **Order is cosmetic.** The file header states explicitly that array position carries no semantic weight; inter-module dependencies are resolved via each module's `dependsOn` field, not its slot in the array. The alphabetical ordering is a diff-hygiene convention, not a functional requirement.
- **Adding/removing a module is intentionally two steps** (create/delete the folder + add/remove one line here). The file's own comment frames any resulting compile-time breakage as "real coupling worth seeing" rather than a problem to hide behind dynamic registration.
- **No runtime logic lives here.** The file contains no side effects, no conditionals, and no exports beyond the single array—keep it that way.
