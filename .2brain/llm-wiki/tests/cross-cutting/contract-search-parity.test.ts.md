---
source: tests/cross-cutting/contract-search-parity.test.ts
sha256: 94ebcbbb9d4f85143cac256d6638870eceb70a55ceb0566b9a058f863db83a1f
generated_at: 2026-10-15T12:37:22.117499+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-search-parity.test.ts

## Purpose

Contract test that verifies the two spellings of each resource's search endpoint (`GET /{resource}?…` and `POST /{resource}/search`) declare identical validation constraints in the OpenAPI spec. It exists because query parameters and body properties live in different parts of the document, so a constraint added to one spelling is silently missing from the other — a drift the response-parity test (`contract-aliases.test.ts`) cannot catch.

## Key elements

- **`resolve(node)`** — follows local `#/…` JSON pointers within the inlined OpenAPI bundle; no I/O needed.
- **`constraints(schema)`** — extracts the validation shape (`type`, `format`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`) and serializes it to a string so failures print both sides. Returns the literal string `'ABSENT'` when the schema is missing.
- **`searchPairs`** (IIFE) — discovers every `POST …/search` operation, resolves its `x-alias-of` `operationId` to the sibling `GET` route, and returns `{ searchRoute, listRoute, post }` tuples. Pairs whose alias target is not found are filtered out.
- **`describe › 'found every search pair'`** — asserts the discovered set matches the expected six modules (`example`, `feedback`, `orders`, `payments`, `products`, `users`) filtered by `isDeployed`. Acts as a tripwire: if the discovery regex stops matching, every subsequent case would be vacuous.
- **`it.each(searchPairs)`** — for each pair, builds a `Map` of query-parameter schemas (from `GET` `parameters`) and a `Map` of body-property schemas (from `POST` `requestBody`), then asserts the union of keys yields zero divergent constraint strings.

## Relationships

- **`tests/support/paths.ts`** — provides `isDeployed(module)`, used to filter the expected-pair list to modules that are actually deployed in the current environment.
- **`openapi.yaml`** (project root, resolved relative to the test file) — the sole data source; the entire test reads and cross-references this single bundle. No other test or source file is imported.

## Notes

- The test intentionally excludes `description` and `default` from comparison: prose differs legitimately between spellings, and `normalizePagination` owns defaults for both.
- A filter present in one spelling but absent in the other is a hard failure (`'ABSENT'` on one side), not just a constraint mismatch.
- Discovery is annotation-driven (`x-alias-of`); adding a new search pair to the spec is automatically covered without editing this file, but removing the annotation or renaming the route pattern will silently drop the pair from the `it.each` set (caught only by the first "found every search pair" assertion).
- The spec is parsed once at module-load time via `readFileSync`; the test has no network, broker, or cluster dependencies despite appearing alongside integration suites in the graph.
