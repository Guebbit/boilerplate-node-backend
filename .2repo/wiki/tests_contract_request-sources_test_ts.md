# tests/contract/request-sources.test.ts

## Purpose

A static-analysis contract test that verifies two written claims agree: the request sources a controller actually reads (via `surface` declarations, `extractAndValidateId`, or shared factories) and the sources its OpenAPI operation declares (`in: path` / `in: query` / `requestBody`). It asserts the controller's declared sources are a **subset** of the spec's, catching undocumented input. It also doubles as a registry integrity check: if a module is missing from `src/modules.ts` or has a wrong `basePath`, the resulting unreachable routes fail here. No server is booted; everything is read from source files via regex.

## Key elements

- **`readMountPrefixes()`** — Parses `src/modules.ts` for the `enabledModules` array and per-module `basePath`, plus the one router named in `src/app/routes.ts`. Returns a map of router-file → mount prefix. Only *enabled* modules are counted.
- **`readControllerImports(source, routeFile)`** — Resolves `./controllers/<name>` imports in a router file to absolute controller paths.
- **`readMountedRoutes()`** — Iterates every router file, extracts `router.<method>('<path>', …)` calls, and records each route's Express path, OpenAPI-spelled path, and the terminating controller (last imported identifier in the argument list).
- **`readSurfaceSources()`** — Reads the `SURFACE_SOURCES` table from `src/infrastructure/http/request.ts` by regex (not import, to avoid pulling in express/mongoose/i18next). Asserts non-empty to prevent vacuous passes.
- **`SHARED_DECLARATION_FILES`** — Maps factory markers (e.g. `createDeleteController(`) to the file that actually declares sources, so controllers that delegate to a factory are checked against the factory's declaration.
- **`readDeclaredSources(controllerFile, seen)`** — Walks a controller file (and any shared-factory file) collecting sources from `surface: '…'` literals and `extractAndValidateId(…)` calls. Uses a `seen` set to guard against cycles.
- **`Spec` / `SpecPathItem` / `SpecOperation`** — Narrow structural types for the OpenAPI slice this test reads (paths, parameters, `$ref` resolution).
- **Tripwire assertion** (in `readSurfaceSources`) — Fails explicitly if the regex matches nothing, preventing the silent "declares nothing" vacuous-pass failure mode.

## Relationships

- **`src/modules.ts`** — Read at runtime to determine which modules are enabled and to map import bindings to module folder names. The test only counts modules listed in `enabledModules`.
- **`src/infrastructure/http/request.ts`** — Read (not imported) to extract the `SURFACE_SOURCES` constant that maps surface names to their allowed source arrays.
- **`docs/theory/request-input.md`** — Cited in the file's header comment as the document that originally listed five contract bugs found by hand-reading the two claims; this test automates that comparison.
- **`docs/index.md`** — Referenced in the dependency graph as the wiki entry point; this test page is a node within that documentation tree.
- **`scripts/contracts/asyncapi-bundles.ts`** — Appears in the dependency graph; the test's OpenAPI reading logic is independent of that script, but both consume the same spec artifact.

## Notes

- **Subset direction only.** The test asserts `controller sources ⊆ spec sources`. The reverse (spec declares a source no controller reads) is intentionally *not* asserted, because `readInput` merges every key it finds and a route may legitimately accept a declared body it never names a field of.
- **Inline handlers are skipped.** `GET /`, `GET /observability/events`, `GET /observability/metrics` are one-line responders with no `readInput` call; they count as mounted (so a missing module would still be caught) but are exempt from the sources check.
- **Regex fragility is acknowledged.** The header and the `readSurfaceSources` tripwire both document a prior incident where a regex silently stopped matching and every assertion passed vacuously. If you add a new surface or change the `SURFACE_SOURCES` shape, the regexes in this file need updating.
- **Enabled-modules only.** A module folder that exists on disk but is absent from `enabledModules` is deliberately *not* scanned. A disabled module's routes must not satisfy or violate the contract.
- **`extractAndValidateId` surface detection.** The surface argument is inferred as the last trailing string literal in the call; if absent, it defaults to `'write'` per the function's signature.
