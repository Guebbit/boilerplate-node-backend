---
source: scripts/contracts/extends-map.ts
sha256: 1d70978ebeba14d5f102110b3fdddbabb1f88b171809cfab718753c6fb0adfce
generated_at: 2026-11-08T02:40:40.781665+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/extends-map.ts

## Purpose

Centralizes parsing and validation of a fragment's `x-extends` map so that OpenAPI and AsyncAPI consumers share one implementation. This guarantees that a malformed map, a repeated schema name, or an undeclared variant is rejected identically on both sides rather than being silently dropped in one format and thrown in the other.

## Key elements

- **`parseExtendsMap(declared, where)`** *(exported)* — Validates the raw `x-extends` value is a JSON object whose values are non-empty, duplicate-free lists of strings. Returns a `Record<string, string[]>`. Throws descriptive errors (tagged with `where`) on any violation.
- **`requireDeclared(names, declared, where)`** *(exported)* — Checks that every name in `names` is an own property of `declared` (the fragment's own schemas). Throws on the first undeclared variant.
- **`isObject` / `isStringList`** *(internal)* — Type guards used by `parseExtendsMap`; not exported.

## Relationships

- **`scripts/contracts/openapi-extensions.ts`** — Consumes `parseExtendsMap` and `requireDeclared` when building OpenAPI section fragments, passing an `[openapi] …` label as `where`.
- **`scripts/contracts/asyncapi-section-fragments.ts`** — Consumes the same two functions when building AsyncAPI section fragments, passing an `[asyncapi] …` label.
- **`tests/unit/scripts/contracts/extends-map.test.ts`** — Unit tests covering both exports (happy path, empty list, duplicate entry, non-string item, undeclared variant).

## Notes

- The `where` parameter is purely a human-readable prefix for error messages (e.g. `[openapi] /paths/users.yaml`); it is not used programmatically elsewhere.
- Validation is intentionally strict and fail-fast: the first offending entry throws, so a caller never sees a partially-parsed map.
- `Object.hasOwn` is used (ES2022+) rather than `hasOwnProperty` — the project targets a modern runtime.
- The file contains no I/O, no framework imports, and no side effects; it is safe to import anywhere in the contract pipeline.
