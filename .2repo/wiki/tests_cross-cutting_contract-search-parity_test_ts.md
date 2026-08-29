# tests/cross-cutting/contract-search-parity.test.ts

## Purpose

Verifies that the two spellings of a search endpoint (`GET /x?text=…` and `POST /x/search {text}`) declare **identical validation constraints** on every shared filter. It exists to close a gap left by `contract-aliases.test.ts`, which checks that the two routes *answer* alike but says nothing about whether they *ask* alike. The original drift it prevents: one spelling documents a field as an open `type: string` while the other constrains it to a four-value `enum`.

## Key elements

- **`spec`** — the full parsed `openapi.yaml` bundle (loaded via `readFileSync` + `yaml.parse`), needed so `$ref` resolution stays in-memory.
- **`resolve(node)`** — recursively follows local `#/…` JSON-pointer references against `spec`; no I/O, no external resolver.
- **`constraints(schema)`** — projects a schema onto the fields a validator would enforce (`type`, `format`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`) and returns a `JSON.stringify` string (or `'ABSENT'`). String form means a test failure prints both sides side-by-side.
- **`searchPairs`** (IIFE) — discovers every `POST …/search` route whose operation carries an `x-alias-of` pointing to a `GET` route. Returns `{ searchRoute, listRoute, post }` triples. Discovery-by-walk means a newly added pair is covered automatically.
- **`it('found every search pair', …)`** — asserts the discovered set is exactly `[/feedback/search, /orders/search, /products/search, /users/search]`. Acts as a vacuous-test guard: if `x-alias-of` discovery regresses, this fails rather than silently skipping all parity checks.
- **`it.each(searchPairs)(…)`** — for each pair, builds a `Map` of query-parameter schemas (from the `GET` operation's `parameters`) and a `Map` of body-property schemas (from the `POST` requestBody's JSON schema), resolves all `$ref`s, then asserts the union of filter names has identical `constraints()` on both sides. A filter present in only one spelling is a failure.

## Relationships

This file is self-contained at the code level: it imports only `node:fs`, `node:path`, and `yaml`. None of the listed graph neighbors are imported or called. The relationship is thematic (shared contract-testing concern around OpenAPI fidelity) and structural (all four neighbors and this file orbit the same `openapi.yaml` and the same `x-alias-of` convention), not a code-level dependency.

## Notes

- **What is compared vs. what is not:** validation shape only. `description` and `default` are deliberately excluded — prose legitimately differs between the two routes, and `normalizePagination` owns defaults for both.
- **Asymmetry is a failure, not a skip:** if a filter name exists in the query map but not the body map (or vice-versa), it appears in the `divergent` array as `ABSENT` on one side and fails the assertion. This is the exact shape of the `GET /products` bug referenced in `docs/theory/request-input.md`.
- **Path resolution:** `openapi.yaml` is read from `__dirname/../../openapi.yaml` (i.e. the repo root). The file will fail at import time if the spec is moved without updating this path.
- **`resolve` is naive:** it follows `$ref` segments one level at a time and recurses, so it handles chained refs but assumes every referenced segment is a plain object (no array-index refs like `#/…/0`).
