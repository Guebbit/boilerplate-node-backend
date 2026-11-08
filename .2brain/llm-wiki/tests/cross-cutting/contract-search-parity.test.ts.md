---
source: tests/cross-cutting/contract-search-parity.test.ts
sha256: d02cd29dbe9ee2fc3d5eafaae56d06c0cd3f5c6b25e35d5150d70c16ee4fbfab
generated_at: 2026-11-08T09:26:10.149357+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-search-parity.test.ts

## Purpose

Verifies that for every `x-alias-of` pair where the alias is a `POST …/search`, the query-parameter schema on the `GET` route and the request-body schema on the `POST` route declare identical validation constraints (type, enum, bounds, length, format). Catches the case where one spelling silently diverges—e.g. `status` documented as open on one route and a four-value enum on the other—without needing to execute either endpoint.

## Key elements

- **`resolve(node)`** — follows local `#/…` JSON pointers within the inlined OpenAPI bundle; no I/O needed.
- **`constraints(schema)`** — extracts the validation-relevant keys (type, format, enum, minimum/maximum, minLength/maxLength, pattern) and returns a JSON string for diffable comparison. Returns `'ABSENT'` when the schema is missing entirely.
- **`searchPairs`** (IIFE) — discovers all `POST …/search` routes via the `x-alias-of` extension, then maps each back to its list route using the `operationId → route` index. No hardcoded pair list.
- **`'found every search pair'`** — asserts the discovered set matches the expected set derived from `isDeployed`-filtered module/prefix pairs, so a regex or discovery change that silently drops a pair fails loudly.
- **`'…declare the same filters'`** (`it.each`) — for each pair, builds `Map<name, schema>` for query params and body properties, then asserts the set of divergent names is empty.

## Relationships

- **`tests/support/paths.ts`** — provides `isDeployed(module)` to gate which modules are active in the current environment, used both in the discovery assertion and implicitly in which pairs the test suite covers.

## Notes

- Comparison is **validation shape only**. `description` and `default` are deliberately excluded: prose legitimately differs between routes, and `normalizePagination` owns defaults regardless of spelling.
- A filter present in one spelling but absent in the other is a **failure** (`constraints(undefined)` returns `'ABSENT'`, which will never equal a real constraint string).
- The test reads `openapi.yaml` directly from disk at module-load time (`readFileSync` + `yaml.parse`), not via a compiled artifact or API call. The bundle is assumed to inline all `$ref` targets; `resolve` walks pointers in-memory.
- Discovery is driven by the `x-alias-of` extension on the `POST` operation. If a pair is missed by the discovery walk, the first test (`'found every search pair'`) catches it before the parity checks run vacuously.
