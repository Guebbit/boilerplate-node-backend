---
source: tests/cross-cutting/contract-search-parity.test.ts
sha256: 6b412b274ec7b1a0d78c143c89c2971d27a6d44acb02b953a152b2c8b95f7d31
generated_at: 2026-09-23T19:55:25.538136+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-search-parity.test.ts

## Purpose

Verifies that the two spellings of a search endpoint (e.g. `GET /products?text=x` and `POST /products/search {text}`) declare **identical validation constraints** on every shared filter. It exists because the two spellings live in different parts of the OpenAPI document (query parameters vs. request-body schema), so a constraint can be added to one without touching the other — a structural drift the sibling test `contract-aliases.test.ts` (response parity) does not catch.

## Key elements

- **`spec`** — the parsed `openapi.yaml` bundle (resolved one level up from this file). Serves as the single source of truth for both route spellings.
- **`resolve(node)`** — follows local `#/…` JSON-pointer references within the inlined bundle; no network or filesystem I/O.
- **`constraints(schema)`** — projects a schema to the set of fields a generated validator would enforce (`type`, `format`, `enum`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`) and serialises them to a JSON string. Returns the literal string `"ABSENT"` for `undefined`, so a missing filter is distinguishable from a present one and prints both sides on failure.
- **`searchPairs`** (IIFE) — walks `spec.paths`, collects every route ending in `/search` whose `post` carries an `x-alias-of`, and resolves the alias's `operationId` back to its route via a pre-built map. Returns `{ searchRoute, listRoute, post }` tuples. Discovery is structural (no hard-coded list), so a new pair is covered automatically.
- **`describe` / two `it` blocks** — first asserts the discovered pair set is exactly the four known routes (guards against a broken regex making all cases vacuous); second uses `it.each` to compare the query-parameter map against the body-property map for each pair, reporting per-field divergence strings.

## Relationships

This file has **no direct imports** from any of the listed graph neighbors. It is self-contained, depending only on `node:fs`, `node:path`, `yaml`, and the OpenAPI spec at `../../openapi.yaml`. Its logical sibling is `tests/cross-cutting/contract-aliases.test.ts` (response parity), referenced in the file's docstring.

## Notes

- **Scope boundary:** The comparison covers validation shape only. `description` and `default` are deliberately excluded — prose legitimately differs between the two routes, and `normalizePagination` owns defaulting for both.
- **Missing-filter semantics:** A filter present in one spelling but absent in the other is a **hard failure** (the original `GET /products` bug in `docs/theory/request-input.md`). This is distinct from a constraint mismatch.
- **Discovery guard:** The first test hard-codes the expected four routes. If `x-alias-of` discovery regresses (e.g. a schema change renames the key), the second test would pass vacuously on an empty set; the guard prevents that.
- **`$searchRoute` / `$listRoute` in the `it.each` title** — Jest stringifies the object passed to each case; the keys are read directly from the object rather than destructured in the callback signature.
