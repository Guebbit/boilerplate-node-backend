---
source: tests/contract/route-spec-parity.test.ts
sha256: 921d9369b6e38db0519a8bd944368d4c450f5f5ae4fb87eb68c417a47e400ba7
generated_at: 2026-11-08T09:21:22.543640+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/route-spec-parity.test.ts

## Purpose

Contract test that asserts the routes the Express app actually mounts are identical, operation-for-operation, to the operations declared in the bundled `openapi.yaml`. It guards against undocumented endpoints (mounted but not declared) and broken promises (declared but not mounted), and also catches duplicate route registrations.

## Key elements

- **`toSpecPath`** — Converts an Express path (`:id`) to OpenAPI spelling (`{id}`) so both sides can be compared in a single format.
- **`operationsOf(prefix, router)`** — Reads a single router's route table (via `routeTable` from `tests/support/routes.ts`) and returns its operations as `METHOD /full/path` strings, prepending the mount prefix.
- **`mountedOperations()`** — Collects every operation the app serves: each enabled module's mounts (from `enabledModules`), then the system router at `/`, then the config router at `/`.
- **`declaredOperations()`** — Parses `openapi.yaml` and extracts every `METHOD /path` pair from its `paths` object.
- **`isTestLever`** — Filters out `/__test/*` routes (demo-extension levers, intentionally excluded from the API contract).
- **`describe('mounted routes and the published contract')`** — Four assertions: non-vacuity guard (>100 ops on each side), spec covers mounts, mounts cover spec, and no duplicate `METHOD path` pairs.

## Relationships

- **`src/modules.ts`** — Provides `enabledModules`, the registry of module descriptors (each carrying `mounts` with `basePath` and `routes`). The test iterates this instead of a booted `app` because Express 5 routers don't record their mount path.
- **`src/app/system-routes.ts`** — Exports `router`, the root-level system router. The test mounts it at `''` (root).
- **`src/app/config-routes.ts`** — Exports `router`, the root-level config router. Also mounted at `''`.
- **`tests/support/routes.ts`** — Exports `routeTable`, the helper that walks a live Express router and returns its registered `{ method, path }` entries.

## Notes

- The test reads **live router objects**, not source text, so routes registered in loops, helpers, or renamed imports are all captured.
- `express.static` (in `app/static-assets.ts`) is deliberately out of scope: it has no route table and the spec declares no operation for it.
- The non-vacuity check (`> 100` ops) exists because a broken `routeTable` walker would make both the "covers" assertions pass trivially on empty lists.
- `HTTP_METHODS` is a `Set` used to filter out non-operation keys (e.g. `summary`, `description`) that may appear on an OpenAPI path item.
- Comparison keys use upper-cased methods on the declared side (`GET /x`) and the router side (`get /x` → upper-cased via template), so case consistency depends on `routeTable` already returning lower-case methods.
