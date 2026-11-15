---
source: tests/cross-cutting/contract-search-parity.test.ts
sha256: b2c1190b8277267b6d0b1c3b6b560f765604e8dd1c772c5cdf74235efd945c34
generated_at: 2026-11-14T23:02:49.676546+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-search-parity.test.ts

## Purpose

Parses the project's single OpenAPI bundle and asserts that every `x-alias-of` pair (e.g. `GET /products` vs `POST /products/search`) declares **identical validation constraints** on its filters and returns the **same success status + response schema**. It exists to catch the structural drift that arises naturally when the same filter is declared in two different places in the spec (query parameters vs. request-body properties).

## Key elements

- **`spec`** – The entire `openapi.yaml` (six levels up), parsed once with `yaml.parse`.
- **`resolve(node)`** – Follows local `#/…` `$ref` pointers by walking the inlined bundle; no I/O needed.
- **`constraints(schema)`** – Projects a schema object down to validation-relevant keys (`type`, `format`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`) and serialises to a string for printable diff output. Returns `'ABSENT'` for `undefined`.
- **`searchPairs`** (IIFE) – Discovers every `POST …/search` route whose operation carries `x-alias-of`, then resolves the canonical GET list route via `operationId`.
- **`aliases`** (IIFE) – Broader discovery: *all* operations with `x-alias-of`, mapped to their canonical counterpart.
- **`successShape(operation)`** – Returns the first `2xx` status code plus its `application/json` response schema as one comparable string (excludes `description`).
- **`describe('a search accepts the same filters…')`** – For each discovered pair, compares every query-parameter schema against the matching request-body property schema via `constraints`; also includes a guard test that the expected set of routes (filtered by `isDeployed`) was actually found.
- **`describe('an alias answers like its canonical')`** – For every alias, asserts the canonical `operationId` exists and that `successShape` matches between alias and canonical. Includes a guard that >3 aliases were discovered.

## Relationships

- **`tests/support/paths.ts`** – Imported as `@tests/paths`; provides `isDeployed(module)` which gates which `/search` routes the "found every search pair" test expects, so the suite adapts to partial deployments.

## Notes

- The file reads `openapi.yaml` via a **relative path** (`../../openapi.yaml` from `tests/cross-cutting/`), so it is position-dependent in the directory tree.
- `resolve` handles only **local** `#/…` refs; it assumes the bundle inlines all components. An external file `$ref` would silently return `undefined`.
- `constraints` deliberately **excludes** `description` and `default`. Prose may legitimately differ between the two spellings; defaults are owned by `normalizePagination` at runtime, not by the spec.
- Discovery is dynamic (walks `x-alias-of`), so new pairs are covered without editing this file. The "found" guard tests exist to prevent a broken spec or regex from making all comparison tests pass vacuously on an empty list.
- The `owners` array in the guard test hard-codes the expected set of modules; adding a new searchable resource requires a line here *and* the spec change, otherwise the guard fails.
