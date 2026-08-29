# src/modules/observability/module.ts

## Purpose

Module registration for the `observability` module. Exports a single `AppModule`-conforming object that binds the router from `./routes` to the base path `/observability`, declares a read-only dependency on `audit-logs`, and sets the subdomain classification to `'generic'`. It is the entry point the kernel uses to mount this module; it owns no data of its own.

## Key elements

- **Default export** — a `satisfies AppModule` object with:
  - `name: 'observability'` — the module's registered identity.
  - `subdomain: 'generic'` — signals this is a cross-cutting operator concern, not a business domain.
  - `basePath: '/observability'` — URL prefix for all routes.
  - `routes: router` — the Express-style router imported from `./routes`.
  - `dependsOn` — a single entry declaring a dependency on `audit-logs` (role `'conformist'`): `GET /observability/audit` renders that module's stored entries without re-modelling them.
  - `locales` — path to a `locales/` directory co-located with this file, resolved via `path.join(__dirname, 'locales')`.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that this file's export must satisfy.
- **`src/modules.ts`** — the module loader/registry that consumes this default export to mount the module.
- **`src/modules/observability/routes.ts`** — supplies the `router` that this file registers; all route definitions, auth strategies (cookie for SSE, static credential for the scrape endpoint), and handler logic live there.

## Notes

- **No `index.ts` barrel by design.** A sibling module cannot import anything from this directory because there is no re-export surface; boundary lint enforces the structural guarantee rather than relying on convention.
- **`conformist` role in `dependsOn`.** This module reads `audit-logs` data as-is and adds only a URL; it does not define a model over that collection.
- **Auth is not uniform across routes.** The SSE stream and the Prometheus scrape endpoint use different credential mechanisms. The rationale is documented in `routes.ts`, not here.
- Deleting this file (and its `routes.ts`) removes the operator dashboard and endpoints but does **not** stop the underlying process-level measurements in `infrastructure/observability`.
