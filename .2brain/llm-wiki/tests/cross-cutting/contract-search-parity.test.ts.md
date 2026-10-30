---
source: tests/cross-cutting/contract-search-parity.test.ts
sha256: 0862e1590a8a707bfb78030d76055631a24827944228306707bc02e3e8e8ecbe
generated_at: 2026-10-29T06:45:14.980450+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-search-parity.test.ts

## Purpose

Guarantees that the two spellings of a search operation — `GET /{resource}` (query parameters) and `POST /{resource}/search` (JSON body) — declare **identical validation constraints** on every filter. It exists to catch structural drift where a constraint added to one spelling is missing or differs in the other, a class of bug that contract-alias tests (which only verify that both routes *answer* alike) cannot detect.

## Key elements

- **`resolve`** — Resolves local `#/…` JSON-pointer `$ref` values against the inlined OpenAPI bundle; no I/O needed.
- **`constraints`** — Projects a schema object onto its validation-relevant properties (`type`, `enum`, `format`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`) and returns a stable JSON string. Returns the literal string `'ABSENT'` for a missing schema so a one-sided filter is a visible diff.
- **`searchPairs`** (module-level IIFE) — Walks `spec.paths`, finds every route ending in `/search` with a `post` operation that carries `x-alias-of`, and maps it back to its `GET` list route via `operationId`.
- **`it('found every search pair')`** — Asserts the discovered set matches the expected modules (filtered by `isDeployed`), so a new module or a broken `x-alias-of` fails loudly rather than silently skipping.
- **`it.each(searchPairs)(…)`** — For each pair, builds a `Map` of query-parameter schemas and a `Map` of body-property schemas, then asserts the union of filter names has identical constraint strings on both sides.

## Relationships

- **`tests/support/paths.ts`** — Imports `isDeployed` to determine which resource modules should appear in the expected-pair list.
- **`../../openapi.yaml`** (not a graph neighbor, but the sole data dependency) — Read once at module scope; all `resolve` calls operate on this in-memory object.

## Notes

- Compares **validation shape only**. `description` and `default` are deliberately excluded: prose legitimately differs between spellings, and `normalizePagination` owns defaults for both.
- A filter **present in one spelling but absent in the other** is a failure (rendered as `'ABSENT'` vs. a real schema), matching the original `GET /products` bug described in the header comment.
- Discovery is fully dynamic via `x-alias-of`; the only manual list is the `owners` array in the first `it` block. Adding a new searchable module requires updating **both** the OpenAPI spec and that array.
- The OpenAPI file is parsed with the `yaml` package and resolved locally; there is no shared spec-loading utility, so path assumptions (`../../openapi.yaml`) are specific to this file's location.
