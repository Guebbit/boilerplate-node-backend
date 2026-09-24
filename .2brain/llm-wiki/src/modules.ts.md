---
source: src/modules.ts
sha256: c0f0eae13f59d240358291bf647b4e976b3811130b7415c92edd29cc4f0a2c18
generated_at: 2026-09-23T17:56:46.560263+00:00
model: ollama:qwen3.8:27b
---

# src/modules.ts

## Purpose
Central registry that declares which domain modules this build serves. It is the single list consumed by the app tier, documentation generators, and operational scripts. Adding a module means creating a folder under `src/modules/` and appending one import + one array entry here; removing one is deleting the line and the folder.

## Key elements
- **`enabledModules: AppModule[]`** — Ordered (alphabetical) array of all 18 mounted module objects. The app tier, doc generators, and scripts walk this list to discover available domains.
- **`ModuleName`** (type) — Union of the 18 string-literal module names. Hand-listed rather than derived from `enabledModules` because `AppModule.name` is typed `string` and TypeScript widens literal properties; a `typeof` trick cannot recover the literal. Consumed by `scenarios/index.ts` (`shopModules`) to make an invalid module name a compile-time error.
- **18 imports** — One per module (`access`, `account`, `addresses`, `antibot`, `apiKeys`, `auditLogs`, `cart`, `delivery`, `feedback`, `inventory`, `locales`, `observability`, `orders`, `payments`, `products`, `users`, `webhooks`, `wishlist`).

## Relationships
- **`src/kernel/registry.ts`** — Provides the `AppModule` type that `enabledModules` is annotated with; defines the contract each module must satisfy.
- **`src/modules/access/module.ts`, `src/modules/account/module.ts`, `src/modules/addresses/module.ts`** (and all other module files) — Imported here; this file is their single registration point.
- **`src/app.ts` / `src/app/routes.ts` / `src/app/workers.ts`** — Consume `enabledModules` to mount routes, start workers, and wire subscriptions.
- **`scenarios/check.ts`** — Uses `ModuleName` (via `shopModules`) to type-check scenario targets at compile time.
- **`scripts/ops/reap-inactive-accounts.ts`, `scripts/ops/sweep-order-effects.ts`, `scripts/db/index-sync.ts`, `scripts/docs/generate-rate-limit-budgets.ts`** — Iterate `enabledModules` to operate on every mounted domain.
- **`tests/cross-cutting/contract-bundles.test.ts`** (referenced in the header comment) — Validates that any module shipping an `openapi.yaml` has a matching `MODULE_SECTIONS` entry; cross-checks against this list rather than at import time, so the bundler can run before `enabledModules` is importable.

## Notes
- **Order is cosmetic.** Alphabetical ordering is chosen only to keep diffs small; mount order, import resolution, and `subscribe` timing are independent of array position.
- **`ModuleName` is maintained by hand.** It cannot be derived via `satisfies`, `typeof`, or mapped types because `AppModule.name` is `string`. Forgetting to add a new module name here is a silent gap: the type will still compile, but `shopModules` will silently exclude that module.
- **OpenAPI coupling is checked after the fact.** The bundler (`scripts/contracts/openapi-bundle.ts`) reads `openapi.yaml` from disk and does not import `enabledModules`, so a new module with a contract file will not break the build until the cross-cutting test runs.
