# tests/contract/request-sources.test.ts

## Purpose

Static contract test that asserts every controller's declared request sources (`params`, `body`, `query`) are a **subset** of what the OpenAPI spec allows for the same route. It does this by reading source files with regex (no server, no imports of runtime modules) and comparing two written claims: the `surface:` / `readInput` declarations in controllers versus the `in:` / `requestBody` entries in `openapi.yaml`. It also verifies the module registry is honest — a wrong `basePath` or a module missing from `enabledModules` makes real operations unreachable, and this test is the only check that notices.

## Key elements

- **`MountedRoute`** — interface for a resolved route: method, express path, spec path (`:param` → `{param}`), and the terminating controller (or `undefined` for inline handlers like `GET /`).
- **`readMountPrefixes()`** — parses `src/modules.ts` (enabled modules + their `basePath`) and `src/app/routes.ts` (the one named system router) to produce a map of router-file → mount prefix. Disabled modules are excluded.
- **`readControllerImports()`** — within a single router file, resolves `./controllers/…` import bindings to absolute file paths.
- **`readMountedRoutes()`** — walks every router file, extracts `router.method('…', …)` calls, and identifies the terminating controller as the last imported identifier in the argument list.
- **`readSurfaceSources()` / `SURFACE_SOURCES`** — reads the `SURFACE_SOURCES` literal table from `src/infrastructure/http/request.ts` via regex (deliberately not imported, to avoid pulling in express/mongoose/i18next).
- **`SHARED_DECLARATION_FILES`** — maps a call-site marker (currently `createDeleteController(`) to the shared factory file whose `surface:` declaration applies to every controller produced by that factory.
- **`readDeclaredSources(file)`** — collects the union of sources a controller declares: scans for `surface: '…'` literals, `extractAndValidateId(…)` calls (treating them as implicit `surface: 'write'` unless a trailing string arg overrides), and follows `SHARED_DECLARATION_FILES` transitively with a cycle guard.
- **`Spec` / `SpecPathItem` / `SpecOperation`** — minimal structural types for the slice of OpenAPI this test reads (parameters, `requestBody`, `$ref`).
- **Tripwire assertion** (in `readSurfaceSources`) — asserts the parsed table is non-empty so a silent regex failure cannot make every downstream assertion pass vacuously.

## Relationships

- **`scripts/contracts/asyncapi-bundles.ts`** — produces/manages the spec artifact (OpenAPI/AsyncAPI bundle) that this test reads and compares against. The test's spec-parsing logic and the script's bundling logic must stay in agreement on path shapes and parameter placement.

## Notes

- **Directionality:** the assertion is one-way (declared ⊆ spec). The spec may declare a source no controller reads; that is considered legitimate because `readInput` merges every key it finds.
- **Static by design:** nothing is booted or imported from the app. The test compares two written claims (source declarations vs. spec) and a runtime probe would only reveal what one particular request carried.
- **Regex fragility is a known failure mode:** the file documents a past incident where a regex stopped matching after the `surface` refactor and the test passed for every controller without reading a single declaration. The non-empty-table assertion in `readSurfaceSources` is the guard against recurrence.
- **Inline handlers** (`GET /`, observability endpoints) are recorded as mounted routes but have no `controller`, so they are skipped by the sources comparison. They still count toward registry-completeness checks.
- **`extractAndValidateId`** is treated as an implicit source declaration (defaults to `'write'` surface). Any new helper that calls `readInput` under a different name must be added here or the test will under-count.
