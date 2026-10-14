---
source: src/modules.ts
sha256: ad56317a699db04dad4f01269a54604ab9650acd7935392a24aa715b6813eb50
generated_at: 2026-10-14T08:25:37.621581+00:00
model: ollama:qwen3.8:27b
---

# src/modules.ts

## Purpose

The single registry that declares which domain modules this build serves. Adding a module is a folder under `src/modules/` plus one line here; removing one is a delete plus a line-removal, and any resulting break is intentional coupling. It is the one list that the app tier, scripts, and scenario tooling all walk to discover what is mounted.

## Key elements

- **`enabledModules: AppModule[]`** — The array of every enabled module instance (access, account, addresses, …, wishlist), in alphabetical order. Order is cosmetic only; mount order, import resolution, and `subscribe` timing do not depend on it.
- **`enabledModuleDirectories(kind)`** — Collects a per-module directory of a given kind (`'locales'` or `'templates'`) from the registry, filtering out modules that don't ship one. Consumers: `bootI18n` for locales, `registerTemplateDirectories` in `mailer.ts` for templates.
- **`ModuleName`** — A hand-listed string-literal union of every module name in the build. Exists so that code can key on a finite set (e.g. `scenarios/index.ts`'s `shopModules`) and get a compile error instead of a runtime failure when referencing a module this build does not mount. Hand-listed because `AppModule.name` is typed `string`; no `typeof` trick recovers the literal.

## Relationships

- **`src/app/routes.ts`**, **`src/app/security.ts`**, **`src/app/config.ts`**, **`src/app.ts`** — The app tier imports `enabledModules` to mount routes, apply security middleware, and wire per-module configuration at boot.
- **`scenarios/check.ts`** — The scenarios package consumes the `ModuleName` union to type its module references, so naming an unmounted module is a compile-time error.
- **`scripts/scaffold/names.ts`** — Scaffolding tooling walks the registry (or `ModuleName`) to generate new module boilerplate.
- **`scripts/setup/required-keys.ts`** — Setup validation iterates enabled modules to collect required environment keys.
- **`scripts/ops/*`** (sweep-order-effects, sweep-outbox, sweep-preorders, sweep-reservations, reap-inactive-accounts, reap-orphaned-images) — Operational scripts reference the registry to determine which modules' data they must process.
- **`scripts/db/index-sync.ts`** — DB index synchronisation walks the module list to reconcile per-module indexes.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — Docs generation iterates modules to emit per-module rate-limit budget tables.

## Notes

- **Bundlers do not read this list.** Contract bundlers run before `enabledModules` is importable (its modules import the generated `@api/` client the bundler produces), so they discover modules from disk via `scripts/contracts/section-order.ts`. Do not assume this file drives build tooling.
- **`ModuleName` is hand-maintained.** Adding a module requires updating both the `enabledModules` array *and* the `ModuleName` union. Forgetting the latter compiles silently but breaks scenario typing.
- **Alphabetical order is a convention, not a requirement.** Reordering the array has no runtime effect, but it keeps diffs minimal and reviewable.
