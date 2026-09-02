# src/kernel/registry.ts

## Purpose

Defines the `AppModule` manifest type and the boot-time registration functions that turn the static list in `src/modules.ts` into a running application. It is the single place where the app tier learns what each module needs (routes, subscriptions, seeds, image writebacks, required env vars) without importing any individual module, keeping the kernel free of `src/modules/*` dependencies.

## Key elements

- **`AppModule`** — The manifest type every module exports. Fields include `name`, optional `basePath`/`routes`, `subscribe`, `locales`, `seeds`, `imageTargets`, `requiredConfig`, and the `DemoExport` union (`seedExport` + `demoShapes` or neither).
- **`RequiredConfig`** — `{ key, minLength, placeholder }` describing one mandatory env var a module declares.
- **`ImageTarget`** — `{ writeback(documentId, key, urls) → Promise<boolean> }`; the module-provided callback the image worker uses to persist digested URLs without importing the module's repository.
- **`DemoShape`** / **`DemoExport`** — Classify each seeded collection as `'response'` (API-servable) or `'stored'` (internal-only); union type makes omitting one without the other a compile error.
- **`resolveImageTargets(appModules)`** — Flattens all modules' `imageTargets` into a single `Record<string, ImageTarget | undefined>` for the worker's resolver.
- **`registerModules(appModules)`** — Calls `assertRequiredConfig` then invokes each module's `subscribe()`. Must run before any route is mounted.
- **`assertRequiredConfig`** (module-private) — Collects every offending env var across all modules and throws once, listing all failures. Skipped when `NODE_ENV=test` or `isDemoMode()`.

## Relationships

- **`src/modules.ts`** — Exports the `enabledModules` array; the only caller of `registerModules` and `resolveImageTargets`.
- **`src/app.ts`** — Calls `registerModules` at boot and reads each module's `locales` path before `i18next.init()`.
- **`src/app/workers.ts`** — Calls `resolveImageTargets(enabledModules)` once and passes the resulting lookup to `infrastructure/adapters/image.worker.ts`.
- **`src/infrastructure/adapters/demo-outbox.ts`** — Provides `isDemoMode()`, consumed by `assertRequiredConfig` to skip validation in the demo profile.
- **`src/infrastructure/persistence/seed.ts`** — Provides the `SeedOutcome` type used in `AppModule.seeds`.
- **`src/modules/*/module.ts`** (account, audit-logs, cart, delivery, feedback, …) — Each exports an object conforming to `AppModule`; none are imported here.
- **`db/demo/assemble.ts`** / **`scripts/export-demo-dataset.ts`** (referenced in docblocks) — Consume `seeds` and `seedExport` respectively; not imported by this file.
- **`src/modules/cart/tests/…`**, **`src/modules/delivery/tests/…`** — Integration tests that exercise modules registered through this manifest.

## Notes

- This file must never import from `src/modules/*`. The entire design (passing `appModules` as a parameter to every function) exists to preserve that boundary so `image.worker.ts` can depend on the registry without creating an import cycle.
- `subscribe` is called *after* all modules are known, so a handler can reference a sibling's events; calling it inline during module import would not be safe.
- `assertRequiredConfig` throws once with all failures rather than failing on the first one, to avoid N restart cycles for N mistakes.
- `resolveImageTargets` annotates the return value with `| undefined` explicitly because `noUncheckedIndexedAccess` is off project-wide; without it, an unregistered `collection` key would type-check as always present.
- `DemoExport` is a strict union (both fields or neither), not an optional-pair object, so a module that seeds data must also classify every collection it returns.
