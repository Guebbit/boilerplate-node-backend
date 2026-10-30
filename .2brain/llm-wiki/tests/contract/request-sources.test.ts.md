---
source: tests/contract/request-sources.test.ts
sha256: 4a9d28aa6e4fd17d5f419c4169c25124864f8c20e7a3caaf30ee0779b4aeea9e
generated_at: 2026-10-29T06:40:46.370306+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/request-sources.test.ts

## Purpose

Statically verifies that every controller's declared request sources (via `readInput` / `surface:`) are a **subset** of the sources the OpenAPI spec declares for the corresponding operation (`in: path` / `in: query` / `requestBody`). It automates the manual comparison that previously uncovered five undocumented-input bugs, and does so entirely by regex-reading source files—no server is booted, no runtime modules are imported.

## Key elements

- **`MountedRoute`** (interface) — one mounted route: HTTP method, Express path, OpenAPI-spelled path, and the optional controller file that terminates it. Inline one-line handlers (e.g. `GET /`) have `controller: undefined` and are skipped by the sources assertion.
- **`readMountPrefixes()`** — Recovers every router file and its mount prefix from `src/modules.ts` (enabled modules only), each module's `module.ts` manifest, and `src/app/routes.ts` (system router). Disabled modules are excluded by design.
- **`readControllerImports()`** — Maps controller bindings in a router file to their defining file paths (always `./controllers/…` relative).
- **`readMountedRoutes()`** — Walks every route file, extracts `router.method('path', …)` calls, and resolves the terminating controller as the last imported identifier in the argument list.
- **`readSurfaceSources()`** — Reads the `SURFACE_SOURCES` table from `src/infrastructure/http/request.ts` via regex (not import) to avoid pulling in express/mongoose/i18next. Includes a tripwire assertion that the parsed table is non-empty.
- **`SHARED_DECLARATION_FILES`** — Maps factory-call markers (e.g. `createDeleteController(`) to the file that holds the actual `readInput` declaration, so module wrappers that delegate to a shared factory are resolved correctly.
- **`readDeclaredSources()`** — Resolves the full set of sources a controller declares: explicit `surface:` literals, implicit `requireId` (defaults to `'path'`), and declarations inherited through shared factories (cycle-guarded).
- **`SpecParameter` / `SpecOperation` / `SpecPathItem`** — Minimal OpenAPI types covering only the fields this test inspects (`in`, `$ref`, `requestBody`).
- **The test body** (truncated in the provided content) — Iterates mounted routes, looks up the matching spec operation, and asserts `declaredSources ⊆ specSources` for each.

## Relationships

- **`src/infrastructure/http/request.ts`** — Source of the `RequestInputSource` type import and the `SURFACE_SOURCES` table read statically by `readSurfaceSources()`.
- **`tests/support/paths.ts`** — Provides `REPO_ROOT` used to resolve every `readFileSync` path.
- **`scripts/contracts/asyncapi-bundles.ts`** — Produces/maintains the OpenAPI spec artifact (`openapi.yaml`) that this test parses on the spec side of the comparison.

## Notes

- **Assertion is one-directional.** The test asserts *declared ⊆ spec*. The converse (spec declares a source no controller reads) is intentionally not checked, because `readInput` merges every key it finds, so a route can legitimately accept a declared body it never names a field of.
- **Everything is regex.** No `import` of runtime modules; the only imports are `node:fs`, `node:path`, `yaml`, the `RequestInputSource` *type*, and `REPO_ROOT`. This keeps the test fast and free of side effects, at the cost of fragility if the source formatting changes.
- **Vacuous-pass tripwire.** `readSurfaceSources` includes an `expect` guard because a regex that silently stops matching would make every assertion below pass with an empty table.
- **Disabled modules are excluded.** A module folder that exists on disk but is absent from the `enabledModules` array is *not* counted as mounted, so its routes are intentionally not compared.
- **`requireId` is treated as an implicit `surface: 'path'`** declaration unless the call already names a `surface:` option.
