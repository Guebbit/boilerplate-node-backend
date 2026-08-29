# docs/reference/src-app.md

## Purpose

A single-page reference that maps the top of `src/`, the `src/app/` assembly directory, the `src/kernel/` module system, and `src/types/`. It exists so a reader can orient themselves in the four-tier architecture (`infrastructure → kernel → modules → app`) without opening each file individually. It pairs with the deeper theory docs under `docs/theory/` and tool docs under `docs/tools/`.

## Key elements

- **`src/cluster.ts`** — Process entry point (named in `package.json`); forks one worker per core, restarts dead workers.
- **`src/app.ts`** — Boot sequence; the sole file that knows the install order. Tracing → env validation → infra → six `install*` calls in request order.
- **`src/modules.ts`** — Alphabetical list of enabled domains (one import + one array entry each). No filesystem discovery or auto-registration.
- **`src/globals.d.ts`** — Ambient type widening of Express `Request` (uploaded image URLs, locale, translator, observability handle).
- **`src/app/` (8 files)** — One file per install step, grouped by *when* it runs: `security.ts`, `request-context.ts`, `telemetry.ts`, `static-assets.ts`, `routes.ts`, `system-routes.ts`, `error-handling.ts`, `workers.ts`, `demo.ts`.
- **`src/kernel/` (6 files)** — The module contract and cross-module seams: `registry.ts` (`AppModule` type), `authentication.ts`, `middlewares/authorizations.ts`, `authorization.ts` (`createCallerScope`), `events.ts`, `seed-accounts.ts`.
- **`src/types/`** — `index.ts` (single import path via `@types`) and `asyncapi.generated.ts` (generated, never hand-edited).

## Relationships

No graph neighbors are recorded for this file. It is a documentation-only artifact and is referenced *by* other docs via the "Read next" links it contains (e.g., `../theory/architecture.md`, `../theory/modules.md`, `../tools/security.md`), but does not appear as a dependency target in the dependency graph.

## Notes

- The file is a **reference doc**, not source code. Its "Key elements" describe other files; editing this page does not change runtime behaviour.
- The install-step order in `src/app/` is explicitly load-bearing (security before context, context before telemetry, routes before error handling). The doc calls this out because reordering is behaviour, not cosmetics.
- `src/types/index.ts` is the *only* sanctioned import path for contract types; importing generated files directly is enforced against by `tests/cross-cutting/generated-type-shadowing.test.ts`.
- The file ends truncated (the `asyncapi.generated.ts` row is cut off), so the full description of the generated-types check is not visible here.
