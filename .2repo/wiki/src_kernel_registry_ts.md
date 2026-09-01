# src/kernel/registry.ts

## Purpose

Defines the **module manifest type** (`AppModule`) and the two runtime entry points (`registerModules`, `resolveImageTargets`) that turn the explicit list in `src/modules.ts` into a wired-up application. It is the single place where the shape of a module is enforced at the type level, so enabling a domain is a one-line edit to the list rather than a filesystem discovery step.

## Key elements

- **`DemoShape`** (`'response' | 'stored'`) — classifies whether a seeded collection is served verbatim by the API or only stored internally.
- **`DemoExport`** — discriminated union requiring `seedExport` *and* `demoShapes` together (or neither). Forces every exported collection to be labelled at the manifest, preventing an unclassified row from leaking into a sibling repo.
- **`ImageTarget`** — the writeback contract a module registers so the image-digest worker can persist `imageUrl`/`thumbnailUrl` onto a document without importing the module's repository. The `writeback` call is guarded by a `pendingImageKey` match to make stale/duplicate deliveries no-ops.
- **`AppModule`** — the full manifest: `name`, optional `basePath`, `routes`, `subscribe`, `locales` (a directory path, not loaded dicts), `seeds`, `imageTargets`, plus the `DemoExport` intersection.
- **`resolveImageTargets(appModules)`** — flattens every module's `imageTargets` into a single `Record<string, ImageTarget | undefined>` for the worker. Takes the list as a parameter (does not import `enabledModules`) to keep this file free of `src/modules/*` imports.
- **`registerModules(appModules)`** — iterates the list and calls each module's `subscribe?.()`. Called once at boot, after all modules are known, so any handler may reference a sibling.

## Relationships

- **`src/modules.ts`** — produces the `AppModule[]` list that is passed to `registerModules` and `resolveImageTargets`. This file does *not* import it.
- **`src/app.ts`** — calls `registerModules` during boot and reads each module's `locales` path to pass to `registerLocaleDirectories` before `i18next.init()`.
- **`src/app/workers.ts`** — calls `resolveImageTargets` once and hands the resulting lookup to `infrastructure/adapters/image.worker.ts` as a plain resolver.
- **`src/infrastructure/persistence/seed.ts`** — provides the `SeedOutcome` type used by the `seeds` field.
- **Module files** (`account`, `audit-logs`, `cart`, `delivery`, `feedback`, `inventory`, `locales`) — each exports an object conforming to `AppModule`; they are listed in `src/modules.ts` but never imported by this file.
- **`db/demo/assemble.ts`** — walks `enabledModules` and calls each module's `seedExport`.

## Notes

- **No `src/modules/*` imports, by design.** The constraint exists so `infrastructure/adapters/image.worker.ts` (which needs `resolveImageTargets` but must not import a module directly) can depend on this file without creating a cycle. If you add a helper here, do not reach into a module.
- **`resolveImageTargets` return type is `ImageTarget | undefined`**, stated explicitly because `noUncheckedIndexedAccess` is off project-wide; without the annotation an unregistered `collection` string would type-check as always present.
- **`seedExport` must read rows back through the model's `toJSON`**, not return the fixtures it wrote. Returning fixtures would publish a guess labelled as truth in the downstream demo dataset.
- **`demoShapes` is stated, not derived.** A structural matcher could mislabel a `stored` collection as `response` (e.g. `locales`), so the classification is an explicit per-collection map.
- **`subscribe` is separate from route mounting.** A domain-event handler may fire for an event emitted by a sibling mid-request, so all subscriptions must be registered before the first route is reachable.
