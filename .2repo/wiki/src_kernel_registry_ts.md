# src/kernel/registry.ts

## Purpose

Defines the type-level contract that every domain module must satisfy (`AppModule`) and provides the boot-time functions that validate the module list and wire up domain-event subscriptions. It turns the explicit array in `src/modules.ts` into a validated, mounted application without any filesystem discovery.

## Key elements

- **`ContextRelationship`** — union of four labels (`conformist`, `customer-supplier`, `published-language`, `shared-kernel`) that describe the *shape* of a cross-module dependency, not just its existence.
- **`ContextEdge`** — a single entry in `dependsOn`: the target module name, the relationship label, and a one-sentence `because` rationale.
- **`Subdomain`** — `'core' | 'supporting' | 'generic'`; drives how much modelling effort a module may carry (enforced by a cross-cutting test).
- **`AppModuleCommon`** — shared fields: `name`, `subdomain`, `dependsOn`, `subscribe`, `locales`, `seeds`.
- **`RoutedModule`** — adds `basePath` + `routes` (an Express `Router`) for modules that serve HTTP.
- **`HeadlessModule`** — uses `never` for `basePath`/`routes`, so a module that owns a collection but exposes no URL is a distinct type.
- **`DemoExport`** — discriminated union: either `{ seedExport, demoShapes }` or neither, so an unclassified collection is a compile-time error.
- **`AppModule`** — `(RoutedModule | HeadlessModule) & DemoExport`; the single type every entry in `src/modules.ts` must satisfy.
- **`validateModules(appModules)`** — three-pass check: duplicate names, unknown/self dependencies, and cycle detection (DFS with `settled`/`walking` sets). Throws on first violation.
- **`registerModules(appModules)`** — calls `validateModules`, then iterates modules calling `subscribe?.()` so all event handlers exist before any route is mounted.

## Relationships

- **`src/modules.ts`** — exports the `AppModule[]` that this file validates and registers; the list is the single source of truth for what is enabled.
- **`src/app.ts`** — calls `registerModules` during boot and reads `locales` fields to call `registerLocaleDirectories` before `i18next.init()`.
- **`src/app/routes.ts`** — mounts each `RoutedModule`'s `routes` at its `basePath`.
- **`src/kernel/events.ts`** — the event-bus that `subscribe` hooks into; the registry's cycle check explicitly directs mutual dependencies here instead of as imports.
- **`src/infrastructure/persistence/seed.ts`** — provides the `SeedOutcome` type consumed by `AppModuleCommon.seeds`.
- **`src/modules/*/module.ts`** (account, audit-logs, cart, delivery) — each exports an `AppModule` value that is the concrete instance of the types defined here.
- **`db/demo/assemble.ts`** — calls each module's `seeds` function to build the demo dataset.
- **`docs/theory/modules.md`** — the normative document for the manifest shape defined here.

## Notes

- `dependsOn` must remain a DAG. The error message for a cycle points developers to domain events rather than a restructure.
- `subscribe` is deliberately separated from route mounting: a handler may fire in response to another module's request, so all subscriptions must be registered before the first route responds.
- `seedExport` must read back through the model's `toJSON` (the real serializer), not return the fixtures it wrote — returning fixtures would publish a guess labelled as truth.
- `demoShapes` is stated explicitly per collection rather than derived, because a shape-matcher can confidently mislabel a stored row as a response shape.
- The `never` fields in `HeadlessModule` and the discriminated `DemoExport` union make partial/ambiguous configurations a **type error**, not a runtime surprise.
