---
source: tests/contract/request-sources.test.ts
sha256: 4a9d28aa6e4fd17d5f419c4169c25124864f8c20e7a3caaf30ee0779b4aeea9e
generated_at: 2026-11-08T09:21:12.456193+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/request-sources.test.ts

## Purpose

Contract test that statically compares the input sources each controller declares via `readInput` / `requireId` against the `in:` / `requestBody` declarations in `openapi.yaml`. It asserts that a controller's declared sources are a **subset** of what the spec allows, catching undocumented input (e.g. a path-form delete reading an undeclared body). No server is booted; everything is recovered by reading source files and the spec with regex/`yaml.parse`.

## Key elements

- **`MountedRoute`** — interface carrying method, Express path, OpenAPI-spelled path, and the terminating controller name + file (or `undefined` for inline one-line responders like `GET /`).
- **`readMountPrefixes()`** — walks `src/modules.ts` (only enabled modules), each `src/modules/<name>/module.ts`, and `src/app/routes.ts` to build a `Map<routeFile, prefix>`. Resolves router imports through aliases.
- **`readControllerImports(source, routeFile)`** — maps each `./controllers/<name>` import in a router file to its absolute path, so the terminating controller can be identified.
- **`readMountedRoutes()`** — iterates every router file from `readMountPrefixes`, extracts `router.<method>(…)` calls, picks the last imported identifier in the argument list as the controller, and returns the full `MountedRoute[]`.
- **`readSurfaceSources()`** — reads the `SURFACE_SOURCES` literal from `src/infrastructure/http/request.ts` via regex (not imported, to avoid pulling express/mongoose). Returns `Record<surface, RequestInputSource[]>`. A deliberate `expect` guards against a regex that silently matches nothing.
- **`SHARED_DECLARATION_FILES`** — maps factory-call markers (e.g. `createDeleteController(`) to the file that actually declares the sources, so `readDeclaredSources` can follow the indirection.
- **`readDeclaredSources(controllerFile, seen?)`** — recursively scans a controller file for `surface: '<name>'` literals, `requireId(…)` calls (defaulting to `'path'`), and shared-factory markers, returning the union of declared `RequestInputSource` values. Cycle-guarded via `seen`.
- **`SpecParameter` / `SpecOperation`** — narrow structural types for the three OpenAPI fields the test reads (`in`, `$ref`, `requestBody`), avoiding a full spec dependency.
- **The `test` blocks** (truncated in view) — read `openapi.yaml`, index operations by method+path, and assert `declaredSources ⊆ specAllowedSources` per route.

## Relationships

- **`src/infrastructure/http/request.ts`** — the file whose `SURFACE_SOURCES` literal and `RequestInputSource` type this test reads statically; the source of truth for which sources exist.
- **`tests/support/paths.ts`** — provides `REPO_ROOT`, the base path all `read()` calls resolve against.
- **`scripts/contracts/asyncapi-bundles.ts`** — produces the AsyncAPI/OpenAPI bundle that `openapi.yaml` (the spec this test parses) is generated from; upstream of the spec artifact under test.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI mutation-wave scheduling; ensures this contract test runs in the correct wave relative to other suites that may mutate spec files.

## Notes

- **Direction matters.** Only `declared ⊆ spec` is asserted. The reverse (spec declares a source no controller reads) is explicitly *not* checked because `readInput` merges every key it finds, so an undeclared-but-present body is legitimate.
- **Regex fragility is acknowledged.** The file's own comments note that a regex stopping matching makes the check pass vacuously. The `expect` on `SURFACE_SOURCES` and the tripwire pattern in `readDeclaredSources` exist specifically to fail loudly if the source format drifts.
- **Enabled-modules filter.** A module folder that exists on disk but is absent from the `enabledModules` array is excluded. This is intentional: its routes are not in the build, so they must not count as mounted.
- **Inline controllers are skipped, not failed.** `GET /`, `GET /observability/events`, `GET /observability/metrics` have no `readInput` call; they appear in `MountedRoute[]` with `controller: undefined` and are excluded from the subset assertion.
- **`requireId` is treated as `readInput`.** A controller calling `requireId(…)` reads the same sources; omitting `surface:` defaults to `'path'`.
