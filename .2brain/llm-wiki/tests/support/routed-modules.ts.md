---
source: tests/support/routed-modules.ts
sha256: 0fac3c7f9e93d0b2325f85a4571e6aeb156fb4588b7f7da11510ee1f5afe4da0
generated_at: 2026-10-15T13:00:41.468513+00:00
model: ollama:qwen3.8:27b
---

# tests/support/routed-modules.ts

## Purpose

Single-purpose re-export of every module that mounts an Express router, keyed by directory name. It reads the list dynamically from the module registry (`src/modules.ts`) so any newly enabled routed module is automatically included without updating a hardcoded list.

## Key elements

- **`ROUTED_MODULES: Record<string, Router>`** — The sole export. Built by calling `routedModulesOf(enabledModules)` (from `@tests/routes`) against the registry's `enabledModules` (from `src/modules.ts`). Each key is the module's directory name under `src/modules/`; each value is the module's `Router`.

## Relationships

- **`src/modules.ts`** — Provides `enabledModules`, the input that determines *which* modules appear in `ROUTED_MODULES`. Adding a module to the registry makes it appear here automatically.
- **`tests/support/routes.ts`** — Provides the `routedModulesOf` helper that filters the registry to only routed modules and maps them to their routers.
- **`tests/cross-cutting/authenticated-controllers.test.ts`**, **`tests/cross-cutting/role-hierarchy-routes.test.ts`**, **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — Consume `ROUTED_MODULES` to iterate over all routers in a single pass (e.g., asserting every route is guarded, or that auth middleware is present).

## Notes

- **Why a separate file from `@tests/routes`:** `routes.ts` contains mock factories that are pulled in via `jest.requireActual('@tests/routes')` inside a `jest.mock` factory. If the real router imports lived there, that `requireActual` would evaluate real middleware modules (`rate-limit`, `cache`, `upload`, `route-flag`) while their own mocks are still being defined, causing those factories to resolve to `undefined`. Keeping the router imports in this file isolates them from that evaluation path.
- **Consumer responsibility:** A test file that imports `ROUTED_MODULES` must still declare its own `jest.mock(...)` calls for the middleware factories *before* the import, exactly as if it were importing each router directly. See the header in `@tests/routes` for the full reasoning.
- **Unregistered module folders** (present on disk but absent from the registry) are *not* included here; that gap is deliberately left to `write-routes-are-guarded.test.ts` to flag.
