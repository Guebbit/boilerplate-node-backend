---
source: tests/contract/request-sources.test.ts
sha256: 28f760b86881311a04aa266905e3171246b7d3e11e481742c427ccc3b1d14529
generated_at: 2026-09-23T19:52:31.549318+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/request-sources.test.ts

## Purpose

A contract test that statically cross-checks two written claims per operation: what the OpenAPI spec declares a controller may read (`in: path|query`, `requestBody`) and what the controller actually declares via `readInput`/surface. It also verifies that every enabled module in `src/modules.ts` is genuinely reachable through a mounted route. All parsing is regex-based against source text; no server, no Express, no runtime imports.

## Key elements

- **`readMountPrefixes()`** — Reads `src/modules.ts` and `src/app/routes.ts` to build a map of router-file → mount prefix. Only modules listed in `enabledModules` are included.
- **`readControllerImports()`** — Resolves `./controllers/…` bindings in a router file to their absolute file paths.
- **`readMountedRoutes()`** — Walks every router file, extracts `router.method('path', …)` calls, and records method, Express/OpenAPI path, and the terminating controller (last identifier that matches a known import).
- **`readSurfaceSources()`** — Statically parses the `SURFACE_SOURCES` table out of `src/infrastructure/http/request.ts` via regex, returning a `Record<string, RequestInputSource[]>`.
- **`readDeclaredSources()`** — Recursively collects the set of input sources a controller declares, following `surface: '…'` literals, `extractAndValidateId(…)` calls, and shared-factory markers.
- **`SHARED_DECLARATION_FILES`** — Maps factory call-signatures (e.g. `createDeleteController(`) to the file that actually declares the sources, so controllers that delegate to a factory are not seen as declaring nothing.
- **Spec interfaces** (`SpecParameter`, `SpecOperation`, `SpecPathItem`, `Spec`) — Minimal structural types for the slice of `openapi.yaml` this test reads (parameters, `$ref`, `requestBody`).
- **Tripwire assertions** — Explicit `expect` checks that the regex scanners still find non-empty data, guarding against silent vacuous passes if source formatting changes.

## Relationships

- **`src/infrastructure/http/request.ts`** — The test statically reads this file (regex on `SURFACE_SOURCES`) and imports the `RequestInputSource` type from it. It is the authoritative definition of which sources each surface permits; this test enforces that controllers never exceed it.
- **`scripts/contracts/asyncapi-bundles.ts`** — Produces the bundled AsyncAPI/OpenAPI spec document that this test parses and compares against. Changes to how the spec is generated or bundled here directly affect what paths/parameters this test sees.

## Notes

- **Assertion direction is one-way only:** controller-declared sources ⊆ spec-declared sources. The converse (spec declares a source no controller reads) is intentionally *not* asserted because `readInput` merges all keys it finds.
- **Static, not runtime:** The test reads files with `readFileSync` + regex. Importing `request.ts` at runtime would pull in Express/Mongoose/i18next for a four-line literal table, which the test deliberately avoids.
- **Inline handlers are exempt:** `GET /`, `GET /observability/events`, `GET /observability/metrics` are one-line responders with no `readInput`; they are counted as mounted but skipped by the sources check.
- **Enabled-module gate:** A module folder that exists on disk but is absent from the `enabledModules` array is treated as *not mounted* and its routes are excluded — this is the failure mode the test is designed to catch.
- **`extractAndValidateId` counts as a source reader:** Its optional third argument is a surface name; when omitted, it defaults to `'write'`.
