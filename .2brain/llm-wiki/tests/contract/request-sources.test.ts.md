---
source: tests/contract/request-sources.test.ts
sha256: e21f5987e4a08afabab379e9d9c6393a06c0f094b27e8cffba07dd8da8f17410
generated_at: 2026-10-15T12:33:36.634255+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/request-sources.test.ts

## Purpose

A static, no-server test that verifies every controller's declared request-input sources (via `readInput`, `requireId`, or a shared factory) are a **subset** of the sources the OpenAPI spec allows for that operation (`in: path` / `in: query` / `requestBody`). It automates the hand-comparison that previously surfaced five contract bugs (documented in `docs/theory/request-input.md`). The assertion is one-directional only: a controller reading a source the spec does not declare is a bug; the reverse (spec declares a source no controller names) is legal because `readInput` merges every key it finds.

## Key elements

- **`readMountPrefixes()`** — Resolves every mounted router file to its URL prefix by parsing `src/modules.ts` (enabled-module imports + each module's `basePath`) and `src/app/routes.ts` (the system router). Disabled module folders are excluded.
- **`readControllerImports()`** — Maps controller bindings in a router file to their `.ts` paths, restricted to relative `./controllers/…` imports.
- **`readMountedRoutes()`** — Walks every router file, extracts `router.method('path', …)` declarations, resolves the terminating controller (last imported identifier in the argument list), and records both Express and OpenAPI spellings of the path. Inline handlers (e.g. `GET /`, observability endpoints) get `controller: undefined` and are skipped by the sources check.
- **`readSurfaceSources()`** — Statically regexes the `SURFACE_SOURCES` table out of `src/infrastructure/http/request.ts` rather than importing it, to avoid pulling in express/mongoose/i18next.
- **`SHARED_DECLARATION_FILES`** — Maps factory markers (e.g. `createDeleteController(`) to the shared file that actually declares the sources, so a six-line module spec isn't mistaken for "declares nothing."
- **`readDeclaredSources(controllerFile, seen)`** — Recursively collects a controller's declared sources by matching `surface:'…'` literals, `requireId(…)` calls (defaulting to `'path'`), and following shared-factory references. A `seen` set guards against cycles.
- **`Spec` / `SpecOperation` / `SpecParameter` / `SpecPathItem`** — Narrow interfaces for the only slice of the OpenAPI document this test reads (paths, parameters, `requestBody`).
- **`resolveParameter(spec, reference)`** — Resolves local `#/components/parameters/X` references (the bundled spec contains only local refs; external refs are resolved upstream by the bundle step).

## Relationships

- **`src/infrastructure/http/request.ts`** — The sole runtime type import (`RequestInputSource`). The file is also read as plain text to extract the `SURFACE_SOURCES` table. This is the canonical definition of what "sources" means; this test enforces consistency between that definition and the OpenAPI spec.
- **`scripts/contracts/asyncapi-bundles.ts`** — Produces the bundled OpenAPI spec (resolving per-module `shared/contracts/…` references into `#/components/…`). This test reads that bundled output; if the bundle step changes reference resolution, `resolveParameter` and the spec-reading logic here are affected.

## Notes

- **One-directional assertion.** Declared ⊆ spec. The reverse is intentionally *not* checked because `readInput` merges all keys present in the request, so a route may legally accept a declared body field it never names.
- **Static by design.** No server is booted. The test compares two written claims (source code literals vs. spec YAML). A runtime probe would only reveal what one request happened to carry.
- **Tripwire against silent regex failure.** The file includes an explicit `expect` asserting that `SURFACE_SOURCES` parsed to a non-empty table. Without it, a regex that stops matching would make every controller appear to "declare nothing" and every assertion pass vacuously.
- **Shared-factory indirection.** A scanner that only reads the module file (e.g. a six-line `createDeleteController` spec) would find no `surface:` literal and wave the controller through. `SHARED_DECLARATION_FILES` + the recursive `readDeclaredSources` handle this.
- **Enabled-modules only.** A module folder that exists on disk but is absent from the `enabledModules` array is *not* treated as mounted. This is deliberate: the check should catch a stale route, not paper over it.
- **File content provided here is truncated.** The `resolveParameter` body, the spec-loading logic, and the actual `describe`/`it` assertion block are cut off. The wiki page above describes only the visible portion.
