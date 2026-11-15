---
source: tests/contract/request-sources.test.ts
sha256: cf47c5ea3fe08f10cdd3910f80427c5c9f240c43bbfacb4a0daf8c534cc83f8d
generated_at: 2026-11-14T22:59:27.205023+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/request-sources.test.ts

## Purpose

Static contract test that compares, per mounted route, the request-input sources a controller declares (via `surface:` / `readInput`) against the sources the OpenAPI spec permits (`in: path` / `in: query` / `requestBody`). It catches the bug class "controller reads a source the contract never declares" without booting a server.

## Key elements

- **`MountedRoute`** — record of a mounted route: HTTP method, Express path, OpenAPI-spec path, and the terminating controller (or `undefined` for inline one-liners like `GET /`).
- **`readMountPrefixes()`** — regex-scans `src/modules.ts`, each `src/modules/<name>/module.ts`, and `src/app/routes.ts` to build a map of router file → mount prefix. Only *enabled* modules are included.
- **`readControllerImports()`** — resolves a router file's `./controllers/…` imports to concrete file paths.
- **`readMountedRoutes()`** — walks every router file, extracts `router.<method>('…', …)` calls, and pairs each with its controller (last import-matched identifier in the argument list).
- **`readSurfaceSources()` / `SURFACE_SOURCES`** — parses the `SURFACE_SOURCES` literal out of `request.ts` source text (not imported) to get the surface → source list mapping. A deliberate `expect` assertion guards against the regex silently producing an empty table.
- **`SHARED_DECLARATION_FILES`** — maps factory markers (`createDeleteController(`, `statsHandler(`) to the file where the shared `surface:` declaration actually lives, so `readDeclaredSources` can follow the chain.
- **`readDeclaredSources(controllerFile)`** — recursively collects the set of `RequestInputSource`s a controller reads, following shared-factory references (cycle-guarded) and accounting for `requireId()` calls that default to `'path'`.
- **`SpecParameter` / `SpecOperation`** — minimal OpenAPI shapes; the test reads only `in` and `$ref` fields from the spec.

## Relationships

- **`src/infrastructure/http/request.ts`** — the `RequestInputSource` type is imported; `SURFACE_SOURCES` is read as text from this file so the comparison target always matches the live definition.
- **`tests/support/paths.ts`** — provides `REPO_ROOT`, the base for every `readFileSync` call.

## Notes

- **One-directional assertion.** Only "controller reads ⊆ spec allows" is checked. The converse (spec declares a source no controller reads) is intentionally *not* asserted because `readInput` merges every key it finds.
- **Fully static.** No server, no Express, no Mongoose. The test compares two written artifacts (source text + YAML) via regex and `yaml.parse`. `SURFACE_SOURCES` is read from source rather than imported specifically to avoid pulling in Express/Mongoose/i18next.
- **Regex fragility is the known risk.** If a spelling changes and a regex stops matching, the check passes vacuously. Mitigations: the `SURFACE_SOURCES` parse is guarded with an `expect` that would fail on an empty table, and `SHARED_DECLARATION_FILES` makes the factory chain explicit rather than relying on a single pattern.
- **Inline handlers are skipped.** Routes whose handler is a one-liner with no `readInput` call (e.g. `GET /`, `GET /observability/*`) appear in `MountedRoute` with `controller: undefined` and are excluded from the sources comparison.
- **Disabled modules are invisible.** A module folder present on disk but absent from `enabledModules` is never scanned, matching what actually ships.
