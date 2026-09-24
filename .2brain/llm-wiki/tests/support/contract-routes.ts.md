---
source: tests/support/contract-routes.ts
sha256: 7f49013c3fd008109c7c5aa1b1b925efb1f79df4c00a635f303c1867cc0c7208
generated_at: 2026-09-23T20:09:55.903554+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract-routes.ts

## Purpose

Provides a flat, app-wide inventory of every mounted endpoint (method, absolute path, effective guard chain) from the perspective of enabled modules. It exists as a separate test-support module so that contract-level assertions can inspect the full route surface without paying the side-effect cost (event subscriptions, demo seeding) that `enabledModules` incurs and that per-module route unit tests don't need.

## Key elements

- **`MountedRoute`** (interface) — one row describing a single endpoint: uppercased `method`, absolute `path`, ordered `guards` array (router-level + per-route), and optional `permissionKey` from `requirePermission`.
- **`everyMountedRoute()`** (const function) — iterates `enabledModules`, filters to those exposing `basePath` + `routes`, calls `effectiveRouteTable` on each module's own `Router`, and flat-maps the results into `MountedRoute[]` rows (prefixing each path with the module's `basePath`).

## Relationships

- **`src/modules.ts`** — imports `enabledModules`; this file iterates that list to discover which modules contribute routes.
- **`tests/support/routes.ts`** — imports `effectiveRouteTable`; called once per module router to extract method/path/guard metadata.
- **`tests/contract/authorization-contract.test.ts`** — consumes `everyMountedRoute` to assert guard/permission expectations across the full route surface.

## Notes

- Walks each module's `Router` individually rather than the assembled Express `app`, because `app.use(basePath, router)` registers a module as a single opaque middleware layer that `effectiveRouteTable` cannot decompose.
- `guards` concatenates `applies` (router-level) before `chain` (per-route), matching actual execution order.
- `path` is always absolute (`basePath + router path`); it is never relative.
- Deliberately kept out of `@tests/routes` to isolate the `enabledModules` import cost from tests that only need the `effectiveRouteTable` utility.
